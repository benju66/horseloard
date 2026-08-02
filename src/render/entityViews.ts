import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { resolveModel, type AnimationState, type ModelDef, type ModelProp } from '../data/schemas';
import { PALETTE } from './palette';

/**
 * Turns a model manifest entry into something on screen (MIGRATION-3D.md A.2).
 *
 * Placeholders are deliberately crude — blocky primitives that read as a
 * silhouette and nothing more. They exist so the whole roster is playable
 * before any asset is sourced, and they should never be mistaken for the
 * shipped look. When a manifest entry gains a `file`, that entry swaps to a
 * real glTF and nothing else changes.
 *
 * Views are pooled per model id: enemies spawn and die constantly, and
 * allocating a mesh tree per spawn is exactly the per-frame churn CLAUDE.md #6
 * exists to prevent.
 */

/**
 * Every silhouette is authored to this height, then `scale` is applied.
 *
 * Measured on a 390x844 phone: a map is 780 world units tall against 844
 * pixels, so the camera renders at roughly one unit per pixel and this number
 * is very nearly the on-screen pixel height of a character. At 30 a grunt was
 * ~23px, against ART-BRIEF's "must read at roughly 60 pixels tall on a phone".
 * The whole roster was about a third of the size the art was briefed for.
 *
 * `?unitScale=N` multiplies it for one load, so the final value can be chosen
 * by looking at a phone instead of by argument. Purely cosmetic: the sim uses
 * its own radii, so nothing here can change what is true.
 */
const BASE_UNIT_HEIGHT = 40;
const UNIT_SCALE_OVERRIDE = (() => {
  if (typeof location === 'undefined') return 1;
  const raw = new URLSearchParams(location.search).get('unitScale');
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
})();
export const UNIT_HEIGHT = BASE_UNIT_HEIGHT * UNIT_SCALE_OVERRIDE;

/** Where props hang, as fractions of unit height. Per silhouette. */
const SOCKETS: Record<string, Record<string, [number, number, number]>> = {
  humanoid: { root: [0, 0, 0], head: [0, 1.0, 0], hand: [0.42, 0.55, 0], back: [0, 0.62, -0.3], mount: [0, 1.05, 0] },
  beast: { root: [0, 0, 0], head: [0, 0.75, 0.42], hand: [0.3, 0.5, 0], back: [0, 0.72, -0.1], mount: [0, 0.85, -0.05] },
  mounted: { root: [0, 0, 0], head: [0, 0.95, 0.4], hand: [0.34, 0.95, 0.1], back: [0, 0.8, -0.35], mount: [0, 0.86, -0.05] },
  structure: { root: [0, 0, 0], head: [0, 1.1, 0], hand: [0.5, 0.7, 0], back: [0, 0.6, -0.4], mount: [0, 1.1, 0] },
  blob: { root: [0, 0, 0], head: [0, 0.8, 0], hand: [0.3, 0.4, 0], back: [0, 0.4, -0.25], mount: [0, 0.85, 0] },
};

function socketOffset(silhouette: string, socket: string): [number, number, number] {
  return SOCKETS[silhouette]?.[socket] ?? SOCKETS['humanoid']![socket] ?? [0, 0, 0];
}

/** A live view's animation state — mixer plus the actions its manifest maps. */
interface ViewAnim {
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<AnimationState, THREE.AnimationAction>>;
  current: AnimationState | null;
}

export class ModelViewFactory {
  private readonly materials = new Map<number, THREE.MeshLambertMaterial>();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly pools = new Map<string, THREE.Object3D[]>();
  private readonly models: readonly ModelDef[];
  private readonly resolved = new Map<string, ModelDef | undefined>();
  private warnedMissingFile = false;
  /** file path → parsed glTF scene + clips, loaded once at boot. */
  private readonly loaded = new Map<string, { scene: THREE.Object3D; clips: THREE.AnimationClip[] }>();
  /** Every view built from a glTF, so the host can tick their mixers. */
  private readonly anims = new Map<THREE.Object3D, ViewAnim>();
  /** One shared material for every flashing mesh — see setFlash(). */
  private readonly flashMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  constructor(models: readonly ModelDef[]) {
    this.models = models;
  }

