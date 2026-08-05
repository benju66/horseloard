import * as THREE from 'three';
import { loadGameData } from '../data/loader';
import { SaveManager } from '../data/saveManager';
import {
  careerProgress,
  equipSlots,
  threeStarredMaps,
  newSave,
  settleRun,
  type SaveData,
} from '../engine/progression';
import { SkillTree } from '../engine/skillTree';
import { applyTerrainRule } from '../engine/effects';
import { Simulation } from '../engine/simulation';
import { AbilityBar } from '../ui/dom/abilityBar';
import { BubbleLayer, bubbleActions } from '../ui/dom/bubbles';
import { DomJoystick } from '../ui/dom/joystick';
import { RunOverlay } from '../ui/dom/runOverlay';
import { SettingsPanel } from '../ui/dom/settingsPanel';
import { SettingsStore } from '../ui/settings';
import { LoadoutScreen, MapSelectScreen, SkillTreeScreen, screensCss } from '../ui/dom/screens';
import { ModelViewFactory, UNIT_HEIGHT } from './entityViews';
import { FxLayer } from './fx';
import { InstancedEntities } from './instancedEntities';
import { MountAnimator } from './mountAnimator';
import { AudioManager } from '../audio/audioManager';
import { buildWorld, simToWorld, type World } from './world';

/**
 * The 3D build: map select → tree → run → results → back, with persistence
 * wired through.
 *
 * Data flows one way in each direction: input writes to the sim, the sim
 * decides, the renderer reads. The career tree stays a pure data transform
 * applied *before* the Simulation exists, so the engine never learns it is
 * there — the same contract the meta tree held, and the reason a run's power
 * is fully settled before the first wave starts.
 */

const PIXEL_RATIO_CAP = 2;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;

const data = loadGameData();
const saves = new SaveManager(data.economy);
const skillTree = new SkillTree(data.skillTree);
/**
 * `?points=N` — grants a career level high enough to hold N points, for looking
 * at the tree without grinding to it. Dev convenience, same category as WASD:
 * it never persists, because it writes nothing to the save.
 */
