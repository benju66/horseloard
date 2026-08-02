import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LightPreset, MapDef } from '../data/schemas';
import type { ModelViewFactory } from './entityViews';

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

/** How long a full day↔night crossfade takes, in seconds. */
const DAYLIGHT_FADE_SECONDS = 2.2;

export interface World {
  readonly group: THREE.Group;
  readonly camera: THREE.OrthographicCamera;
  /** The map this world was built from — meta-modified, so hold onto it. */
  readonly map: MapDef;
  /** Call on viewport change. */
  resize(width: number, height: number): void;
  /**
   * Drive the day/night cycle. `target` is 1 for day, 0 for night; the world
   * eases toward it so the build→wave transition reads as dusk falling rather
   * than as a light switch. Call every frame.
   */
  setDaylight(target: number, dt: number): void;
  /** Current eased position, 1 = full day. */
  readonly daylight: number;
  dispose(): void;
}

/** Everything the crossfade has to touch, resolved once per preset. */
interface ResolvedLight {
  sky: THREE.Color;
  ground: THREE.Color;
  ambient: number;
  sun: THREE.Color;
  sunIntensity: number;
  sunElevation: number;
  background: THREE.Color;
  fog: THREE.Color;
  fogDensity: number;
  groundTint: THREE.Color;
  pathTint: THREE.Color;
}

function resolveLight(p: LightPreset): ResolvedLight {
  return {
    groundTint: new THREE.Color(p.groundTint),
    pathTint: new THREE.Color(p.pathTint),
    sky: new THREE.Color(p.skyColor),
    ground: new THREE.Color(p.groundColor),
    ambient: p.ambientIntensity,
    sun: new THREE.Color(p.sunColor),
    sunIntensity: p.sunIntensity,
    sunElevation: p.sunElevation,
    background: new THREE.Color(p.background),
    fog: new THREE.Color(p.fogColor),
    fogDensity: p.fogDensity,
  };
}

