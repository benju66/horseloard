import * as THREE from 'three';
import { loadGameData } from '../data/loader';
import { Simulation } from '../engine/simulation';
import { buildWorld, simToWorld } from './world';

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

// ─── Debug markers. Pooled — no per-frame allocation (CLAUDE.md #6). ───

const enemyGeo = new THREE.BoxGeometry(1, 1, 1);
const enemyMat = new THREE.MeshLambertMaterial({ color: '#c4452e' });
const eliteMat = new THREE.MeshLambertMaterial({ color: '#f6c945' });
const markerPool: THREE.Mesh[] = [];
const markerGroup = new THREE.Group();
scene.add(markerGroup);

function markerAt(index: number): THREE.Mesh {
  let m = markerPool[index];
  if (!m) {
    m = new THREE.Mesh(enemyGeo, enemyMat);
    m.castShadow = true;
    markerPool[index] = m;
    markerGroup.add(m);
  }
  return m;
}

const hero = new THREE.Mesh(
  new THREE.BoxGeometry(26, 34, 26),
  new THREE.MeshLambertMaterial({ color: '#3b5dc9' }),
);
hero.castShadow = true;
scene.add(hero);

const scratch = new THREE.Vector3();

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

  // Read sim state → place markers. Strictly one-directional.
  const enemies = sim.enemySystem.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!;
    const m = markerAt(i);
    simToWorld(map, e.x, e.y, scratch);
    const size = e.config.radius * 2;
    m.scale.set(size, size * 1.9, size);
    m.position.set(scratch.x, size * 0.95, scratch.z);
    m.material = e.isElite ? eliteMat : enemyMat;
    m.visible = true;
  }
  for (let i = enemies.length; i < markerPool.length; i++) {
    const m = markerPool[i];
    if (m) m.visible = false;
  }

  simToWorld(map, sim.hero.x, sim.hero.y, scratch);
  hero.position.set(scratch.x, 17, scratch.z);

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
    markerPool,
  };
}