const devPoints = (() => {
  const raw = new URLSearchParams(location.search).get('points');
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, data.skillTree.maxLevel) : 0;
})();

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
  SettingsPanel.css() +
  screensCss() +
  `
#hud { position: fixed; inset: 0; pointer-events: none;
  font: 600 14px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; color: #f2ecdd; }
#topbar { position: absolute; top: env(safe-area-inset-top, 6px); left: 0; right: 0;
  display: flex; gap: 10px; justify-content: center; padding: 8px;
  text-shadow: 0 1px 3px rgba(0,0,0,.85); }
#xpbar { position: absolute; top: calc(env(safe-area-inset-top, 6px) + 30px);
  left: 50%; transform: translateX(-50%); width: min(58vw, 300px); height: 12px;
  border-radius: 7px; background: rgba(20,30,24,.62);
  box-shadow: inset 0 1px 3px rgba(0,0,0,.5); overflow: hidden; }
/* Two fills. The dim one is the career you brought in; the bright one is what
   this run has added, so a run that moves the bar 40% of a level still shows
   you the 40% it moved — which is the whole point when levels are rare. */
#xpfill { position: absolute; inset: 0 auto 0 0; width: 0%;
  background: rgba(110,200,168,.45); transition: width .18s ease-out; }
#xprun { position: absolute; inset: 0 auto 0 0; width: 0%;
  background: linear-gradient(90deg, #6ec8a8, #9fe3b8); transition: width .18s ease-out;
  box-shadow: 0 0 8px rgba(159,227,184,.7); }
#xplabel { position: absolute; inset: 0; display: grid; place-items: center;
  font: 700 9px/1 ui-monospace, monospace; letter-spacing: .06em;
  color: #eafaf1; text-shadow: 0 1px 2px rgba(0,0,0,.7); }
/* Wave payout, floating up off the bar. Reports, never asks. */
/* Live scaling. The other half of making conditional power legible: the tree
   shows what a node *would* be worth, this shows what it *is* worth right now,
   which is the number that teaches you to keep soldiers alive. */
#scalebar { position: absolute; top: calc(env(safe-area-inset-top, 6px) + 46px);
  left: 50%; transform: translateX(-50%); display: flex; gap: 6px; pointer-events: none; }
#scalebar span { padding: 2px 7px; border-radius: 999px; font: 700 10px ui-monospace, monospace;
  background: rgba(20,30,24,.72); color: #9fe3b8; letter-spacing: .03em;
  font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px rgba(0,0,0,.8); }
#scalebar span.hot { color: #f6c945; }
#xptoast { position: absolute; top: calc(env(safe-area-inset-top, 6px) + 46px);
  left: 50%; transform: translateX(-50%); pointer-events: none;
  font: 700 15px ui-monospace, monospace; color: #9fe3b8;
  text-shadow: 0 2px 6px rgba(0,0,0,.8); opacity: 0; }
#xptoast.on { animation: xprise 1.5s ease-out forwards; }
@keyframes xprise {
  0% { opacity: 0; transform: translate(-50%, 6px) scale(.9); }
  18% { opacity: 1; transform: translate(-50%, 0) scale(1); }
  70% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -16px); }
}
/* The level-up moment. Large, brief, and completely non-interactive — this is
   the beat the draft pop-up used to occupy, minus the decision. */
#levelup { position: absolute; top: 26%; left: 50%; transform: translateX(-50%);
  pointer-events: none; text-align: center; opacity: 0; }
#levelup.on { animation: lvlpop 2.2s ease-out forwards; }
#levelup b { display: block; font: 700 34px/1 Georgia, serif; color: #f6c945;
  text-shadow: 0 3px 12px rgba(0,0,0,.85), 0 0 26px rgba(246,201,69,.5); }
#levelup span { display: block; margin-top: 5px; font: 700 12px ui-monospace, monospace;
  letter-spacing: .12em; color: #eafaf1; text-shadow: 0 2px 6px rgba(0,0,0,.9); }
@keyframes lvlpop {
  0% { opacity: 0; transform: translate(-50%, 14px) scale(.86); }
  12% { opacity: 1; transform: translate(-50%, 0) scale(1.06); }
  22% { transform: translate(-50%, 0) scale(1); }
  78% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -10px); }
}
@media (prefers-reduced-motion: reduce) {
  #xptoast.on, #levelup.on { animation-duration: .01ms; opacity: 1; }
}
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
body.left-hand #mutebtn { right: auto; left: 10px; }
`;
document.head.append(style);

const hud = document.createElement('div');
hud.id = 'hud';
hud.style.display = 'none';
const topbar = document.createElement('div');
topbar.id = 'topbar';
/**
 * The XP bar. It sits directly under the top row because it is the *career*
 * read: XP no longer changes anything mid-run (SKILLTREE.md), it banks into the
 * points that buy the tree between runs. That makes the bar a record of what
 * this run is earning rather than a countdown to a card — which is exactly what
 * it should have been all along, since a run's power is now settled before the
 * first wave.
 */
const xpBar = document.createElement('div');
xpBar.id = 'xpbar';
const xpFill = document.createElement('div');
xpFill.id = 'xpfill';
const xpRun = document.createElement('div');
xpRun.id = 'xprun';
const xpLabel = document.createElement('span');
xpLabel.id = 'xplabel';
xpBar.append(xpFill, xpRun, xpLabel);

const scaleBar = document.createElement('div');
scaleBar.id = 'scalebar';
const xpToast = document.createElement('div');
xpToast.id = 'xptoast';
const levelUp = document.createElement('div');
levelUp.id = 'levelup';
const levelUpN = document.createElement('b');
const levelUpSub = document.createElement('span');
levelUp.append(levelUpN, levelUpSub);
const startBtn = document.createElement('button');
startBtn.id = 'startbtn';
startBtn.setAttribute('data-ui', '');
startBtn.textContent = 'Start wave';
hud.append(topbar, xpBar, scaleBar, xpToast, levelUp, startBtn);
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

const settings = new SettingsStore();
const settingsPanel = new SettingsPanel(overlay, audio, settings);
// Handedness is a body class so every fixed element can mirror in CSS alone.
const applyHandedness = (): void => {
  document.body.classList.toggle('left-hand', settings.settings.leftHand);
};
settings.onChange.push(applyHandedness);
applyHandedness();

const joystick = new DomJoystick(canvas, overlay);
const bubbles = new BubbleLayer(hud);
const runOverlay = new RunOverlay(overlay);
const bubbleScreens: Array<{ x: number; y: number }> = [];