export function buildWorld(map: MapDef, scene: THREE.Scene, views?: ModelViewFactory): World {
  const group = new THREE.Group();
  scene.add(group);

  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const light = map.lighting;
  const dayLight = resolveLight(light.day);
  const nightLight = resolveLight(light.night);
  const reach = Math.max(map.world.width, map.world.height);
  const az = (light.sunAzimuth * Math.PI) / 180;
  // How far back the ortho camera sits. Shared with the fog, which has to be
  // expressed relative to it — see applyDaylight.
  const camDistance = reach * 1.5;

  // ─── Light: one key, one fill, and the fog that gives the frame depth ───

  const hemi = new THREE.HemisphereLight(dayLight.sky, dayLight.ground, dayLight.ambient);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(dayLight.sun, dayLight.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowCam = sun.shadow.camera;
  // Wide enough for the shadows a raking sun throws, not just for the casters.
  // At 26° a 52-unit pine lays a ~107-unit shadow, and the map half-diagonal is
  // already 443 on a 420x780 board — 0.6 clipped them off at the frame edge.
  shadowCam.left = -reach * 0.78;
  shadowCam.right = reach * 0.78;
  shadowCam.top = reach * 0.78;
  shadowCam.bottom = -reach * 0.78;
  shadowCam.near = 1;
  shadowCam.far = reach * 3;
  // Tuned for a low sun: the old normalBias of 1.5 was set against a 50°
  // key and detaches shadows from their casters once the sun rakes.
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.7;
  group.add(sun);
  group.add(sun.target);

  scene.background = new THREE.Color().copy(dayLight.background);
  scene.fog = new THREE.Fog(dayLight.fog.getHex(), 1, 2);

  /** Position the key from an elevation, holding the shared azimuth. */
  function aimSun(elevationDeg: number): void {
    const el = (elevationDeg * Math.PI) / 180;
    sun.position.set(
      Math.cos(el) * Math.sin(az) * reach,
      Math.sin(el) * reach,
      Math.cos(el) * Math.cos(az) * reach,
    );
  }

  let daylight = 1;
  const scratchColor = new THREE.Color();

  /**
   * Apply the crossfade. Colours lerp in place; nothing here allocates, because
   * this runs every frame.
   */
  function applyDaylight(): void {
    const t = daylight;
    const a = nightLight;
    const b = dayLight;
    hemi.color.lerpColors(a.sky, b.sky, t);
    hemi.groundColor.lerpColors(a.ground, b.ground, t);
    hemi.intensity = a.ambient + (b.ambient - a.ambient) * t;
    sun.color.lerpColors(a.sun, b.sun, t);
    sun.intensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t;
    aimSun(a.sunElevation + (b.sunElevation - a.sunElevation) * t);

    scratchColor.lerpColors(a.background, b.background, t);
    (scene.background as THREE.Color).copy(scratchColor);

    // Terrain albedo shifts with the light — see the schema's note on why a
    // night built from lights alone can only ever land on "dusk". Declared
    // later in this function; only ever read from here, after construction.
    groundMat.color.lerpColors(a.groundTint, b.groundTint, t);
    pathMat.color.lerpColors(a.pathTint, b.pathTint, t);

    const fog = scene.fog as THREE.Fog;
    scratchColor.lerpColors(a.fog, b.fog, t);
    fog.color.copy(scratchColor);
    // Fog is view-space depth, and an orthographic camera sits a long way back —
    // so the range has to be anchored to the camera distance, not to the origin.
    // Anchored at 0 the *entire* playfield sits deep in the gradient and the
    // frame washes out uniformly, which is haze rather than depth.
    const density = a.fogDensity + (b.fogDensity - a.fogDensity) * t;
    if (density <= 0) {
      fog.near = camDistance * 100;
      fog.far = camDistance * 200;
    } else {
      fog.near = camDistance - reach * 0.55;
      fog.far = camDistance + (reach * 1.2) / density;
    }
  }

  // ─── Ground ───

  const groundMat = track(new THREE.MeshLambertMaterial({ color: dayLight.groundTint }));
  // Oversized so its edge never enters frame. At 1.6x the far edge showed as a
  // hard horizon line across the top of a portrait viewport — with no sky or
  // water behind it that reads as a hole, not as a horizon. Fog swallows the
  // extra distance, so the only cost is two triangles.
  const ground = new THREE.Mesh(
    track(new THREE.PlaneGeometry(map.world.width * 3, map.world.height * 3)),
    groundMat,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ─── Path: an organic ribbon per lane, edges wandering, never a uniform stroke ───

  const pathMat = track(
    new THREE.MeshLambertMaterial({ color: dayLight.pathTint, polygonOffset: true, polygonOffsetFactor: -1 }),
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

  // ─── Gate + forge ───
  // The gate takes a real model when one is loaded; the forge has no model in
  // any kit we ship, so it stays built from primitives. Both fall back cleanly,
  // which is what keeps `views` optional and the world renderable in tests.

  group.add(buildGate(map, track, views));
  group.add(buildForge(map, track));

  // ─── Props: sparse, clustered at path edges, large negative space elsewhere ───

  group.add(buildProps(map, track, views));

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
  camera.position.set(
    target.x + Math.cos(camEl) * Math.sin(camYaw) * camDistance,
    Math.sin(camEl) * camDistance,
    target.z + Math.cos(camEl) * Math.cos(camYaw) * camDistance,
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

  applyDaylight();

  return {
    group,
    camera,
    map,
    resize,
    get daylight() {
      return daylight;
    },
    setDaylight(targetLevel: number, dt: number) {
      const clamped = Math.min(1, Math.max(0, targetLevel));
      // Exponential ease, framerate-independent. A linear ramp reads as a
      // dimmer being turned; this settles the way light actually goes.
      const k = 1 - Math.exp(-dt / (DAYLIGHT_FADE_SECONDS / 3));
      const next = daylight + (clamped - daylight) * k;
      // Snap once the remaining difference stops being visible, so the fade
      // ends instead of asymptoting and re-applying colours forever.
      daylight = Math.abs(clamped - next) < 0.001 ? clamped : next;
      applyDaylight();
    },
    dispose() {
      scene.remove(group);
      scene.fog = null;
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
      // Counter-clockwise seen from above. Ribs emit left-then-right while the
      // strip advances along the lane, so the naive order (a, a+1, a+2) winds
      // clockwise and every normal comes out -Y: the road is then backface
      // culled under FrontSide, and lit black under DoubleSide because three
      // flips normals on back-facing fragments. It is direction-independent —
      // the perpendicular rotates with the tangent, so the cross product is
      // -Y for *every* lane heading, and reversing here is always correct.
      indices.push(a + 2, a + 1, a, a + 2, a + 3, a + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  // The ribbon is planar at PATH_Y, so its normals are known rather than
  // derived. Stating them beats computeVertexNormals(): repeated waypoints
  // produce zero-area triangles whose computed normal is NaN, and one NaN
  // vertex blanks the whole draw.
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
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

/** Local-space size of a source model, ignoring where its origin sits. */
function modelSize(o: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
}

/** Attributes the lighting model actually consumes; everything else is dropped. */
const MERGE_ATTRIBUTES = ['position', 'normal', 'uv'] as const;

/**
 * Clone a source primitive into world space, ready to merge.
 *
 * The dequantise step is load-bearing. `npm run asset:optimize` runs
 * gltf-transform with `--compress quantize`, so the Nature kit ships
 * `KHR_mesh_quantization` with i16-normalised POSITION and NORMAL: real
 * coordinates are recovered by dividing by 32767, and the model's true size
 * lives in the node transform. Baking a world matrix straight into that
 * attribute writes values in the hundreds back into a normalised int16 slot,
 * where they saturate — every prop on the map collapsed into a two-unit blob
 * at the origin, which read as "the props never placed" rather than as a
 * corrupted attribute. Widening to Float32 first is the whole fix.
 *
 * The Castle kit is unquantised (plain f32), which is why the gatehouse
 * survived the same code path and hid the bug for as long as it did.
 */
function bakeGeometry(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const geo = geometry.clone();
  for (const name of MERGE_ATTRIBUTES) {
    const attr = geo.getAttribute(name);
    if (!attr) continue;
    if (attr.array instanceof Float32Array && !attr.normalized) continue;
    // getComponent() denormalises, so this reads true values whatever the
    // source storage was — including interleaved attributes.
    const widened = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i++) {
      for (let c = 0; c < attr.itemSize; c++) {
        widened[i * attr.itemSize + c] = attr.getComponent(i, c);
      }
    }
    geo.setAttribute(name, new THREE.BufferAttribute(widened, attr.itemSize));
  }
  geo.applyMatrix4(matrix);
  // mergeGeometries demands identical attribute sets across the batch; a kit
  // carrying extra channels would otherwise fail the merge outright.
  for (const name of Object.keys(geo.attributes)) {
    if (!MERGE_ATTRIBUTES.includes(name as (typeof MERGE_ATTRIBUTES)[number])) geo.deleteAttribute(name);
  }
  return geo;
}

/**
 * Compose the gatehouse from Castle-kit pieces: tower · wall · wall · gate ·
 * wall · wall · tower.
 *
 * The kit has no gatehouse model — `gate.glb` is a single door panel 0.66 wide
 * and 0.15 thick, meant to hang in an opening between wall segments. Scaling
 * that one piece up to the gate's footprint is what produced a 1,100-unit
 * tower of a door; the pieces have to be laid out instead.
 *
 * Every dimension is measured from the models rather than hardcoded, so a kit
 * swap re-proportions itself. The whole assembly is then scaled to
 * GATE_HALF_WIDTH — the footprint the camera's content bounds were fitted to,
 * which is why width is the thing held fixed and height is allowed to follow.
 */
function buildGateFromKit(
  map: MapDef,
  p: THREE.Vector3,
  views?: ModelViewFactory,
): THREE.Group | undefined {
  if (!views) return undefined;
  const gateSrc = views.sourceScene('world-gate');
  const wallSrc = views.sourceScene('world-wall');
  const towerSrc = views.sourceScene('world-tower');
  const roofSrc = views.sourceScene('world-tower-roof');
  if (!gateSrc || !wallSrc || !towerSrc) return undefined;

  const gateSize = modelSize(gateSrc);
  const wallSize = modelSize(wallSrc);
  const towerSize = modelSize(towerSrc);

  // The door panel is authored broad along Z and thin along X, so it needs a
  // quarter turn to span the opening rather than block the road.
  const gateSpan = gateSize.z;
  const WALLS_PER_SIDE = 2;
  const totalKitWidth = towerSize.x * 2 + wallSize.x * WALLS_PER_SIDE * 2 + gateSpan;
  const s = (GATE_HALF_WIDTH * 2) / totalKitWidth;

  const g = new THREE.Group();
  // Nine static pieces would be nine draw calls; merged by material they are
  // two. Same rule as the props (CLAUDE.md #6) — the gatehouse never moves.
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const place = (src: THREE.Object3D, kitX: number, kitY: number, yaw: number, tint: number) => {
    const o = src.clone(true);
    o.scale.setScalar(s);
    o.rotation.y = yaw;
    o.position.set(p.x + kitX * s, kitY * s, p.z);
    views.applyPalette(o, tint);
    o.updateMatrixWorld(true);
    o.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
      const geo = bakeGeometry(mesh.geometry, mesh.matrixWorld);
      const bucket = buckets.get(material);
      if (bucket) bucket.push(geo);
      else buckets.set(material, [geo]);
    });
  };

  // Walk outward from the centre so the pieces butt up against each other.
  place(gateSrc, 0, 0, Math.PI / 2, 4);
  let edge = gateSpan / 2;
  for (let i = 0; i < WALLS_PER_SIDE; i++) {
    const cx = edge + wallSize.x / 2;
    place(wallSrc, cx, 0, 0, 4);
    place(wallSrc, -cx, 0, 0, 4);
    edge += wallSize.x;
  }
  const towerX = edge + towerSize.x / 2;
  for (const sign of [1, -1]) {
    place(towerSrc, sign * towerX, 0, 0, 5);
    if (roofSrc) place(roofSrc, sign * towerX, towerSize.y, 0, 5);
  }

  for (const [material, geometries] of buckets) {
    const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
    for (const geo of geometries) geo.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

function buildGate(map: MapDef, track: Track, views?: ModelViewFactory): THREE.Group {
  const g = new THREE.Group();
  const p = simToWorld(map, map.gate.position.x, map.gate.position.y);

  const built = buildGateFromKit(map, p, views);
  if (built) {
    g.add(built);
    return g;
  }

  // Fallback: primitives, so a missing model degrades to something placed
  // correctly rather than to nothing.
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
/**
 * One source mesh, flattened out of its glTF hierarchy: geometry plus the
 * transform that positions it within the model, so a placement matrix can be
 * composed on top without walking the tree again per instance.
 */
interface SourcePart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  local: THREE.Matrix4;
}

function collectParts(root: THREE.Object3D): SourcePart[] {
  const parts: SourcePart[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    parts.push({ geometry: mesh.geometry, material, local: mesh.matrixWorld.clone() });
  });
  return parts;
}

/**
 * Prop kinds, as manifest ids with the weight each is drawn with and a size
 * expressed in world units. Height rather than a raw scale factor, so a swapped
 * kit with different authoring units still lands the same size on screen.
 */
const PROP_KINDS = [
  { id: 'world-tree', weight: 0.4, height: 46 },
  { id: 'world-tree-pine', weight: 0.28, height: 52 },
  { id: 'world-rock', weight: 0.14, height: 13 },
  { id: 'world-rock-small', weight: 0.1, height: 8 },
  { id: 'world-stump', weight: 0.08, height: 11 },
] as const;

function buildProps(map: MapDef, track: Track, views?: ModelViewFactory): THREE.Group {
  const g = new THREE.Group();
  const rng = seededRng(hashString(map.id + ':props'));

  const trunk = track(new THREE.MeshLambertMaterial({ color: '#5b4126' }));
  const foliage = track(new THREE.MeshLambertMaterial({ color: '#37592c' }));
  const rock = track(new THREE.MeshLambertMaterial({ color: '#7c7c84' }));
  const trunkGeo = track(new THREE.CylinderGeometry(3, 4, 18, 6));
  const foliageGeo = track(new THREE.ConeGeometry(15, 34, 7));
  const rockGeo = track(new THREE.DodecahedronGeometry(8, 0));

  // Resolve which prop models are actually available. Anything missing simply
  // drops out of the weighted draw, so a partial kit still dresses the map.
  const kinds = views
    ? PROP_KINDS.flatMap((k) => {
        const source = views.sourceScene(k.id);
        if (!source) return [];
        const box = new THREE.Box3().setFromObject(source);
        const h = Math.max(1e-3, box.max.y - box.min.y);
        return [{ ...k, parts: collectParts(source), scale: k.height / h, minY: box.min.y }];
      })
    : [];
  const totalWeight = kinds.reduce((s, k) => s + k.weight, 0);

  // Merge buckets, keyed by material. Twenty-odd props would otherwise be
  // twenty-odd draw calls of ~150 triangles each — exactly the case CLAUDE.md
  // #6 asks to be merged into shared static geometry.
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const placement = new THREE.Matrix4();
  const composed = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

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

      if (kinds.length > 0) {
        // Weighted draw over whatever models loaded.
        let roll = rng() * totalWeight;
        let kind = kinds[kinds.length - 1]!;
        for (const k of kinds) {
          roll -= k.weight;
          if (roll <= 0) {
            kind = k;
            break;
          }
        }

        const jitter = 0.78 + rng() * 0.44;
        const s = kind.scale * jitter;
        pos.set(p.x, -kind.minY * s, p.z);
        // Yaw only. Trees tilted on X or Z read as damaged rather than varied,
        // and rocks gain nothing from it at this camera angle.
        euler.set(0, rng() * Math.PI * 2, 0);
        quat.setFromEuler(euler);
        scl.setScalar(s);
        placement.compose(pos, quat, scl);

        for (const part of kind.parts) {
          composed.multiplyMatrices(placement, part.local);
          const geo = bakeGeometry(part.geometry, composed);
          const bucket = buckets.get(part.material);
          if (bucket) bucket.push(geo);
          else buckets.set(part.material, [geo]);
        }
      } else if (rng() < 0.72) {
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

  // One draw call per distinct material, however many props were placed.
  for (const [material, geometries] of buckets) {
    const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
    for (const geo of geometries) geo.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(track(merged), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Props are scattered across the whole map, so a bounding sphere centred on
    // any one of them is meaningless — without this the merged mesh culls as a
    // unit and pops out of view at the frame edge.
    mesh.frustumCulled = false;
    g.add(mesh);
  }
  return g;
}
