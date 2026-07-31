import * as THREE from 'three';
import type { MapDef } from '../data/schemas';

/**
 * MG.3 — the map, in 3D, entirely from map JSON.
 *
 * Everything here is driven by the MapDef: lane waypoints become an organic
 * path ribbon, plots become markers, the camera and the dusk lighting come from
 * the schema blocks. A new map renders correctly the day its JSON lands, with
 * no edits to this file — the same contract the engine holds.
 *
 * WORLD MAPPING (Part A): the sim stays 2D. Sim (x, y) maps to world
 * (x, 0, z) with the map centred on the origin, so the ground is the XZ plane
 * and every sim distance is still a planar distance. Sim +y (toward the gate)
 * becomes world +z.
 */

/** Sim y grows downward toward the gate; world z does the same. */
export function simToWorld(map: MapDef, x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x - map.world.width / 2, 0, y - map.world.height / 2);
}

/** Deterministic per-map jitter — the same map always dresses identically. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PATH_HALF_WIDTH = 34;
const PATH_WOBBLE = 9; // how far the edge wanders — "never a uniform stroke"
const PATH_Y = 0.35;
const PLOT_RADIUS = 20;
/** Placeholder footprints — keep in sync with buildGate / buildForge. */
const GATE_HALF_WIDTH = 92; // wall half-width plus the corner towers' radius
const GATE_HALF_DEPTH = 22;
const FORGE_HALF = 26;

export interface World {
  readonly group: THREE.Group;
  readonly camera: THREE.OrthographicCamera;
  /** Call on viewport change. */
  resize(width: number, height: number): void;
  dispose(): void;
}

