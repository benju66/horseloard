import * as THREE from 'three';
// Resolved: the biome's palette is folded in by the loader (see `world.ts`).
import type { ResolvedMapDef as MapDef } from '../data/schemas';
import type { Simulation } from '../engine/simulation';
import { simToWorld } from './world';

/**
 * The high-count entities, one draw call each (Part A: `InstancedMesh` for
 * coins, projectiles, swarms).
 *
 * Coins matter more than their size suggests. Pillar 1 is that coins drop where
 * enemies die, so greed pulls you toward danger and every second is a routing
 * decision — a build where the loot line is invisible isn't the game. They were
 * missing from the 3D build entirely until the MG.7 parity audit.
 */

const MAX_COINS = 256;
const MAX_CHESTS = 8;
const MAX_PROJECTILES = 192;
const MAX_BARS = 128;
/** Soldiers are the highest-count *friendly* entity, so they get a batch of their own. */
const MAX_SOLDIERS = 64;

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Wraps an InstancedMesh with a simple "write N, hide the rest" cursor. */
class InstanceBatch {
  readonly mesh: THREE.InstancedMesh;
  private cursor = 0;
  private readonly capacity: number;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
    castShadow = false,
  ) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = castShadow;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  begin(): void {
    this.cursor = 0;
  }

  put(x: number, y: number, z: number, scale: number, rotY = 0, rotX = 0): void {
    if (this.cursor >= this.capacity) return;
    this.pos.set(x, y, z);
    this.q.setFromEuler(new THREE.Euler(rotX, rotY, 0));
    this.scl.setScalar(scale);
    this.m.compose(this.pos, this.q, this.scl);
    this.mesh.setMatrixAt(this.cursor++, this.m);
  }

  /** Non-uniform variant — HP bars need width independent of height. */
  putScaled(x: number, y: number, z: number, sx: number, sy: number, sz: number, rotX = 0): void {
    if (this.cursor >= this.capacity) return;
    this.pos.set(x, y, z);
    this.q.setFromEuler(new THREE.Euler(rotX, 0, 0));
    this.scl.set(sx, sy, sz);
    this.m.compose(this.pos, this.q, this.scl);
    this.mesh.setMatrixAt(this.cursor++, this.m);
  }

  end(): void {
    for (let i = this.cursor; i < this.capacity; i++) this.mesh.setMatrixAt(i, HIDDEN);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

export class InstancedEntities {
  private readonly coins: InstanceBatch;
  private readonly chests: InstanceBatch;
  private readonly chestTimers: InstanceBatch;
  private readonly projectiles: InstanceBatch;
  private readonly barBg: InstanceBatch;
  private readonly barFill: InstanceBatch;
  private readonly eliteRings: InstanceBatch;
  private readonly carried: InstanceBatch;
  private readonly soldiers: InstanceBatch;
  private readonly soldierBarBg: InstanceBatch;
  private readonly soldierBarFill: InstanceBatch;
  private readonly map: MapDef;
  private readonly scratch = new THREE.Vector3();
  private time = 0;

  /** Ortho camera never moves, so one fixed tilt billboards every flat quad. */
  private readonly billboardTilt: number;

  constructor(scene: THREE.Scene, map: MapDef, cameraElevationDeg: number) {
    this.map = map;
    this.billboardTilt = -((90 - cameraElevationDeg) * Math.PI) / 180;

    const gold = new THREE.MeshLambertMaterial({ color: '#f6c945' });
    const goldFlat = new THREE.MeshBasicMaterial({ color: '#f6c945' });
    const wood = new THREE.MeshLambertMaterial({ color: '#6b4a2b' });
    const arrow = new THREE.MeshBasicMaterial({ color: '#e8dcc0' });
    const hpBg = new THREE.MeshBasicMaterial({ color: '#231d18' });
    const hpFill = new THREE.MeshBasicMaterial({ color: '#8fe36a' });
    const eliteMat = new THREE.MeshBasicMaterial({ color: '#f6c945', transparent: true, opacity: 0.85 });

    // A squat cylinder reads as a coin from a high angle and costs 3 tris a face.
    this.coins = new InstanceBatch(scene, new THREE.CylinderGeometry(5, 5, 1.6, 8), gold, MAX_COINS, true);
    this.chests = new InstanceBatch(scene, new THREE.BoxGeometry(20, 13, 14), wood, MAX_CHESTS, true);
    this.chestTimers = new InstanceBatch(scene, new THREE.PlaneGeometry(1, 3), goldFlat, MAX_CHESTS);
    this.projectiles = new InstanceBatch(scene, new THREE.BoxGeometry(2, 2, 11), arrow, MAX_PROJECTILES);
    this.barBg = new InstanceBatch(scene, new THREE.PlaneGeometry(1, 1), hpBg, MAX_BARS);
    this.barFill = new InstanceBatch(scene, new THREE.PlaneGeometry(1, 1), hpFill, MAX_BARS);
    this.eliteRings = new InstanceBatch(scene, new THREE.RingGeometry(0.82, 1, 16), eliteMat, MAX_BARS);
    this.carried = new InstanceBatch(scene, new THREE.SphereGeometry(3.4, 6, 5), goldFlat, MAX_BARS);

    // Soldiers get their own colour and their own bar pair rather than sharing
    // the enemy ones: a line of blue holding a line of red is the single read
    // the army pillar depends on, and a shared green bar over both sides makes
    // a skirmish unreadable at a glance.
    const friendly = new THREE.MeshLambertMaterial({ color: '#5b8bff' });
    const friendlyFill = new THREE.MeshBasicMaterial({ color: '#7fb2ff' });
    this.soldiers = new InstanceBatch(
      scene,
      new THREE.CapsuleGeometry(4.2, 9, 3, 6),
      friendly,
      MAX_SOLDIERS,
      true,
    );
    this.soldierBarBg = new InstanceBatch(scene, new THREE.PlaneGeometry(1, 1), hpBg, MAX_SOLDIERS);
    this.soldierBarFill = new InstanceBatch(scene, new THREE.PlaneGeometry(1, 1), friendlyFill, MAX_SOLDIERS);
  }

  update(sim: Simulation, dt: number): void {
    this.time += dt;
    const t = this.time;

    this.coins.begin();
    this.chests.begin();
    this.chestTimers.begin();
    for (const c of sim.economy.coins) {
      simToWorld(this.map, c.x, c.y, this.scratch);
      if (c.isChest) {
        this.chests.put(this.scratch.x, 8, this.scratch.z, 1);
        // Timer bar drains left-to-right — chests expire on their own clock.
        const frac = Math.max(0, 1 - c.age / c.lifetime);
        this.chestTimers.putScaled(this.scratch.x, 20, this.scratch.z, 26 * frac, 1, 1, this.billboardTilt);
        continue;
      }
      // Bob and spin so a coin field reads as loot rather than litter.
      const bob = Math.sin(t * 6 + c.x) * 1.2;
      this.coins.put(this.scratch.x, 6 + bob, this.scratch.z, 1, t * 3 + c.x);
    }
    this.coins.end();
    this.chests.end();
    this.chestTimers.end();

    this.projectiles.begin();
    for (const p of sim.projectileSystem.projectiles) {
      simToWorld(this.map, p.x, p.y, this.scratch);
      this.projectiles.put(this.scratch.x, 14, this.scratch.z, 1, Math.atan2(p.dirX, p.dirY));
    }
    this.projectiles.end();

    this.barBg.begin();
    this.barFill.begin();
    this.eliteRings.begin();
    this.carried.begin();
    for (const e of sim.enemySystem.enemies) {
      simToWorld(this.map, e.x, e.y, this.scratch);
      const top = e.config.radius * 2.4;

      if (e.isElite) {
        this.eliteRings.putScaled(
          this.scratch.x,
          0.9,
          this.scratch.z,
          e.config.radius + 7,
          e.config.radius + 7,
          1,
          -Math.PI / 2,
        );
      }
      if (e.hp < e.maxHp) {
        const w = e.config.radius * 2.2;
        const frac = Math.max(0, e.hp / e.maxHp);
        this.barBg.putScaled(this.scratch.x, top, this.scratch.z, w, 3, 1, this.billboardTilt);
        // Anchor the shrinking fill to the left edge, not the centre.
        this.barFill.putScaled(
          this.scratch.x - (w * (1 - frac)) / 2,
          top + 0.2,
          this.scratch.z,
          w * frac,
          3,
          1,
          this.billboardTilt,
        );
      }
      // A looter carrying your gold is the "kill it before it's gone" read.
      if (sim.looters.carriedBy(e.id) > 0) {
        this.carried.put(this.scratch.x, top + 8, this.scratch.z, 1);
      }
    }
    this.barBg.end();
    this.barFill.end();
    this.eliteRings.end();
    this.carried.end();

    this.soldiers.begin();
    this.soldierBarBg.begin();
    this.soldierBarFill.begin();
    for (const s of sim.army.soldiers) {
      if (s.respawnIn > 0) continue; // down; the barracks is walking a replacement out
      simToWorld(this.map, s.x, s.y, this.scratch);
      this.soldiers.put(this.scratch.x, 9, this.scratch.z, 1, Math.atan2(s.facingX, s.facingY));
      if (s.hp < s.maxHp) {
        const w = 16;
        const frac = Math.max(0, s.hp / s.maxHp);
        this.soldierBarBg.putScaled(this.scratch.x, 26, this.scratch.z, w, 2.4, 1, this.billboardTilt);
        this.soldierBarFill.putScaled(
          this.scratch.x - (w * (1 - frac)) / 2,
          26.2,
          this.scratch.z,
          w * frac,
          2.4,
          1,
          this.billboardTilt,
        );
      }
    }
    this.soldiers.end();
    this.soldierBarBg.end();
    this.soldierBarFill.end();
  }

  dispose(): void {
    this.coins.dispose();
    this.chests.dispose();
    this.chestTimers.dispose();
    this.projectiles.dispose();
    this.barBg.dispose();
    this.barFill.dispose();
    this.eliteRings.dispose();
    this.carried.dispose();
    this.soldiers.dispose();
    this.soldierBarBg.dispose();
    this.soldierBarFill.dispose();
  }
}
