import * as THREE from 'three';
import { loadGameData } from '../data/loader';
import { SaveManager } from '../data/saveManager';
import { applyMetaModifiers } from '../engine/metaModifiers';
import { newSave, settleRun, type SaveData } from '../engine/progression';
import { Simulation } from '../engine/simulation';
import { AbilityBar } from '../ui/dom/abilityBar';
import { BubbleLayer, bubbleActions } from '../ui/dom/bubbles';
import { DomJoystick } from '../ui/dom/joystick';
import { RunOverlay } from '../ui/dom/runOverlay';
import { MapSelectScreen, MetaTreeScreen, screensCss } from '../ui/dom/screens';
import { ModelViewFactory, UNIT_HEIGHT } from './entityViews';
import { FxLayer } from './fx';
import { InstancedEntities } from './instancedEntities';
import { MountAnimator } from './mountAnimator';
import { buildWorld, simToWorld, type World } from './world';

/**
 * The 3D build (MG.5): map select → run → results → back, with the meta tree
 * and persistence wired through.
 *
 * Data flows one way in each direction: input writes to the sim, the sim
 * decides, the renderer reads. The meta tree stays a pure data transform
 * applied *before* the Simulation exists, so the engine never learns it is
 * there — the same contract the Phaser build holds.
 */

const PIXEL_RATIO_CAP = 2;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;

const data = loadGameData();
const saves = new SaveManager();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const views = new ModelViewFactory(data.models);
const entityGroup = new THREE.Group();
scene.add(entityGroup);

// ─── Style ───

const style = document.createElement('style');
style.textContent =
  DomJoystick.css() +
  BubbleLayer.css() +
  AbilityBar.css() +
  RunOverlay.css() +
  screensCss() +
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
hud.style.display = 'none';
const topbar = document.createElement('div');
topbar.id = 'topbar';
const startBtn = document.createElement('button');
startBtn.id = 'startbtn';
startBtn.setAttribute('data-ui', '');
startBtn.textContent = 'Start wave';
hud.append(topbar, startBtn);
overlay.append(hud);

const joystick = new DomJoystick(canvas, overlay);
const bubbles = new BubbleLayer(hud);
const runOverlay = new RunOverlay(overlay);
const bubbleScreens: Array<{ x: number; y: number }> = [];

// ─── Run state ───

let save: SaveData = newSave();
let world: World | null = null;
let fx: FxLayer | null = null;
let instanced: InstancedEntities | null = null;
let sim: Simulation | null = null;
let abilityBar: AbilityBar | null = null;
let activeMapId: string | null = null;
/** Which mode the active run is in — endless scores by waves survived, not stars. */
let activeEndless = false;
let leaks = 0;
let settled = false;

const enemyViews = new Map<number, { modelId: string; object: THREE.Object3D }>();
const towerViews = new Map<string, { modelId: string; object: THREE.Object3D }>();
const towerModelById = new Map(data.towers.towers.map((t) => [t.id, t.model]));
const seen = new Set<number>();
/** enemy id → sim-time at which its hit flash expires. */
const flashUntil = new Map<number, number>();
const FLASH_SECONDS = 0.08;
let simClock = 0;
const scratch = new THREE.Vector3();
const projected = new THREE.Vector3();
let heroView: THREE.Object3D | undefined;
/** Previous frame's hero world position, for deriving speed. */
let heroLastX: number | undefined;
let heroLastZ: number | undefined;
const mountAnim = new MountAnimator(UNIT_HEIGHT);
/** Dev-only size probe — see where it is applied. Absent unless asked for. */
const heroScaleOverride = (() => {
  const raw = new URLSearchParams(location.search).get('heroScale');
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
})();

const host = {
  data,
  get save(): SaveData {
    return save;
  },
  onPlay: (mapId: string, endless: boolean) => startMap(mapId, endless),
  onSaveChanged: (next: SaveData) => {
    save = next;
    void saves.save(save);
  },
};

const mapSelect = new MapSelectScreen(overlay, host, () => {
  mapSelect.hide();
  metaTree.show();
});
const metaTree = new MetaTreeScreen(overlay, host, () => {
  metaTree.hide();
  mapSelect.show();
});

function releaseViews(): void {
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
  if (heroView) {
    entityGroup.remove(heroView);
    heroView = undefined;
  }
  mountAnim.reset();
  heroLastX = undefined;
  heroLastZ = undefined;
}

