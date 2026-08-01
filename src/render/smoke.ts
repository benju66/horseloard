import * as THREE from 'three';
import { makePaletteTexture, tintGeometry } from './palette';

/**
 * MG.2 render smoke test — the toolchain proof AND the early perf gate.
 *
 * The plan's acceptance criterion is "60fps spinning cube with shadow on your
 * phone", which proves Vite + three + the device loop work. That is necessary
 * but not the thing that can kill this migration: what can kill it is 40+
 * animated, shadow-casting characters at 60fps on a 2021 mid-range Android.
 * So the crowd is here too, and it is tappable — cycle 0 → 40 → 80 → 120 and
 * find the cliff while falling back to the Phaser branch is still free.
 *
 * HONEST LIMITATION: these are plain Meshes, not SkinnedMeshes. This measures
 * draw calls, shadow-map cost, and per-frame transform churn — not skinning.
 * Real rigged models land at MG.4 and the number will move. Treat a pass here
 * as "not obviously doomed", not as "budget met".
 *
 * Dev-only: served at /smoke3d.html by `npm run dev`. Not in the PWA build.
 */

const CROWD_STEPS = [0, 40, 80, 120];
const GROUND_SIZE = 420; // matches the maps' world width
const PIXEL_RATIO_CAP = 2;

// Palette slots (see palette.ts)
const SLOT_GRASS = 0;
const SLOT_PATH = 2;
const SLOT_HERO = 9;
const SLOT_ENEMY = 10;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const readout = document.getElementById('readout') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // soft, per Part A.1

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a2618'); // matches the PWA theme colour

// ─── Camera: fixed ortho, high angle, slight yaw, portrait framing ───

const FRUSTUM_HEIGHT = 520;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
camera.position.set(260, 420, 380); // ~48° elevation with a little yaw
camera.lookAt(0, 0, 40);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;
  camera.left = (-FRUSTUM_HEIGHT * aspect) / 2;
  camera.right = (FRUSTUM_HEIGHT * aspect) / 2;
  camera.top = FRUSTUM_HEIGHT / 2;
  camera.bottom = -FRUSTUM_HEIGHT / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

// ─── Dusk lighting: cool ambient over terrain, warm sun on the play area ───

scene.add(new THREE.HemisphereLight('#8fb6d9', '#2c3a2a', 1.1));

const sun = new THREE.DirectionalLight('#ffd9a0', 1.9);
sun.position.set(-180, 320, 160);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const s = sun.shadow.camera;
s.left = -260;
s.right = 260;
s.top = 260;
s.bottom = -260;
s.near = 10;
s.far = 900;
sun.shadow.bias = -0.0015;
scene.add(sun);
scene.add(sun.target);

// ─── Materials: one palette texture, one material, for everything ───

const paletteMap = makePaletteTexture();
const material = new THREE.MeshLambertMaterial({ map: paletteMap });

function palettedBox(w: number, h: number, d: number, slot: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  tintGeometry(geo, slot);
  return geo;
}

// ─── Ground + a stripe of "path" to check the warm-corridor read ───

const ground = new THREE.Mesh(palettedBox(GROUND_SIZE, 4, GROUND_SIZE, SLOT_GRASS), material);
ground.position.y = -2;
ground.receiveShadow = true;
scene.add(ground);

const path = new THREE.Mesh(palettedBox(90, 2, GROUND_SIZE, SLOT_PATH), material);
path.position.set(0, 0.2, 0);
path.receiveShadow = true;
scene.add(path);

// ─── The literal acceptance criterion: one spinning, shadow-casting cube ───

const hero = new THREE.Mesh(palettedBox(34, 34, 34, SLOT_HERO), material);
hero.position.set(0, 22, 60);
hero.castShadow = true;
scene.add(hero);

// ─── The crowd: the test that actually decides the migration ───

const crowdGeometry = palettedBox(16, 30, 16, SLOT_ENEMY);
const crowd: THREE.Mesh[] = [];

function setCrowdSize(n: number): void {
  while (crowd.length < n) {
    const mesh = new THREE.Mesh(crowdGeometry, material);
    mesh.castShadow = true;
    scene.add(mesh);
    crowd.push(mesh);
  }
  while (crowd.length > n) {
    const mesh = crowd.pop()!;
    scene.remove(mesh);
  }
}

let crowdStep = 1; // start at 40 — the number in the perf budget
setCrowdSize(CROWD_STEPS[crowdStep]!);

canvas.addEventListener('pointerdown', () => {
  crowdStep = (crowdStep + 1) % CROWD_STEPS.length;
  setCrowdSize(CROWD_STEPS[crowdStep]!);
});

// ─── Loop ───

// Dev handle: lets a headless check force a frame, and makes draw-call counts
// inspectable from a phone's remote console where there is no profiler.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).smoke3d = {
    renderer,
    scene,
    camera,
    crowd,
    setCrowdSize,
  };
}

let frames = 0;
let fpsWindowStart = performance.now();
let fps = 0;

function animate(nowMs: number): void {
  const t = nowMs / 1000;

  hero.rotation.y = t * 1.2;
  hero.position.y = 22 + Math.sin(t * 3) * 3;

  // Walk the crowd up the path on staggered phases — per-frame transform churn
  // is part of what we're measuring, so this is deliberately not static.
  for (let i = 0; i < crowd.length; i++) {
    const mesh = crowd[i]!;
    const lane = (i % 5) - 2;
    const phase = (t * 0.14 + i / crowd.length) % 1;
    mesh.position.set(lane * 20 + Math.sin(t + i) * 4, 16, -GROUND_SIZE / 2 + phase * GROUND_SIZE);
    mesh.position.y = 16 + Math.abs(Math.sin(t * 6 + i)) * 4; // hop
    mesh.rotation.y = Math.sin(t * 2 + i) * 0.3;
  }

  renderer.render(scene, camera);

  frames++;
  if (nowMs - fpsWindowStart >= 500) {
    fps = Math.round((frames * 1000) / (nowMs - fpsWindowStart));
    frames = 0;
    fpsWindowStart = nowMs;
    readout.textContent =
      `${fps} fps · ${crowd.length} animated casters · ` +
      `${renderer.info.render.calls} draws · tap to cycle`;
    readout.style.color = fps >= 55 ? '#8fe36a' : fps >= 40 ? '#f6c945' : '#ff6b5a';
  }

  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