// ─── Run state ───

let save: SaveData = newSave();
/**
 * Career level as of the last frame, so a crossing can be detected and
 * announced. The career levels **live during a run** — the points it grants
 * cannot be spent until you are back in the menu, so this informs without ever
 * asking, which is the line the whole redesign is drawn on.
 */
let shownCareerLevel = 1;
let toastTimer = 0;
let bannerTimer = 0;
/** True while the pause sheet is up — the sim freezes, the renderer keeps drawing. */
let paused = false;

/** Fire a one-shot CSS animation by re-adding the class. */
function replay(el: HTMLElement): void {
  el.classList.remove('on');
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add('on');
}
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
    // The dev flag is layered on read rather than written into the save, so
    // looking at a maxed tree can never leave a maxed career on disk.
    if (devPoints > 0) {
      const { base, growth } = data.economy.career.level;
      let xp = 0;
      let need = base;
      for (let lv = 1; lv < devPoints; lv++) {
        xp += need;
        need *= growth;
      }
      return { ...save, careerXp: Math.max(save.careerXp, Math.ceil(xp)) };
    }
    return save;
  },
  onPlay: (mapId: string, endless: boolean) => startMap(mapId, endless),
  onSaveChanged: (next: SaveData) => {
    save = next;
    void saves.save(save);
  },
};

