import * as THREE from 'three';
import type { Simulation } from '../engine/simulation';
import type { MapDef } from '../data/schemas';
import { simToWorld } from './world';

/**
 * MG.6 — the layer that makes sim state legible.
 *
 * Everything here is feedback, never truth: the sim has already decided what
 * happened, and these are the tells that let a player read it. Nothing in this
 * file may change a sim value.
 *
 * Covers Part A.1's ground reads (team rings, range decals) plus the juice the
 * Phaser build got at M1 and the 3D build has been missing — which is why
 * Charge, whose whole effect is a one-second state change, has so far looked
 * exactly like a dead button.
 */

const RING_SEGMENTS = 20;
const MAX_BURSTS = 24;
const BURST_PARTICLES = 7;

type Rgb = THREE.ColorRepresentation;

/** A soft ground ring under a unit — the faction read at chibi scale. */
class RingPool {
  private readonly pool: THREE.Mesh[] = [];
  private readonly geo: THREE.RingGeometry;
  private readonly group = new THREE.Group();
  private used = 0;

  constructor(scene: THREE.Scene, radius: number, color: Rgb, opacity: number) {
    this.geo = new THREE.RingGeometry(radius * 0.72, radius, RING_SEGMENTS);
    this.material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    scene.add(this.group);
  }

  private readonly material: THREE.MeshBasicMaterial;

  begin(): void {
    this.used = 0;
  }

  place(x: number, z: number, scale: number): void {
    let mesh = this.pool[this.used];
    if (!mesh) {
      mesh = new THREE.Mesh(this.geo, this.material);
      mesh.rotation.x = -Math.PI / 2;
      this.pool.push(mesh);
      this.group.add(mesh);
    }
    mesh.position.set(x, 0.6, z);
    mesh.scale.setScalar(scale);
    mesh.visible = true;
    this.used++;
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

interface Burst {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

/** Pooled particle bursts — kills, ability casts, hits. No per-frame allocation. */
class BurstPool {
  private readonly bursts: Burst[] = [];
  private readonly geo = new THREE.BoxGeometry(3, 3, 3);
  private readonly materials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  private material(color: Rgb): THREE.MeshBasicMaterial {
    const key = String(color);
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
      this.materials.set(key, m);
    }
    return m;
  }

  spawn(x: number, y: number, z: number, color: Rgb, power = 1): void {
    const mat = this.material(color);
    for (let i = 0; i < BURST_PARTICLES; i++) {
      if (this.bursts.filter((b) => b.life > 0).length >= MAX_BURSTS * BURST_PARTICLES) return;
      let b = this.bursts.find((x) => x.life <= 0);
      if (!b) {
        if (this.bursts.length >= MAX_BURSTS * BURST_PARTICLES) return;
        const mesh = new THREE.Mesh(this.geo, mat);
        this.group.add(mesh);
        b = { mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.5 };
        this.bursts.push(b);
      }
      b.mesh.material = mat;
      const a = (i / BURST_PARTICLES) * Math.PI * 2;
      const speed = (26 + Math.abs(Math.sin(a * 3)) * 22) * power;
      b.vx = Math.cos(a) * speed;
      b.vz = Math.sin(a) * speed;
      b.vy = (28 + Math.abs(Math.cos(a * 2)) * 26) * power;
      b.maxLife = 0.42;
      b.life = b.maxLife;
      b.mesh.position.set(x, y, z);
      b.mesh.scale.setScalar(power);
      b.mesh.visible = true;
    }
  }

  tick(dt: number): void {
    for (const b of this.bursts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }
      b.vy -= 210 * dt; // gravity
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y = Math.max(1, b.mesh.position.y + b.vy * dt);
      b.mesh.position.z += b.vz * dt;
      b.mesh.rotation.x += dt * 8;
      b.mesh.rotation.y += dt * 6;
      const t = b.life / b.maxLife;
      b.mesh.scale.setScalar(Math.max(0.05, t));
    }
  }

  dispose(): void {
    this.geo.dispose();
    for (const m of this.materials.values()) m.dispose();
  }
}

export class FxLayer {
  private readonly enemyRings: RingPool;
  private readonly heroRing: RingPool;
  private readonly rangeRings: RingPool;
  private readonly zoneRings: RingPool;
  private readonly bladeRings: RingPool;
  private readonly bursts: BurstPool;
  private readonly map: MapDef;
  private readonly scratch = new THREE.Vector3();

  /** Camera shake, decayed each frame and applied as a positional offset. */
  private shake = 0;
  private readonly cameraHome = new THREE.Vector3();
  private cameraHomeSet = false;