function startMap(mapId: string, endless = false): void {
  mapSelect.hide();
  metaTree.hide();
  runOverlay.hide();
  releaseViews();
  world?.dispose();
  fx?.dispose();
  instanced?.dispose();

  // The meta tree rewrites copies of the balance data before the sim exists.
  const modded = applyMetaModifiers(
    { hero: data.hero, economy: data.economy, towers: data.towers, map: data.maps[mapId]! },
    data.metaTree,
    save.meta.ranks,
  );

  activeMapId = mapId;
  activeEndless = endless;
  leaks = 0;
  settled = false;
  world = buildWorld(modded.map, scene, views);
  fx = new FxLayer(scene, modded.map);
  instanced = new InstancedEntities(scene, modded.map, modded.map.camera.elevation);

  sim = new Simulation({
    enemies: data.enemies,
    map: modded.map,
    // Cloned, never shared. Endless appends generated waves onto the wave set
    // as it runs, so handing over the loaded copy would leave those waves
    // permanently attached to the map and corrupt the next campaign run.
    waveSet: structuredClone(data.waveSets[mapId]!),
    hero: modded.hero,
    economy: modded.economy,
    towers: modded.towers,
    abilities: data.abilities,
    unlockedAbilityIds: modded.unlockedAbilityIds,
    endless,
  });
  sim.enemySystem.onReachEnd.push(() => leaks++);
  flashUntil.clear();
  simClock = 0;
  sim.enemySystem.onDamaged.push((e) => flashUntil.set(e.id, simClock + FLASH_SECONDS));
  fx.attach(sim);

  abilityBar?.destroy();
  abilityBar = new AbilityBar(sim, overlay);

  const heroModel = modded.hero.model;
  heroView = heroModel ? views.acquire(heroModel) : undefined;
  if (heroView) {
    // ?heroScale=1.2 replaces the manifest scale for this load only. How big
    // the hero should read against the roster is a judgement that can only be
    // made by eye on a real device, and typing a URL is the one way to make
    // that judgement on a phone without a rebuild.
    //
    // Divided by the manifest value so the number is absolute and directly
    // comparable to models.json — ?heroScale=1.35 reproduces what ships.
    // Multiplying instead would make the same URL mean different sizes as the
    // manifest changed, which is exactly the confusion this is meant to avoid.
    if (heroScaleOverride !== undefined && heroModel) {
      heroView.scale.setScalar(heroScaleOverride / (views.scaleOf(heroModel) || 1));
    }
    entityGroup.add(heroView);
  }

  hud.style.display = '';
  resize();
}

function toMapSelect(): void {
  releaseViews();
  world?.dispose();
  fx?.dispose();
  instanced?.dispose();
  world = null;
  fx = null;
  instanced = null;
  sim = null;
  abilityBar?.destroy();
  abilityBar = null;
  activeMapId = null;
  hud.style.display = 'none';
  runOverlay.hide();
  mapSelect.show();
}

runOverlay.onRestart = () => {
  if (activeMapId) startMap(activeMapId, activeEndless);
};
runOverlay.onExit = () => toMapSelect();
startBtn.addEventListener('click', () => {
  if (!sim?.startNextWave()) return;
  // Announce special waves — the banner is what makes a Horde feel like one.
  const archetypeId = sim.waveRunner.currentWaveData?.archetypeId;
  if (!archetypeId) return;
  const archetype = data.archetypes.find((a) => a.id === archetypeId);
  if (archetype) runOverlay.banner(archetype.name, archetype.subtitle);
});

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  world?.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// ─── Loop ───

let last = performance.now();
let fps = 0;
let frames = 0;
let fpsStart = last;

