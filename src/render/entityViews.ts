import * as THREE from 'three';
import { resolveModel, type ModelDef, type ModelProp } from '../data/schemas';
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

/** Every silhouette is authored to this height, then `scale` is applied. */
const UNIT_HEIGHT = 30;

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

export class ModelViewFactory {
  private readonly materials = new Map<number, THREE.MeshLambertMaterial>();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly pools = new Map<string, THREE.Object3D[]>();
  private readonly models: readonly ModelDef[];
  private readonly resolved = new Map<string, ModelDef | undefined>();
  private warnedMissingFile = false;

  constructor(models: readonly ModelDef[]) {
    this.models = models;
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

  scaleOf(modelId: string): number {
    return this.def(modelId)?.scale ?? 1;
  }

  private build(def: ModelDef): THREE.Object3D {
    if (def.file && !this.warnedMissingFile) {
      // A file is declared but glTF loading arrives later in MG.4. Say so once,
      // loudly, rather than silently showing a placeholder that looks like art.
      console.warn(
        `[entityViews] model "${def.id}" declares file "${def.file}" but glTF loading is not wired yet — rendering placeholder.`,
      );
      this.warnedMissingFile = true;
    }

    const group = new THREE.Group();
    group.add(this.silhouetteMesh(def));
    for (const prop of def.props) group.add(this.propMesh(def, prop));
    group.scale.setScalar(def.scale);
    return group;
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
    for (const m of this.materials.values()) m.dispose();
    for (const g of this.geometries) g.dispose();
    this.materials.clear();
    this.geometries.length = 0;
    this.pools.clear();
  }
}