  constructor(scene: THREE.Scene, map: MapDef) {
    this.map = map;
    this.enemyRings = new RingPool(scene, 13, '#c4452e', 0.5);
    this.heroRing = new RingPool(scene, 17, '#5b8bff', 0.62);
    this.rangeRings = new RingPool(scene, 1, '#ffffff', 0.14);
    // Unit radius, scaled per zone — a hazard has to read as *ground you do not
    // want to be standing on*, so it is a harder, warmer ring than the
    // build-phase range decals, and unlike them it shows during the wave.
    this.zoneRings = new RingPool(scene, 1, '#e2743a', 0.42);
    // Cold steel against the hazards' warm orange — the two read apart at a
    // glance even when blades are spinning through a patch of caltrops.
    this.bladeRings = new RingPool(scene, 1, '#cfe6ff', 0.8);
    this.bursts = new BurstPool(scene);
  }

  /**
   * Subscribe to sim events. Called once per run — on restart, the host builds
   * a new FxLayer or re-attaches, because sim callback arrays do not survive.
   */
  attach(sim: Simulation): void {
    sim.enemySystem.onDeath.push((e) => {
      simToWorld(this.map, e.x, e.y, this.scratch);
      this.bursts.spawn(
        this.scratch.x,
        e.config.radius,
        this.scratch.z,
        e.isElite ? '#f6c945' : '#c4452e',
        e.isElite ? 1.5 : 1,
      );
      if (e.config.staggersHero) this.kick(0.5); // heavies land heavier
    });

    // The gate taking a hit is the single most important thing to notice.
    sim.enemySystem.onReachEnd.push(() => this.kick(0.9));

    sim.hero.onStagger.push(() => this.kick(1));

    sim.abilities.onCast.push((ability) => {
      simToWorld(this.map, sim.hero.x, sim.hero.y, this.scratch);
      // Abilities fire themselves now, so the cast tell is doing more work than
      // it used to: it is the only thing telling a player their build just did
      // something. Blades get the loudest one — they persist, so the burst is
      // what marks the moment they start.
      const orbit = ability.effect.type === 'orbit';
      this.bursts.spawn(
        this.scratch.x,
        14,
        this.scratch.z,
        orbit ? '#9fd8ff' : '#f6c945',
        orbit ? 1.8 : 1.3,
      );
      this.kick(orbit ? 0.7 : 0.45);
    });
  }

  private kick(power: number): void {
    this.shake = Math.min(1.4, this.shake + power);
  }

  /** Read-only pass over sim state + particle integration. */
  update(sim: Simulation, camera: THREE.Camera, dt: number): void {
    if (!this.cameraHomeSet) {
      this.cameraHome.copy(camera.position);
      this.cameraHomeSet = true;
    }

    this.enemyRings.begin();
    for (const e of sim.enemySystem.enemies) {
      simToWorld(this.map, e.x, e.y, this.scratch);
      this.enemyRings.place(this.scratch.x, this.scratch.z, e.config.radius / 13);
    }
    this.enemyRings.end();

    this.heroRing.begin();
    simToWorld(this.map, sim.hero.x, sim.hero.y, this.scratch);
    this.heroRing.place(this.scratch.x, this.scratch.z, sim.hero.staggerImmune ? 1.35 : 1);
    this.heroRing.end();

    // Range decals only while building — they are information, not decoration.
    this.rangeRings.begin();
    if (sim.phase === 'build') {
      for (const plot of sim.towerSystem.plots) {
        if (plot.towerId === null) continue;
        const stats = sim.towerSystem.stats(plot);
        if (!stats) continue;
        simToWorld(this.map, plot.x, plot.y, this.scratch);
        this.rangeRings.place(this.scratch.x, this.scratch.z, stats.range);
      }
    }
    this.rangeRings.end();

    // Ground hazards and orbiting blades share a system but must not share a
    // look: one is somewhere you should not stand, the other is a thing of
    // yours moving with you.
    this.zoneRings.begin();
    this.bladeRings.begin();
    for (const zone of sim.zones.zones) {
      simToWorld(this.map, zone.x, zone.y, this.scratch);
      const pool = zone.orbit ? this.bladeRings : this.zoneRings;
      pool.place(this.scratch.x, this.scratch.z, zone.radius);
    }
    this.zoneRings.end();
    this.bladeRings.end();

    this.bursts.tick(dt);

    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - dt * 3.4);
      const s = this.shake * 5;
      camera.position.set(
        this.cameraHome.x + (Math.random() - 0.5) * s,
        this.cameraHome.y + (Math.random() - 0.5) * s,
        this.cameraHome.z + (Math.random() - 0.5) * s,
      );
    } else if (this.cameraHomeSet) {
      camera.position.copy(this.cameraHome);
    }
  }

  dispose(): void {
    this.enemyRings.dispose();
    this.heroRing.dispose();
    this.rangeRings.dispose();
    this.zoneRings.dispose();
    this.bladeRings.dispose();
    this.bursts.dispose();
  }
}