function step(dt: number): void {
  if (!sim || !world || !fx) return;
  const map = world.map;

  sim.hero.input.x = joystick.value.x;
  sim.hero.input.y = joystick.value.y;
  // ×2 is a tick multiplier on the fixed-timestep sim — it cannot desync
  // anything, because the tick size itself never changes.
  if (sim.phase !== 'done' && sim.phase !== 'defeat') {
    const scaled = dt * runOverlay.speed;
    simClock += scaled;
    sim.advance(scaled);
  }

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
    if (e.facingX !== 0 || e.facingY !== 0) entry.object.rotation.y = Math.atan2(e.facingX, e.facingY);
    entry.object.visible = true;

    // Engine state -> logical animation state. The manifest maps that to a
    // clip name; nothing here knows what the clips are called.
    views.setState(entry.object, e.state === 'walking' ? 'walk' : 'siege');

    // Hit flash — a white blink is how a hit reads before the HP bar moves.
    const until = flashUntil.get(e.id);
    if (until !== undefined) {
      if (simClock < until) views.setFlash(entry.object, true);
      else {
        views.setFlash(entry.object, false);
        flashUntil.delete(e.id);
      }
    }
  }
  for (const [id, entry] of enemyViews) {
    if (seen.has(id)) continue;
    // Clear any flash before pooling, or the next user of this view inherits it.
    views.setFlash(entry.object, false);
    flashUntil.delete(id);
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

    // Speed from world-space travel rather than a sim field: it costs nothing,
    // needs no engine change, and picks up the charge multiplier for free.
    const travelled = heroLastX === undefined
      ? 0
      : Math.hypot(scratch.x - heroLastX, scratch.z - heroLastZ!);
    heroLastX = scratch.x;
    heroLastZ = scratch.z;
    const heroSpeed = dt > 0 ? travelled / dt : 0;

    // Face the true heading, not the sprite-mirror flag — see HeroSystem. The
    // animator springs toward it rather than snapping, and layers gait bob,
    // pitch and bank on top; a fused horse-and-rider mesh cannot be skinned, so
    // all of its motion lives here.
    mountAnim.update(
      heroView,
      dt,
      sim.hero.headingX,
      sim.hero.headingY,
      heroSpeed,
    );
    views.setState(heroView, sim.hero.moving ? 'walk' : 'idle');
  }

  views.tick(dt * runOverlay.speed);
  instanced?.update(sim, dt);
  fx.update(sim, world.camera, dt);
  renderer.render(scene, world.camera);
}

/** Persist the run exactly once when it resolves. */
function settleIfNeeded(): void {
  if (!sim || settled || !activeMapId) return;
  if (sim.phase !== 'done' && sim.phase !== 'defeat') return;
  settled = true;
  const result = settleRun(
    save,
    {
      mapId: activeMapId,
      victory: sim.phase === 'done',
      wavesCleared: sim.waveRunner.waveNumber,
      stars: sim.stars(),
      endless: activeEndless,
    },
    data.economy,
  );
  save = result.save;
  void saves.save(save);
}

function syncHud(): void {
  if (!sim || !world) return;
  const bonus = sim.earlyStartBonus();
  startBtn.textContent = sim.phase === 'build' ? (bonus > 0 ? `Start wave +${bonus}` : 'Start wave') : '…';
  startBtn.disabled = sim.phase !== 'build';
  topbar.textContent =
    `${sim.gold}g · gate ${Math.ceil(sim.gate.hp)}/${sim.gate.maxHp} · ` +
    `w${sim.waveRunner.waveNumber}/${sim.waveRunner.totalWaves} · bow L${sim.hero.bowLevel} · ${fps}fps`;

  // Ride close → bubble → tap. Anchors projected from sim space each frame.
  const actions = bubbleActions(sim, world.map);
  bubbleScreens.length = 0;
  for (const a of actions) {
    simToWorld(world.map, a.x, a.y, projected);
    projected.y = 26;
    projected.project(world.camera);
    bubbleScreens.push({
      x: ((projected.x + 1) / 2) * window.innerWidth,
      y: ((-projected.y + 1) / 2) * window.innerHeight,
    });
  }
  bubbles.render(actions, bubbleScreens);
  abilityBar?.sync();
  settleIfNeeded();
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

void (async () => {
  try {
    save = await saves.load();
  } catch {
    // A blocked or broken IndexedDB must never stop someone playing.
    console.warn('[game3d] save unavailable — running on a fresh profile');
  }
  // Models must be resident before acquire() runs mid-frame. Map select
  // covers the wait, so it is invisible.
  await views.preload();

  const requested = new URLSearchParams(location.search).get('map');
  if (requested && data.maps[requested]) startMap(requested);
  else mapSelect.show();
  requestAnimationFrame(frame);
})();

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).game3d = {
    get sim() {
      return sim;
    },
    get save() {
      return save;
    },
    get world() {
      return world;
    },
    views,
    renderer,
    // Exposed for tuning mount motion — the constants in DEFAULT_MOUNT_MOTION
    // are only judgeable in motion on a real device, not from a spec.
    get heroView() {
      return heroView;
    },
    mountAnim,
    step,
    syncHud,
    joystick,
    runOverlay,
    startMap,
    toMapSelect,
    data,
    /** Headless checks need a way to drive the save through the real channel. */
    setSave: (next: SaveData) => host.onSaveChanged(next),
  };
}