const mapSelect = new MapSelectScreen(
  overlay,
  host,
  () => {
    mapSelect.hide();
    treeScreen.show();
  },
  () => {
    mapSelect.hide();
    loadout.show();
  },
  () => settingsPanel.show(),
);
const treeScreen = new SkillTreeScreen(overlay, host, () => {
  treeScreen.hide();
  mapSelect.show();
});
const loadout = new LoadoutScreen(overlay, host, () => {
  loadout.hide();
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
  treeScreen.hide();
  runOverlay.hide();
  releaseViews();
  world?.dispose();
  fx?.dispose();
  instanced?.dispose();

  // The career build rewrites copies of the balance data before the sim exists.
  // `reconcile` first, because a save may hold nodes a data change has since
  // made unreachable — dropping them here is the difference between a build
  // that quietly grants more than it should and one that matches the screen.
  // The biome's terrain rule folds in before the career build does. Order is
  // deliberate: the rule describes the *place*, so a Wall build's range bonus
  // should apply to the range this place allows, not the other way round.
  const biome = data.biomes.find((b) => b.id === data.maps[mapId]!.biomeId);
  const terrain = applyTerrainRule(
    {
      hero: data.hero,
      economy: data.economy,
      towers: data.towers,
      map: data.maps[mapId]!,
      abilities: data.abilities,
    },
    data.enemies,
    biome?.terrainRule,
  );

  const build = skillTree.reconcile(
    save.build,
    // Reconciling against an unbounded budget on purpose: this drops nodes made
    // *illegal* by a data change, not nodes the career can no longer afford.
    // Refunding for affordability here would silently strip a build the moment
    // a curve was retuned, which is the tree screen's job to surface, not the
    // run's job to do behind the player's back.
    Number.MAX_SAFE_INTEGER,
  );
  const modded = skillTree.applyTo(terrain.data, build);

  activeMapId = mapId;
  activeEndless = endless;
  leaks = 0;
  settled = false;
  paused = false;
  world = buildWorld(modded.map, scene, views);
  fx = new FxLayer(scene, modded.map);
  instanced = new InstancedEntities(scene, modded.map, modded.map.camera.elevation);

  sim = new Simulation({
    enemies: terrain.enemies,
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
    rules: modded.rules,
    scaling: modded.scaling,
    equipSlots: equipSlots(save, data.equipSlots, data.equipSlotGrants),
    loadout: save.loadout,
    lockedTowerIds: data.towers.towers
      .filter((t) => !t.unlockedByDefault && !modded.unlockedTowerIds.includes(t.id))
      .map((t) => t.id),
    endless,
  });
  sim.enemySystem.onReachEnd.push(() => leaks++);
  // What the wave was worth, said out loud. Waves are the natural beat for this
  // — frequent enough to be a rhythm, rare enough not to be noise. The gate
  // suffix makes a clean hold *visible* instead of merely not-punished: stars
  // score on damage taken (DESIGN §3), so this is the star currency ticking.
  const milestoneEvery = data.economy.career.endlessMilestoneEvery;
  const bestAtStart = save.endlessBest[mapId] ?? 0;
  sim.onWaveClear.push((wave, xpEarned, damageTaken) => {
    if (endless && wave % milestoneEvery === 0) {
      const isNews = wave > bestAtStart;
      runOverlay.milestone(
        `Wave ${wave} held`,
        isNews ? `+${data.economy.career.perEndlessMilestone} XP banked` : 'held again — beat your best for more',
      );
    }
    if (xpEarned <= 0) return;
    xpToast.textContent =
      damageTaken > 0 ? `+${xpEarned} XP · −${Math.round(damageTaken)} gate` : `+${xpEarned} XP · gate untouched`;
    replay(xpToast);
    toastTimer = 1.5;
  });
  // First sighting of a species, once per career. The sim reports the run's
  // first encounters; the save's ledger says which are actually news. The
  // ledger itself is written at settle, with the rest of what the run earned.
  sim.onFirstEncounter.push((id) => {
    if (save.seenEnemies.includes(id)) return;
    const def = data.enemies.enemies.find((e) => e.id === id);
    if (def) runOverlay.reveal(def.name, def.intro ?? '');
  });
  shownCareerLevel = careerProgress(save.careerXp, data.economy, data.skillTree.maxLevel).level;
  flashUntil.clear();
  simClock = 0;
  sim.enemySystem.onDamaged.push((e) => flashUntil.set(e.id, simClock + FLASH_SECONDS));
  fx.attach(sim);
  attachAudio(sim);
  attachHaptics(sim);
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
runOverlay.onPauseChange = (p) => {
  paused = p;
};
// Retreat: the run ends by choice. It settles as a defeat — a failed run is
// progress (DESIGN §7), so walking away keeps the kills' XP and the per-wave
// wages rather than silently deleting twenty minutes of fighting.
runOverlay.onRetreat = () => {
  if (sim && activeMapId && !settled) {
    settled = true;
    const result = settleRun(
      save,
      {
        mapId: activeMapId,
        victory: false,
        // A wave in progress was not cleared; only the build phase stands on
        // a finished wave count.
        wavesCleared: sim.phase === 'wave' ? Math.max(0, sim.waveRunner.waveNumber - 1) : sim.waveRunner.waveNumber,
        stars: sim.stars(),
        endless: activeEndless,
      },
      data.economy,
      sim.xp.totalXp,
      sim.encountered,
    );
    save = result.save;
    void saves.save(save);
  }
  toMapSelect();
};
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
  if (!paused && sim.phase !== 'done' && sim.phase !== 'defeat') {
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
    // animator springs toward it rather than snapping. On a fused rigid mesh
    // it also fakes the whole gait; on a rigged horse whose walk clip is
    // mapped, the mixer owns the gait and only yaw/bank remain procedural.
    mountAnim.update(
      heroView,
      dt,
      sim.hero.headingX,
      sim.hero.headingY,
      heroSpeed,
      0,
      views.hasAction(heroView, 'walk'),
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
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) xpToast.classList.remove('on');
  if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) levelUp.classList.remove('on');
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

/**
 * Sim events -> vibration, same one-way contract as audio. Deliberately
 * sparse: haptics are for the *physical* beats — the ones that happen to your
 * body (staggered) or your walls (a leak, a wave held). A phone that buzzes
 * per kill is a phone set to silent by day two.
 */
function attachHaptics(s: Simulation): void {
  s.hero.onStagger.push(() => settings.buzz(45));
  s.enemySystem.onReachEnd.push(() => settings.buzz(20));
  s.onWaveClear.push(() => settings.buzz([12, 40, 12]));
}

function settleIfNeeded(): void {
  if (!sim || settled || !activeMapId) return;
  if (sim.phase !== 'done' && sim.phase !== 'defeat') return;
  settled = true;
  audio.play(sim.phase === 'done' ? 'victory' : 'defeat');
  settings.buzz(sim.phase === 'done' ? [30, 60, 30, 60, 80] : 150);
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
    sim.xp.totalXp,
    sim.encountered,
  );
  const beforeLv = careerProgress(save.careerXp, data.economy, data.skillTree.maxLevel).level;
  save = result.save;
  const afterLv = careerProgress(save.careerXp, data.economy, data.skillTree.maxLevel).level;
  void saves.save(save);
  runOverlay.showReward(
    result.xpEarned,
    afterLv - beforeLv,
    skillTree.free(save.build, skillTree.pointsAt(afterLv, threeStarredMaps(save))),
  );
}

/**
 * The multipliers a build is earning right now.
 *
 * Recomputed rather than cached: these are the same reads `Scaling` makes at
 * damage time, so what the bar says and what the shot does can never drift.
 * Rounded to two places and written only on change, because this runs every
 * frame and a DOM write per frame is the thing that costs a phone its 60fps.
 */
function syncScaleBar(): void {
  if (!sim || sim.scaling.isEmpty) {
    if (scaleBar.childElementCount > 0) scaleBar.replaceChildren();
    return;
  }
  const all: Array<[string, number]> = [
    ['TWR', sim.scaling.towerDamage()],
    ['BOW', sim.scaling.bowDamage(sim.hero.x, sim.hero.y)],
    ['MEN', sim.scaling.soldierDamage()],
  ];
  // Only what is actually paying. A chip reading ×1.00 is a node you took and
  // are getting nothing from, which the tree screen is the place to explain.
  const shown = all.filter(([, v]) => v > 1.001);

  if (shown.length !== scaleBar.childElementCount) {
    scaleBar.replaceChildren(...shown.map(() => document.createElement('span')));
  }
  shown.forEach(([label, value], i) => {
    const el = scaleBar.children[i] as HTMLSpanElement;
    const text = `${label} ×${value.toFixed(2)}`;
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('hot', value >= 1.5);
  });
}

function syncHud(): void {
  if (!sim || !world) return;
  const bonus = sim.earlyStartBonus();
  startBtn.textContent = sim.phase === 'build' ? (bonus > 0 ? `Start wave +${bonus}` : 'Start wave') : '…';
  startBtn.disabled = sim.phase !== 'build';
  topbar.textContent =
    `${sim.gold}g · gate ${Math.ceil(sim.gate.hp)}/${sim.gate.maxHp} · ` +
    `w${sim.waveRunner.waveNumber}/${sim.waveRunner.totalWaves} · bow L${sim.hero.bowLevel} · ${fps}fps`;

  // The career bar, live. Two fills: what you walked in with, and what this run
  // has added on top of it — because at a long career's pace a single run often
  // moves the bar less than a level, and an unsegmented bar would make that look
  // like nothing happened.
  const run = sim.xp.totalXp;
  const before = careerProgress(save.careerXp, data.economy, data.skillTree.maxLevel);
  const now = careerProgress(save.careerXp + run, data.economy, data.skillTree.maxLevel);
  const denom = now.needed > 0 ? now.needed : 1;
  const base = now.level > before.level ? 0 : before.into;
  const basePct = `${Math.min(100, (base / denom) * 100).toFixed(1)}%`;
  const runPct = `${Math.min(100, (now.into / denom) * 100).toFixed(1)}%`;
  if (xpFill.style.width !== basePct) xpFill.style.width = basePct;
  if (xpRun.style.width !== runPct) xpRun.style.width = runPct;

  const label = now.needed > 0 ? `LV ${now.level}  ·  +${run} XP` : `LV ${now.level}  ·  MAX`;
  if (xpLabel.textContent !== label) xpLabel.textContent = label;

  // Live scaling, only for the relationships this build actually holds. A row
  // of ×1.00 chips for nodes you never took would be noise; the bar is empty
  // for a build with no scaling at all.
  syncScaleBar();

  // Crossing a career level mid-run is the beat the draft pop-up used to hold.
  // It announces and vanishes; the point it grants waits in the tree, which is
  // what keeps this feedback rather than a decision.
  if (now.level > shownCareerLevel) {
    const gained = now.level - shownCareerLevel;
    shownCareerLevel = now.level;
    levelUpN.textContent = `LEVEL ${now.level}`;
    levelUpSub.textContent = gained > 1 ? `+${gained} SKILL POINTS` : '+1 SKILL POINT';
    replay(levelUp);
    bannerTimer = 2.2;
    audio.play('upgrade');
  }

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
