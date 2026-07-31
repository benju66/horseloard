import * as THREE from 'three';
import { loadGameData } from '../data/loader';
import { Simulation } from '../engine/simulation';
import { AbilityBar } from '../ui/dom/abilityBar';
import { BubbleLayer, bubbleActions } from '../ui/dom/bubbles';
import { DomJoystick } from '../ui/dom/joystick';
import { RunOverlay } from '../ui/dom/runOverlay';
import { ModelViewFactory } from './entityViews';
import { buildWorld, simToWorld } from './world';
import { FxLayer } from './fx';

/**
 * MG.5 (first slice) — the 3D build you can actually play.
 *
 * Joystick → `HeroSystem.input`, tap a plot to build, tap Start to send the
 * wave. The UI is a DOM overlay above the canvas, per Part A: no in-canvas
 * widgets, and world-anchored labels use world→screen projection.
 *
 * The separation from MG.3 still holds exactly — input writes to the sim, the
 * sim decides everything, the renderer only reads. Dev-only: /game3d.html.
 */

const PIXEL_RATIO_CAP = 2;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;

const data = loadGameData();
const requested = new URLSearchParams(location.search).get('map');
const maps = Object.values(data.maps).sort((a, b) => a.order - b.order);
const map = (requested ? data.maps[requested] : undefined) ?? maps[0]!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const world = buildWorld(map, scene);

let leaks = 0;

function newRun(): Simulation {
  const s = new Simulation({
    enemies: data.enemies,
    map,
    waveSet: data.waveSets[map.id]!,
    hero: data.hero,
    economy: data.economy,
    towers: data.towers,
    abilities: data.abilities,
    unlockedAbilityIds: data.abilities.map((a) => a.id),
  });
  leaks = 0;
  s.enemySystem.onReachEnd.push(() => leaks++);
  return s;
}

const fx = new FxLayer(scene, map);
let sim = newRun();
fx.attach(sim);

// ─── Views ───

const views = new ModelViewFactory(data.models);
const entityGroup = new THREE.Group();
scene.add(entityGroup);

const enemyViews = new Map<number, { modelId: string; object: THREE.Object3D }>();
const towerViews = new Map<string, { modelId: string; object: THREE.Object3D }>();
const seen = new Set<number>();
const scratch = new THREE.Vector3();

const heroModel = data.hero.model;
const heroView = heroModel ? views.acquire(heroModel) : undefined;
if (heroView) entityGroup.add(heroView);

const towerModelById = new Map(data.towers.towers.map((t) => [t.id, t.model]));

// ─── DOM overlay ───

const style = document.createElement('style');
style.textContent =
  DomJoystick.css() +
  BubbleLayer.css() +
  AbilityBar.css() +
  RunOverlay.css() +
  `
#hud { position: fixed; inset: 0; pointer-events: none;
  font: 600 14px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; color: #f2ecdd; }
#topbar { position: absolute; top: env(safe-area-inset-top, 6px); left: 0; right: 0;
  display: flex; gap: 10px; justify-content: center; padding: 8px;
  text-shadow: 0 1px 3px rgba(0,0,0,.85); }
#startbtn { position: absolute; bottom: calc(env(safe-area-inset-bottom, 12px) + 18px);
  left: 50%; transform: translateX(-50%); pointer-events: auto;
  padding: 14px 26px; border-radius: 16px; border: 0;
  background: rgba(46,120,120,.88); color: #f2ecdd; font: 700 16px ui-monospace, monospace;
  box-shadow: 0 4px 14px rgba(0,0,0,.4); }
#startbtn[disabled] { opacity: .35; }
`;
document.head.append(style);

const hud = document.createElement('div');
hud.id = 'hud';
const topbar = document.createElement('div');
topbar.id = 'topbar';
const startBtn = document.createElement('button');
startBtn.id = 'startbtn';
startBtn.setAttribute('data-ui', '');
startBtn.textContent = 'Start wave';
hud.append(topbar, startBtn);
overlay.append(hud);

startBtn.addEventListener('click', () => sim.startNextWave());

const joystick = new DomJoystick(canvas, overlay);

// ─── Contextual bubbles + abilities ───

const bubbles = new BubbleLayer(hud);
const abilityBar = new AbilityBar(sim, overlay);
const runOverlay = new RunOverlay(overlay);

/**
 * A run ends and the next one starts clean. Views are released back to the
 * pool rather than destroyed — the next run reuses the same meshes.
 */
runOverlay.onRestart = () => {
  for (const [id, entry] of enemyViews) {
    entityGroup.remove(entry.object);
    views.release(entry.modelId, entry.object);
    enemyViews.delete(id);
  }
  for (const [plotId, entry] of towerViews) {
    entityGroup.remove(entry.object);
    views.release(entry.modelId, entry.object);
    towerViews.delete(plotId);
  }
  sim = newRun();
  // Sim callback arrays don't survive a rebuild — re-subscribe the FX layer.
  fx.attach(sim);
  abilityBar.setSim(sim);
};
const bubbleScreens: Array<{ x: number; y: number }> = [];

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  world.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// ─── Loop ───