export function buildWorld(map: MapDef, scene: THREE.Scene): World {
  const group = new THREE.Group();
  scene.add(group);

  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const light = map.lighting;
  scene.background = new THREE.Color(light.background);

  // ─── Dusk lighting: cool ambient over the terrain, warm key on the corridor ───

  const hemi = new THREE.HemisphereLight(light.skyColor, light.groundColor, light.ambientIntensity);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(light.sunColor, light.sunIntensity);
  const az = (light.sunAzimuth * Math.PI) / 180;
  const el = (light.sunElevation * Math.PI) / 180;
  const reach = Math.max(map.world.width, map.world.height);
  sun.position.set(
    Math.cos(el) * Math.sin(az) * reach,
    Math.sin(el) * reach,
    Math.cos(el) * Math.cos(az) * reach,
  );
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowCam = sun.shadow.camera;
  shadowCam.left = -reach * 0.6;
  shadowCam.right = reach * 0.6;
  shadowCam.top = reach * 0.6;
  shadowCam.bottom = -reach * 0.6;
  shadowCam.near = 1;
  shadowCam.far = reach * 2.5;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 1.5;
  group.add(sun);
  group.add(sun.target);

  // ─── Ground ───

  const groundMat = track(new THREE.MeshLambertMaterial({ color: light.groundTint }));
  const ground = new THREE.Mesh(
    track(new THREE.PlaneGeometry(map.world.width * 1.6, map.world.height * 1.6)),
    groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ─── Path: an organic ribbon per lane, edges wandering, never a uniform stroke ───

  const pathMat = track(
    new THREE.MeshLambertMaterial({ color: light.pathTint, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  for (const lane of map.lanes) {
    const geo = track(buildPathRibbon(map, lane.waypoints, hashString(map.id + lane.id)));
    const mesh = new THREE.Mesh(geo, pathMat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ─── Plots: flat discs where towers can go ───

  const plotMat = track(new THREE.MeshLambertMaterial({ color: '#6b5a3e' }));
  const plotRimMat = track(new THREE.MeshLambertMaterial({ color: '#8d7850' }));
  const plotGeo = track(new THREE.CylinderGeometry(PLOT_RADIUS, PLOT_RADIUS * 1.05, 4, 12));
  const plotRimGeo = track(new THREE.TorusGeometry(PLOT_RADIUS, 1.6, 6, 16));
  for (const plot of map.plots) {
    const p = simToWorld(map, plot.position.x, plot.position.y);
    const disc = new THREE.Mesh(plotGeo, plotMat);
    disc.position.set(p.x, 2, p.z);
    disc.receiveShadow = true;
    disc.castShadow = true;
    group.add(disc);

    const rim = new THREE.Mesh(plotRimGeo, plotRimMat);
    rim.position.set(p.x, 4.2, p.z);
    rim.rotation.x = -Math.PI / 2;
    group.add(rim);
  }

  // ─── Gate + forge placeholders (real models arrive at MG.4) ───

  group.add(buildGate(map, track));
  group.add(buildForge(map, track));

  // ─── Props: sparse, clustered at path edges, large negative space elsewhere ───

  group.add(buildProps(map, track));

  // ─── Camera ───

  const cam = map.camera;
  const contentCorners = contentBounds(map);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, reach * 4);
  // Centre on the content, not the world rect — an off-centre playfield would
  // otherwise sit lopsided in frame and waste half the zoom budget.
  const target = cam.target
    ? simToWorld(map, cam.target.x, cam.target.y)
    : new THREE.Vector3(
        (contentCorners[0]!.x + contentCorners[3]!.x) / 2,
        0,
        (contentCorners[0]!.z + contentCorners[3]!.z) / 2,
      );
  const camEl = (cam.elevation * Math.PI) / 180;
  const camYaw = (cam.yaw * Math.PI) / 180;
  const dist = reach * 1.5;
  camera.position.set(
    target.x + Math.cos(camEl) * Math.sin(camYaw) * dist,
    Math.sin(camEl) * dist,
    target.z + Math.cos(camEl) * Math.cos(camYaw) * dist,
  );
  camera.lookAt(target);
  sun.target.position.copy(target);

  /**
   * Fit the frame to the map's *content*, not its world rectangle — the far
   * corners are empty grass, and framing them throws away zoom that character
   * readability needs at chibi scale. Solved per-resize, so any phone aspect
   * gets the tightest framing that still shows the whole playfield.
   */
  function resize(width: number, height: number): void {
    const aspect = width / height;
    const apply = (h: number) => {
      camera.left = (-h * aspect) / 2;
      camera.right = (h * aspect) / 2;
      camera.top = h / 2;
      camera.bottom = -h / 2;
      camera.updateProjectionMatrix();
    };

    if (cam.frustumHeight) {
      apply(cam.frustumHeight);
      return;
    }

    // Ortho projection is linear, so one probe gives the exact scale factor.
    const PROBE = 1000;
    apply(PROBE);
    camera.updateMatrixWorld(true);
    let worst = 0;
    const v = new THREE.Vector3();
    for (const c of contentCorners) {
      v.copy(c).project(camera);
      worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y));
    }
    // 0.94 leaves room for notches and the HUD overlay.
    apply(worst > 0 ? (PROBE * worst) / 0.94 : PROBE);
  }

  return {
    group,
    camera,
    resize,
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}

/**
 * A quad strip along the waypoints whose half-width wanders per rib, so the
 * silhouette reads as a worn track rather than a drawn line (Part A.1).
 */
function buildPathRibbon(
  map: MapDef,
  waypoints: readonly { x: number; y: number }[],
  seed: number,
): THREE.BufferGeometry {
  const rng = seededRng(seed);
  const positions: number[] = [];
  const indices: number[] = [];

  // Resample so the wobble has somewhere to happen on long straight runs.
  const dense: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const steps = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 26));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  dense.push(waypoints[waypoints.length - 1]!);

  const v = new THREE.Vector3();
  for (let i = 0; i < dense.length; i++) {
    const cur = dense[i]!;
    const prev = dense[Math.max(0, i - 1)]!;
    const next = dense[Math.min(dense.length - 1, i + 1)]!;
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // perpendicular in sim space
    const px = -dy;
    const py = dx;

    const left = PATH_HALF_WIDTH + (rng() - 0.5) * 2 * PATH_WOBBLE;
    const right = PATH_HALF_WIDTH + (rng() - 0.5) * 2 * PATH_WOBBLE;

    simToWorld(map, cur.x + px * left, cur.y + py * left, v);
    positions.push(v.x, PATH_Y, v.z);
    simToWorld(map, cur.x - px * right, cur.y - py * right, v);
    positions.push(v.x, PATH_Y, v.z);

    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * The AABB of everything the player must be able to see — lanes, plots, gate,
 * forge — padded for the path ribbon and prop dressing. Returned as the four
 * ground-plane corners, ready to project.
 */
function contentBounds(map: MapDef): THREE.Vector3[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  // Per-feature footprints rather than one generous pad. A single large pad
  // inflates the box to the world edges on a 420-wide map and throws away the
  // zoom this function exists to recover — measured at 37% on meadow-road.
  const box = (x: number, y: number, halfW: number, halfH: number) => {
    include(x - halfW, y - halfH);
    include(x + halfW, y + halfH);
  };

  const laneHalf = PATH_HALF_WIDTH + PATH_WOBBLE;
  for (const lane of map.lanes) for (const w of lane.waypoints) box(w.x, w.y, laneHalf, laneHalf);
  for (const plot of map.plots) box(plot.position.x, plot.position.y, PLOT_RADIUS, PLOT_RADIUS);
  box(map.gate.position.x, map.gate.position.y, GATE_HALF_WIDTH, GATE_HALF_DEPTH);
  box(map.forge.position.x, map.forge.position.y, FORGE_HALF, FORGE_HALF);

  // Props are decoration — letting the outermost ones crop at the frame edge is
  // fine, and looks deliberate. They are excluded from the fit on purpose.
  // Spawn waypoints may legitimately sit off-map (schema: "first point may sit
  // off-screen"), so clamp to the world box and let them stay outside the frame.
  minX = Math.max(0, minX);
  maxX = Math.min(map.world.width, maxX);
  minY = Math.max(0, minY);
  maxY = Math.min(map.world.height, maxY);

  return [
    simToWorld(map, minX, minY),
    simToWorld(map, maxX, minY),
    simToWorld(map, minX, maxY),
    simToWorld(map, maxX, maxY),
  ];
}

type Track = <T extends THREE.BufferGeometry | THREE.Material>(x: T) => T;

function buildGate(map: MapDef, track: Track): THREE.Group {
  const g = new THREE.Group();
  const p = simToWorld(map, map.gate.position.x, map.gate.position.y);
  const stone = track(new THREE.MeshLambertMaterial({ color: '#8f8f96' }));
  const stoneDark = track(new THREE.MeshLambertMaterial({ color: '#6a6a72' }));

  const wall = new THREE.Mesh(track(new THREE.BoxGeometry(160, 34, 22)), stone);
  wall.position.set(p.x, 17, p.z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);

  const towerGeo = track(new THREE.CylinderGeometry(17, 20, 58, 8));
  for (const dx of [-72, 72]) {
    const t = new THREE.Mesh(towerGeo, stoneDark);
    t.position.set(p.x + dx, 29, p.z);
    t.castShadow = true;
    g.add(t);
  }
  return g;
}

function buildForge(map: MapDef, track: Track): THREE.Group {
  const g = new THREE.Group();
  const p = simToWorld(map, map.forge.position.x, map.forge.position.y);
  const wood = track(new THREE.MeshLambertMaterial({ color: '#6b4a2b' }));
  const roof = track(new THREE.MeshLambertMaterial({ color: '#44464e' }));

  const hut = new THREE.Mesh(track(new THREE.BoxGeometry(44, 30, 40)), wood);
  hut.position.set(p.x, 15, p.z);
  hut.castShadow = true;
  hut.receiveShadow = true;
  g.add(hut);

  const chimney = new THREE.Mesh(track(new THREE.BoxGeometry(12, 26, 12)), roof);
  chimney.position.set(p.x + 14, 40, p.z - 10);
  chimney.castShadow = true;
  g.add(chimney);
  return g;
}

/**
 * Sparse dressing clustered at the path edges, ~15–25 per map, with large
 * negative space elsewhere. Placement is derived from the lanes themselves and
 * seeded by map id, so a new map dresses itself and always the same way.
 */
function buildProps(map: MapDef, track: Track): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRng(hashString(map.id + ':props'));

  const trunk = track(new THREE.MeshLambertMaterial({ color: '#5b4126' }));
  const foliage = track(new THREE.MeshLambertMaterial({ color: '#37592c' }));
  const rock = track(new THREE.MeshLambertMaterial({ color: '#7c7c84' }));
  const trunkGeo = track(new THREE.CylinderGeometry(3, 4, 18, 6));
  const foliageGeo = track(new THREE.ConeGeometry(15, 34, 7));
  const rockGeo = track(new THREE.DodecahedronGeometry(8, 0));

  const CLUSTERS = 7;
  const PER_CLUSTER = 3;
  const lanes = map.lanes;

  for (let c = 0; c < CLUSTERS; c++) {
    const lane = lanes[Math.floor(rng() * lanes.length)]!;
    const wp = lane.waypoints;
    const i = Math.floor(rng() * (wp.length - 1));
    const a = wp[i]!;
    const b = wp[i + 1]!;
    const t = rng();
    const cx = a.x + (b.x - a.x) * t;
    const cy = a.y + (b.y - a.y) * t;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const side = rng() < 0.5 ? 1 : -1;
    const offset = PATH_HALF_WIDTH + 26 + rng() * 34;

    for (let k = 0; k < PER_CLUSTER; k++) {
      const jx = (rng() - 0.5) * 46;
      const jy = (rng() - 0.5) * 46;
      const sx = cx + -dy * side * offset + jx;
      const sy = cy + dx * side * offset + jy;
      // keep dressing inside the world box
      if (sx < 8 || sx > map.world.width - 8 || sy < 8 || sy > map.world.height - 8) continue;
      const p = simToWorld(map, sx, sy);

      if (rng() < 0.72) {
        const scale = 0.7 + rng() * 0.6;
        const tr = new THREE.Mesh(trunkGeo, trunk);
        tr.position.set(p.x, 9 * scale, p.z);
        tr.scale.setScalar(scale);
        tr.castShadow = true;
        g.add(tr);

        const fo = new THREE.Mesh(foliageGeo, foliage);
        fo.position.set(p.x, (18 + 17) * scale, p.z);
        fo.scale.setScalar(scale);
        fo.castShadow = true;
        g.add(fo);
      } else {
        const scale = 0.6 + rng() * 0.8;
        const r = new THREE.Mesh(rockGeo, rock);
        r.position.set(p.x, 5 * scale, p.z);
        r.scale.setScalar(scale);
        r.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        r.castShadow = true;
        r.receiveShadow = true;
        g.add(r);
      }
    }
  }
  return g;
}
