import * as THREE from 'three';
import { loadGameData } from '../data/loader';
import { SaveManager } from '../data/saveManager';
import { applyMetaModifiers } from '../engine/metaModifiers';
import { newSave, settleRun, type SaveData } from '../engine/progression';
import { Simulation } from '../engine/simulation';
import { AbilityBar } from '../ui/dom/abilityBar';
import { BubbleLayer, bubbleActions } from '../ui/dom/bubbles';
import { DomJoystick } from '../ui/dom/joystick';
import { DraftOverlay } from '../ui/dom/draftOverlay';
import { RunOverlay } from '../ui/dom/runOverlay';
import { MapSelectScreen, MetaTreeScreen, screensCss } from '../ui/dom/screens';
import { ModelViewFactory, UNIT_HEIGHT } from './entityViews';
import { FxLayer } from './fx';
import { InstancedEntities } from './instancedEntities';
import { MountAnimator } from './mountAnimator';
import { AudioManager } from '../audio/audioManager';
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
// PCFSoft is deprecated in three r185 and silently downgrades to PCF anyway.
// Asking for PCF outright is also the look we want: shadows from a raking sun
// are the main thing giving flat-shaded geometry its form, and a soft blob
// under every unit throws that away.
renderer.shadowMap.type = THREE.PCFShadowMap;
// Without tone mapping the renderer clips anything above 1.0 straight to white,
// which is why a 2.6-intensity key light flattened lit faces into paper. Neutral
// rather than ACESFilmic on purpose: ACES desaturates as it rolls off, and this
// palette is doing the work that a texture usually would.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

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
  DraftOverlay.css() +
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
#mutebtn { position: absolute; top: calc(env(safe-area-inset-top, 6px) + 34px); right: 10px;
  pointer-events: auto; width: 40px; height: 40px; border-radius: 12px; border: 0;
  background: rgba(20,30,24,.6); color: #f2ecdd; font-size: 17px; line-height: 1; }
#mutebtn[data-state="silent"] { background: rgba(150,60,30,.75); }
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

const audio = new AudioManager();
// Browsers refuse to start an AudioContext outside a user gesture, and on iOS
// one created eagerly stays suspended with no way back. Build it on first tap.
for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) {
  window.addEventListener(ev, () => {
    audio.unlock();
    syncMute();
  }, { passive: true });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    audio.unlock();
    syncMute();
  }
});

const muteBtn = document.createElement('button');
muteBtn.id = 'mutebtn';
muteBtn.setAttribute('data-ui', '');
const syncMute = (): void => {
  // Three states, not two. "Wants sound but the context is not running" has to
  // look different from "muted", or a phone with no audio is undiagnosable.
  const status = audio.status;
  muteBtn.textContent = status === 'running' ? '\u{1F50A}' : status === 'off' ? '\u{1F507}' : '\u{1F508}';
  muteBtn.dataset.state = status;
  muteBtn.setAttribute(
    'aria-label',
    status === 'running' ? 'Mute sound' : status === 'off' ? 'Unmute sound' : 'Sound blocked — tap to retry',
  );
};
muteBtn.addEventListener('click', () => {
  audio.unlock();
  audio.setPref('sfx', !audio.preferences.sfx);
  syncMute();
  if (audio.preferences.sfx) audio.play('upgrade');
});
syncMute();
hud.append(muteBtn);

