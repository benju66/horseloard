import * as THREE from 'three';
import { loadGameData } from '../data/loader';
import { Simulation } from '../engine/simulation';
import { buildWorld, simToWorld } from './world';
import { ModelViewFactory } from './entityViews';

/**
 * MG.3 acceptance harness — the map rendered from its JSON, with a REAL
 * `Simulation` ticking behind it and its entities drawn as debug markers.
 *
 * This is the first moment the migration is load-bearing rather than a demo:
 * nothing here reaches into the sim to move anything. The sim decides where
 * every enemy is; this file only reads positions and places boxes. If that
 * separation ever stops being true, the migration has failed quietly.
 *
 * Dev-only. `/world3d.html?map=<id>` — defaults to the first map by campaign order.
 */

const PIXEL_RATIO_CAP = 2;
const AUTO_START_DELAY = 1.2; // seconds of build phase before the next wave rolls

const canvas = document.getElementById('app') as HTMLCanvasElement;
const readout = document.getElementById('readout') as HTMLDivElement;

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

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  world.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// ─── The sim. Identical construction to the phone build; no render awareness. ───

const sim = new Simulation({
  enemies: data.enemies,
  map,
  waveSet: data.waveSets[map.id]!,
  hero: data.hero,
  economy: data.economy,
  towers: data.towers,
  abilities: data.abilities,
  unlockedAbilityIds: data.abilities.map((a) => a.id),
});

// ─── Entity views from the model manifest. Pooled per model id (CLAUDE.md #6). ───

const views = new ModelViewFactory(data.models);
const entityGroup = new THREE.Group();
scene.add(entityGroup);

/** sim entity id → the view currently representing it, and which model it is. */
const activeViews = new Map<number, { modelId: string; object: THREE.Object3D }>();

const HERO_MODEL = data.hero.model;
const heroView = HERO_MODEL ? views.acquire(HERO_MODEL) : undefined;
if (heroView) entityGroup.add(heroView);

const scratch = new THREE.Vector3();
const seenThisFrame = new Set<number>();

// ─── Loop ───

let last = performance.now();
let buildElapsed = 0;
let frames = 0;
let fpsStart = last;
let fps = 0;

/** One frame of work, split out so a headless check can drive it directly. */
function step(dt: number): void {
  // Roll waves automatically so the map plays itself for inspection.
  if (sim.phase === 'build') {
    buildElapsed += dt;
    if (buildElapsed >= AUTO_START_DELAY) {
      sim.startNextWave();
      buildElapsed = 0;
    }
  }
  sim.advance(dt);

  // Read sim state → place views. Strictly one-directional: nothing here
  // writes to the sim, and the sim knows nothing about any of this.
  const enemies = sim.enemySystem.enemies;
  seenThisFrame.clear();
  for (const e of enemies) {
    seenThisFrame.add(e.id);
    let entry = activeViews.get(e.id);
    if (!entry) {
      const modelId = e.config.model;
      if (!modelId) continue; // no model ref yet — nothing to draw
      const object = views.acquire(modelId);
      if (!object) continue;
      entityGroup.add(object);
      entry = { modelId, object };
      activeViews.set(e.id, entry);
    }
    simToWorld(map, e.x, e.y, scratch);
    entry.object.position.set(scratch.x, 0, scratch.z);
    // Face along travel — the sim already tracks a normalised direction.
    if (e.facingX !== 0 || e.facingY !== 0) {
      entry.object.rotation.y = Math.atan2(e.facingX, e.facingY);
    }
    entry.object.visible = true;
  }

  // Retire views whose entity is gone. Pooled, not destroyed.
  for (const [id, entry] of activeViews) {
    if (seenThisFrame.has(id)) continue;
    entityGroup.remove(entry.object);
    views.release(entry.modelId, entry.object);
    activeViews.delete(id);
  }

  simToWorld(map, sim.hero.x, sim.hero.y, scratch);
  if (heroView) {
    heroView.position.set(scratch.x, 0, scratch.z);
    heroView.rotation.y = sim.hero.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  renderer.render(scene, world.camera);
}

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  step(dt);

  frames++;
  if (now - fpsStart >= 500) {
    fps = Math.round((frames * 1000) / (now - fpsStart));
    frames = 0;
    fpsStart = now;
    readout.textContent =
      `${map.name} · ${fps} fps · w${sim.waveRunner.waveNumber}/${sim.waveRunner.totalWaves} ` +
      `· ${sim.enemySystem.aliveCount} alive · gate ${Math.ceil(sim.gate.hp)}/${sim.gate.maxHp} ` +
      `· ${renderer.info.render.calls} draws · ${sim.phase}`;
    readout.style.color = fps >= 55 ? '#8fe36a' : fps >= 40 ? '#f6c945' : '#ff6b5a';
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).world3d = {
    renderer,
    scene,
    sim,
    world,
    map,
    maps,
    step,
    views,
    activeViews,
  };
}