  /**
   * Load every glTF the manifest references, once, before the first run.
   * `acquire()` is synchronous by design — views are created mid-frame as
   * enemies spawn — so loading has to have already happened. Map select is
   * on screen while this runs, so the wait is invisible.
   *
   * A file that fails to load is reported and left as placeholder geometry
   * rather than throwing: one bad asset must not take the game down.
   */
  async preload(): Promise<void> {
    const loader = new GLTFLoader();
    const files = new Set<string>();
    for (const m of this.models) {
      const def = this.def(m.id);
      if (def?.file) files.add(def.file);
      for (const p of def?.props ?? []) if (p.file) files.add(p.file);
    }
    await Promise.all(
      [...files].map(async (file) => {
        try {
          const gltf = await loader.loadAsync(file);
          this.loaded.set(file, { scene: gltf.scene, clips: gltf.animations });
        } catch (err) {
          console.warn(`[entityViews] failed to load "${file}" — using placeholder`, err);
        }
      }),
    );
  }

  /**
   * The raw loaded glTF scene behind a manifest id, or undefined if it has no
   * file or failed to load.
   *
   * For static world dressing only. Views handed out by `acquire` are pooled
   * and individually transformed, which is right for entities that spawn and
   * die but wrong for twenty roadside trees that never move — CLAUDE.md #6 asks
   * those to be merged into shared geometry, and merging needs the source, not
   * a pooled instance. Callers must not mutate what they get back.
   */
  sourceScene(id: string): THREE.Object3D | undefined {
    const def = this.def(id);
    return def?.file ? this.loaded.get(def.file)?.scene : undefined;
  }

  /** Advance every live view's animation. */
  tick(dt: number): void {
    for (const a of this.anims.values()) a.mixer.update(dt);
  }

  /**
   * Play a logical state. The manifest maps state → clip name, so this file
   * never learns what a clip is called; `procedural` and unmapped states are
   * simply no-ops here and handled in code elsewhere.
   */
  setState(view: THREE.Object3D, state: AnimationState): void {
    const anim = this.anims.get(view);
    if (!anim || anim.current === state) return;
    const next = anim.actions[state];
    if (!next) return;
    const prev = anim.current ? anim.actions[anim.current] : undefined;
    if (prev && prev !== next) prev.fadeOut(0.15);
    next.reset().fadeIn(0.15).play();
    anim.current = state;
  }