const joystick = new DomJoystick(canvas, overlay);
const bubbles = new BubbleLayer(hud);
const runOverlay = new RunOverlay(overlay);
const draftOverlay = new DraftOverlay(overlay);
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
/** How high airborne enemies ride, in world units — about half a unit height. */
const FLY_HEIGHT = 16;
/** Wingbeat bob amplitude; the phase is offset per entity id so a flock is not synchronised. */
const FLY_BOB = 2.4;
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
    {
      hero: data.hero,
      economy: data.economy,
      towers: data.towers,
      map: data.maps[mapId]!,
      abilities: data.abilities,
    },
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
    abilities: modded.abilities,
    unlockedAbilityIds: modded.unlockedAbilityIds,
    equipSlots: data.equipSlots,
    // Cloned like the wave set: PerkSystem mutates balance data in place, and
    // the loaded pool is shared across every run of the session.
    perks: structuredClone(data.perks),
    endless,
  });
  sim.enemySystem.onReachEnd.push(() => leaks++);
  flashUntil.clear();
  simClock = 0;
  sim.enemySystem.onDamaged.push((e) => flashUntil.set(e.id, simClock + FLASH_SECONDS));
  fx.attach(sim);
  attachAudio(sim);
  audio.startMusic();
  audio.setMusicPhase('calm');
  audio.setMusicBoss(false);

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
  audio.stopMusic();
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
  audio.unlock();
  if (!sim?.startNextWave()) return;
  audio.play('wave-horn');
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
    // Airborne enemies ride above the ground plane, bobbing. This is not
    // decoration: a ground-only tower simply cannot shoot them, and DESIGN §6
    // warns that binary gates read as gotchas when the player cannot see why
    // they lost. The altitude IS the explanation, so it has to be legible at a
    // glance from a fixed overhead camera.
    const lift = e.config.flying
      ? FLY_HEIGHT + Math.sin(simClock * 4 + e.id) * FLY_BOB
      : 0;
    entry.object.position.set(scratch.x, lift, scratch.z);
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

  // Day builds, night defends. The sim already draws this line — it is the same
  // signal the score keys off — so the cycle costs one call and stays honest
  // about what it means rather than running on a timer of its own.
  world.setDaylight(sim.phase === 'wave' ? 0 : 1, dt);

  views.tick(dt * runOverlay.speed);
  audio.frame();
  if (Math.floor(simClock * 2) % 2 === 0) syncMute();
  // Score follows the sim. Boss presence is read as "something with a war cry
  // is alive" — a mechanic, not a content id, so a future boss lights it up
  // without touching this file.
  audio.setMusicPhase(sim.phase === 'wave' ? 'tension' : 'calm');
  audio.setMusicBoss(sim.enemySystem.enemies.some((e) => e.config.warCry !== undefined));
  instanced?.update(sim, dt);
  fx.update(sim, world.camera, dt);
  renderer.render(scene, world.camera);
}

/** Persist the run exactly once when it resolves. */
/**
 * Sim events -> sounds. Render-side only: the sim fires the same events whether
 * anything is listening, so audio can never affect what is true.
 *
 * Sound choice keys off mechanics (blast radius, damage size), never off
 * content ids — the substrate rule applies here as much as anywhere, and a new
 * enemy or tower should sound reasonable the day its JSON lands.
 */
function attachAudio(s: Simulation): void {
  s.projectileSystem.onSpawn.push((p) => {
    if (p.fromHero) audio.play('sfx-bow-release');
    else if (p.aoeRadius <= 0) audio.play('sfx-bow-release', 0.88);
  });
  s.projectileSystem.onExplosion.push(() => audio.play('sfx-bombard'));
  s.towerSystem.onAuraPulse.push(() => audio.play('sfx-frost'));

  // Hit weight from the damage number rather than the enemy: a heavy hit is a
  // heavy hit whoever takes it, and this needs no table to maintain.
  s.enemySystem.onDamaged.push((_e, amount) => {
    audio.play(amount >= 25 ? 'sfx-hit-heavy' : 'sfx-hit-light');
  });
  s.enemySystem.onDeath.push(() => audio.play('sfx-hit-heavy', 0.8));
  s.enemySystem.onReachEnd.push(() => audio.play('gate-hit'));
  s.enemySystem.onWarCry.push(() => audio.play('sfx-rally-horn', 0.75));

  s.hero.onStagger.push(() => audio.play('sfx-hit-heavy', 0.7));
  s.economy.onCollect.push(() => audio.playCoin());
  s.towerSystem.onTowerBroken.push(() => audio.play('error'));
  s.abilities.onCast.push((ability) => {
    audio.play(ability.castSfxRef ?? 'sfx-charge');
  });
}

function settleIfNeeded(): void {
  if (!sim || settled || !activeMapId) return;
  if (sim.phase !== 'done' && sim.phase !== 'defeat') return;
  settled = true;
  audio.play(sim.phase === 'done' ? 'victory' : 'defeat');
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
  // Every bubble is a spend; one confirming thunk beats silence on a tap.
  for (const a of actions) {
    const run = a.run;
    a.run = () => {
      audio.play(a.enabled ? 'build' : 'error');
      run();
    };
  }
  bubbles.render(actions, bubbleScreens);
  abilityBar?.sync();
  draftOverlay.sync(sim);
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
    audio,
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