let last = performance.now();
let fps = 0;
let frames = 0;
let fpsStart = last;
const projected = new THREE.Vector3();

function step(dt: number): void {
  // Input → sim. The only direction data flows this way.
  sim.hero.input.x = joystick.value.x;
  sim.hero.input.y = joystick.value.y;
  // ×2 is a tick multiplier on the fixed-timestep sim — nearly free, and it
  // cannot desync anything because the tick size itself never changes.
  if (sim.phase !== 'done' && sim.phase !== 'defeat') {
    sim.advance(dt * runOverlay.speed);
  }

  // Sim → views.
  seen.clear();
  for (const e of sim.enemySystem.enemies) {
    seen.add(e.id);
    let entry = enemyViews.get(e.id);
    if (!entry) {
      const modelId = e.config.model;
      if (!modelId) continue;
      const object = views.acquire(modelId);
      if (!object) continue;
      entityGroup.add(object);
      entry = { modelId, object };
      enemyViews.set(e.id, entry);
    }
    simToWorld(map, e.x, e.y, scratch);
    entry.object.position.set(scratch.x, 0, scratch.z);
    if (e.facingX !== 0 || e.facingY !== 0) {
      entry.object.rotation.y = Math.atan2(e.facingX, e.facingY);
    }
    entry.object.visible = true;
  }
  for (const [id, entry] of enemyViews) {
    if (seen.has(id)) continue;
    entityGroup.remove(entry.object);
    views.release(entry.modelId, entry.object);
    enemyViews.delete(id);
  }

  for (const plot of sim.towerSystem.plots) {
    const existing = towerViews.get(plot.plotId);
    if (plot.towerId === null) {
      if (existing) {
        entityGroup.remove(existing.object);
        views.release(existing.modelId, existing.object);
        towerViews.delete(plot.plotId);
      }
      continue;
    }
    const modelId = towerModelById.get(plot.towerId);
    if (!modelId) continue;
    if (!existing || existing.modelId !== modelId) {
      if (existing) {
        entityGroup.remove(existing.object);
        views.release(existing.modelId, existing.object);
      }
      const object = views.acquire(modelId);
      if (!object) continue;
      entityGroup.add(object);
      towerViews.set(plot.plotId, { modelId, object });
    }
    const view = towerViews.get(plot.plotId)!;
    simToWorld(map, plot.x, plot.y, scratch);
    view.object.position.set(scratch.x, 4, scratch.z);
    // Level reads as height until real per-level models land.
    view.object.scale.setScalar(views.scaleOf(view.modelId) * (0.85 + plot.level * 0.12));
  }

  simToWorld(map, sim.hero.x, sim.hero.y, scratch);
  if (heroView) {
    heroView.position.set(scratch.x, 0, scratch.z);
    heroView.rotation.y = Math.atan2(sim.hero.input.x, sim.hero.input.y) || heroView.rotation.y;
  }

  fx.update(sim, world.camera, dt);
  renderer.render(scene, world.camera);
}

function syncHud(): void {
  const bonus = sim.earlyStartBonus();
  startBtn.textContent = sim.phase === 'build' ? (bonus > 0 ? `Start wave +${bonus}` : 'Start wave') : '…';
  startBtn.disabled = sim.phase !== 'build';
  topbar.textContent =
    `${sim.gold}g · gate ${Math.ceil(sim.gate.hp)}/${sim.gate.maxHp} · ` +
    `w${sim.waveRunner.waveNumber}/${sim.waveRunner.totalWaves} · bow L${sim.hero.bowLevel} · ${fps}fps`;

  // Ride close → bubble → tap. Anchors are projected from sim space each frame.
  const actions = bubbleActions(sim, map);
  bubbleScreens.length = 0;
  for (const a of actions) {
    simToWorld(map, a.x, a.y, projected);
    projected.y = 26;
    projected.project(world.camera);
    bubbleScreens.push({
      x: ((projected.x + 1) / 2) * window.innerWidth,
      y: ((-projected.y + 1) / 2) * window.innerHeight,
    });
  }
  bubbles.render(actions, bubbleScreens);
  abilityBar.sync();
  runOverlay.sync(sim, leaks);
}

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  step(dt);
  frames++;
  if (now - fpsStart >= 400) {
    fps = Math.round((frames * 1000) / (now - fpsStart));
    frames = 0;
    fpsStart = now;
  }
  syncHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).game3d = { get sim() { return sim; }, world, views, renderer, step, syncHud, joystick, map, bubbleActions, runOverlay, fx };
}