  private material(tint: number | undefined): THREE.MeshLambertMaterial {
    const slot = tint ?? 0;
    let mat = this.materials.get(slot);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color: PALETTE[slot % PALETTE.length] });
      this.materials.set(slot, mat);
    }
    return mat;
  }

  private track<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private def(modelId: string): ModelDef | undefined {
    if (!this.resolved.has(modelId)) {
      this.resolved.set(modelId, resolveModel(this.models, modelId));
    }
    return this.resolved.get(modelId);
  }

  /** A pooled view for this model id. Release it when the entity dies. */
  acquire(modelId: string): THREE.Object3D | undefined {
    const pool = this.pools.get(modelId);
    const reused = pool?.pop();
    if (reused) {
      reused.visible = true;
      return reused;
    }
    const def = this.def(modelId);
    if (!def) return undefined;
    return this.build(def);
  }

  release(modelId: string, view: THREE.Object3D): void {
    view.visible = false;
    let pool = this.pools.get(modelId);
    if (!pool) {
      pool = [];
      this.pools.set(modelId, pool);
    }
    pool.push(view);
  }

  /** True when this model should ride the rigid instanced path (swarms). */
  isInstanced(modelId: string): boolean {
    return this.def(modelId)?.instanced ?? false;
  }

  /**
   * Hit flash. Materials are shared across the whole pool — tinting one would
   * tint every enemy of that colour — so this swaps each mesh onto a single
   * shared white material and stashes the original to restore. No allocation,
   * no per-instance material, no extra material count.
   */
  setFlash(view: THREE.Object3D, on: boolean): void {
    view.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (on) {
        if (!mesh.userData.baseMaterial) mesh.userData.baseMaterial = mesh.material;
        mesh.material = this.flashMaterial;
      } else if (mesh.userData.baseMaterial) {
        mesh.material = mesh.userData.baseMaterial as THREE.Material;
        mesh.userData.baseMaterial = undefined;
      }
    });
  }

  scaleOf(modelId: string): number {
    return this.def(modelId)?.scale ?? 1;
  }

  private build(def: ModelDef): THREE.Object3D {
    const asset = def.file ? this.loaded.get(def.file) : undefined;
    if (asset) return this.buildFromGltf(def, asset);

    if (def.file && !this.warnedMissingFile) {
      console.warn(`[entityViews] "${def.id}" declares "${def.file}" but it did not load — placeholder.`);
      this.warnedMissingFile = true;
    }

    const group = new THREE.Group();
    group.add(this.silhouetteMesh(def));
    for (const prop of def.props) group.add(this.propMesh(def, prop));
    group.scale.setScalar(def.scale);
    return group;
  }

  /**
   * Instantiate a loaded glTF. Uses SkeletonUtils.clone, not Object3D.clone —
   * a plain clone shares the original skeleton and every copy would animate
   * as one. Height is normalised from the bounding box so a pack's arbitrary
   * unit scale becomes the manifest's, and `scale` stays a pure ratio.
   */
  private buildFromGltf(
    def: ModelDef,
    asset: { scene: THREE.Object3D; clips: THREE.AnimationClip[] },
  ): THREE.Object3D {
    const root = cloneSkinned(asset.scene);

    const box = new THREE.Box3().setFromObject(root);
    const height = Math.max(1e-3, box.max.y - box.min.y);
    const norm = (UNIT_HEIGHT / height) * def.scale;

    const group = new THREE.Group();
    root.scale.setScalar(norm);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
    });
    this.repairUntextured(root, def.tint);
    group.add(root);

    // Wire only the clips the manifest maps; a name that matches nothing is
    // skipped silently, because 'procedural' is a legitimate value.
    if (asset.clips.length > 0) {
      const mixer = new THREE.AnimationMixer(root);
      const actions: Partial<Record<AnimationState, THREE.AnimationAction>> = {};
      for (const [state, clipName] of Object.entries(def.clips)) {
        if (!clipName || clipName === 'procedural') continue;
        const clip = asset.clips.find((c) => c.name === clipName);
        if (clip) actions[state as AnimationState] = mixer.clipAction(clip);
      }
      this.anims.set(group, { mixer, actions, current: null });
    }

    for (const prop of def.props) group.add(this.propMesh(def, prop));
    return group;
  }

  /**
   * Swap in a palette material anywhere a model's own material is unusable.
   * Public because static world dressing clones source scenes directly rather
   * than going through `acquire`, and the repair has to reach those too.
   */
  repairUntextured(root: THREE.Object3D, tint: number | undefined): void {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && this.isUntextured(mesh.material)) mesh.material = this.material(tint);
    });
  }

  /**
   * True for a material that was relying on a texture which never arrived.
   *
   * The Kenney Castle and Tower-Defense kits are raw Unity exports whose single
   * material points at an external `Textures/colormap.png` — a palette atlas
   * that was never downloaded alongside the .glb files. glTF's fallback for a
   * missing map is baseColorFactor, which those exports leave at pure white, so
   * every tower in the game rendered as a white blob.
   *
   * The test has to be exactly this narrow. Kenney's Nature kit carries no
   * texture either (it was re-exported through glTF-Transform), but its
   * materials hold real colours — `woodBark`, `leafsGreen` — and flattening
   * those to one tint would destroy models that are perfectly fine. Untextured
   * *and* white is the signature of the broken case and nothing else.
   *
   * Recolouring rather than re-texturing is also what CLAUDE.md asks for, so
   * the repair lands the models in the game's own palette instead of Kenney's.
   */
  private isUntextured(material: THREE.Material | THREE.Material[]): boolean {
    const mats = Array.isArray(material) ? material : [material];
    return mats.every((m) => {
      const std = m as THREE.MeshStandardMaterial;
      if (std.map) return false;
      // getHex() is only meaningful on materials that have a colour at all.
      return std.color !== undefined && std.color.getHex() === 0xffffff;
    });
  }

  private silhouetteMesh(def: ModelDef): THREE.Object3D {
    const mat = this.material(def.tint);
    const h = UNIT_HEIGHT;
    const g = new THREE.Group();

    switch (def.silhouette) {
      case 'beast': {
        const body = new THREE.Mesh(this.track(new THREE.BoxGeometry(h * 0.34, h * 0.34, h * 0.8)), mat);
        body.position.y = h * 0.42;
        body.castShadow = true;
        g.add(body);
        const head = new THREE.Mesh(this.track(new THREE.BoxGeometry(h * 0.26, h * 0.26, h * 0.26)), mat);
        head.position.set(0, h * 0.6, h * 0.44);
        head.castShadow = true;
        g.add(head);
        break;
      }
      case 'mounted': {
        const body = new THREE.Mesh(this.track(new THREE.BoxGeometry(h * 0.36, h * 0.4, h * 0.95)), mat);
        body.position.y = h * 0.55;
        body.castShadow = true;
        g.add(body);
        const neck = new THREE.Mesh(this.track(new THREE.BoxGeometry(h * 0.22, h * 0.42, h * 0.22)), mat);
        neck.position.set(0, h * 0.82, h * 0.42);
        neck.castShadow = true;
        g.add(neck);
        break;
      }
      case 'structure': {
        const base = new THREE.Mesh(this.track(new THREE.BoxGeometry(h * 0.7, h * 0.9, h * 0.7)), mat);
        base.position.y = h * 0.45;
        base.castShadow = true;
        base.receiveShadow = true;
        g.add(base);
        break;
      }
      case 'flyer': {
        // Placeholder until real art lands, but a deliberate one: a flyer is
        // the only enemy a ground-only tower cannot touch, so the player has
        // to be able to tell at a glance that it is airborne. A sphere cannot
        // do that. Body plus swept wings reads as a bird even at ~25px, which
        // is the size these actually render at.
        const body = new THREE.Mesh(this.track(new THREE.SphereGeometry(h * 0.17, 7, 5)), mat);
        body.position.y = h * 0.2;
        body.castShadow = true;
        g.add(body);
        const wing = this.track(new THREE.BoxGeometry(h * 0.42, h * 0.045, h * 0.16));
        for (const side of [-1, 1]) {
          const w = new THREE.Mesh(wing, mat);
          w.position.set(side * h * 0.26, h * 0.24, -h * 0.02);
          w.rotation.z = side * -0.32;
          w.castShadow = true;
          g.add(w);
        }
        const tail = new THREE.Mesh(this.track(new THREE.BoxGeometry(h * 0.1, h * 0.04, h * 0.22)), mat);
        tail.position.set(0, h * 0.21, -h * 0.2);
        g.add(tail);
        break;
      }
      case 'blob': {
        const body = new THREE.Mesh(this.track(new THREE.SphereGeometry(h * 0.3, 8, 6)), mat);
        body.position.y = h * 0.3;
        body.castShadow = true;
        g.add(body);
        break;
      }
      default: {
        // humanoid: chunky torso + head, ~2.5 heads tall per the proportion target
        const torso = new THREE.Mesh(this.track(new THREE.BoxGeometry(h * 0.36, h * 0.5, h * 0.28)), mat);
        torso.position.y = h * 0.4;
        torso.castShadow = true;
        g.add(torso);
        const head = new THREE.Mesh(this.track(new THREE.BoxGeometry(h * 0.3, h * 0.3, h * 0.3)), mat);
        head.position.y = h * 0.82;
        head.castShadow = true;
        g.add(head);
      }
    }
    return g;
  }

  private propMesh(def: ModelDef, prop: ModelProp): THREE.Object3D {
    const mat = this.material(prop.tint ?? def.tint);
    const s = UNIT_HEIGHT * 0.3 * prop.scale;
    let geo: THREE.BufferGeometry;
    switch (prop.shape) {
      case 'cone':
        geo = this.track(new THREE.ConeGeometry(s * 0.6, s, 6));
        break;
      case 'cylinder':
        geo = this.track(new THREE.CylinderGeometry(s * 0.22, s * 0.22, s * 1.6, 6));
        break;
      case 'sphere':
        geo = this.track(new THREE.SphereGeometry(s * 0.6, 7, 5));
        break;
      default:
        geo = this.track(new THREE.BoxGeometry(s, s, s * 0.4));
    }
    const mesh = new THREE.Mesh(geo, mat);
    const [ox, oy, oz] = socketOffset(def.silhouette, prop.socket);
    mesh.position.set(ox * UNIT_HEIGHT, oy * UNIT_HEIGHT, oz * UNIT_HEIGHT);
    mesh.castShadow = true;
    return mesh;
  }

  dispose(): void {
    this.flashMaterial.dispose();
    for (const m of this.materials.values()) m.dispose();
    for (const g of this.geometries) g.dispose();
    this.materials.clear();
    this.geometries.length = 0;
    this.pools.clear();
    this.anims.clear();
  }
}
