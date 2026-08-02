import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildWorld } from './world';
import { makeMap } from '../engine/testFixtures';

/**
 * Rendering does not generally get tests (CLAUDE.md), and this is the exception
 * that earned one.
 *
 * The path ribbon shipped with reversed triangle winding, so every normal
 * pointed at the ground. Under FrontSide the road was backface-culled; the
 * whole corridor — the brightest, most load-bearing shape on the map — simply
 * was not drawn, and nothing failed. It survived a render-engine migration and
 * four maps because a missing road looks exactly like a map that was authored
 * without one.
 *
 * These assertions are cheap because the geometry is pure maths: no canvas, no
 * WebGL context, no assets. They cover the two ways this can silently break —
 * normals facing away from the camera, and props landing somewhere other than
 * where they were placed.
 */

/** The path is the only mesh carrying the path tint. */
function findPathMesh(world: { group: THREE.Object3D }, tint: string): THREE.Mesh {
  let found: THREE.Mesh | undefined;
  world.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshLambertMaterial;
    if (mat.color?.getHexString() === tint) found = mesh;
  });
  if (!found) throw new Error('no mesh carries the path tint');
  return found;
}

describe('path ribbon', () => {
  const map = makeMap();
  // The world starts at full day, so the day preset's tint is what is applied.
  const pathTint = map.lighting.day.pathTint.replace('#', '').toLowerCase();

  it('faces the camera — every normal points up', () => {
    const world = buildWorld(map, new THREE.Scene());
    const normal = findPathMesh(world, pathTint).geometry.getAttribute('normal');

    expect(normal).toBeTruthy();
    for (let i = 0; i < normal.count; i++) {
      expect(normal.getY(i)).toBe(1);
      expect(Number.isNaN(normal.getX(i))).toBe(false);
    }
    world.dispose();
  });

  it('winds counter-clockwise seen from above, whichever way the lane runs', () => {
    // Both directions, because the perpendicular rotates with the tangent: if
    // the winding were direction-dependent, one of these would come out -Y.
    for (const waypoints of [
      [
        { x: 20, y: 0 },
        { x: 20, y: 180 },
      ],
      [
        { x: 20, y: 180 },
        { x: 20, y: 0 },
      ],
    ]) {
      const world = buildWorld(makeMap({ laneWaypoints: waypoints }), new THREE.Scene());
      const geo = findPathMesh(world, pathTint).geometry;
      const pos = geo.getAttribute('position');
      const index = geo.getIndex()!;

      const a = new THREE.Vector3().fromBufferAttribute(pos, index.getX(0));
      const b = new THREE.Vector3().fromBufferAttribute(pos, index.getX(1));
      const c = new THREE.Vector3().fromBufferAttribute(pos, index.getX(2));
      const facing = b.sub(a).cross(c.sub(a));

      expect(facing.y).toBeGreaterThan(0);
      world.dispose();
    }
  });

  it('lies flat on the ground plane', () => {
    const world = buildWorld(map, new THREE.Scene());
    const geo = findPathMesh(world, pathTint).geometry;
    geo.computeBoundingBox();
    const box = geo.boundingBox!;

    expect(box.max.y - box.min.y).toBeCloseTo(0);
    expect(box.max.x - box.min.x).toBeGreaterThan(0);
    world.dispose();
  });
});

describe('world dressing', () => {
  it('keeps the ground large enough that its edge never enters frame', () => {
    const map = makeMap();
    const world = buildWorld(map, new THREE.Scene());
    let ground: THREE.Mesh | undefined;
    world.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry?.type === 'PlaneGeometry') ground = mesh;
    });

    ground!.geometry.computeBoundingBox();
    const size = ground!.geometry.boundingBox!.getSize(new THREE.Vector3());
    // The camera fits the map's content; anything at or under 1x would show a
    // hard horizon line, and with no sky behind it that reads as a hole.
    expect(size.x).toBeGreaterThan(map.world.width * 2);
    expect(size.y).toBeGreaterThan(map.world.height * 2);
    world.dispose();
  });
});

describe('day/night', () => {
  it('starts at full day and eases toward night rather than snapping', () => {
    const world = buildWorld(makeMap(), new THREE.Scene());
    expect(world.daylight).toBe(1);

    world.setDaylight(0, 1 / 60);
    expect(world.daylight).toBeLessThan(1);
    expect(world.daylight).toBeGreaterThan(0.9);

    // And it does arrive, rather than asymptoting forever.
    for (let i = 0; i < 60 * 10; i++) world.setDaylight(0, 1 / 60);
    expect(world.daylight).toBe(0);
    world.dispose();
  });

  it('repaints the terrain, not just the lights', () => {
    const map = makeMap();
    const world = buildWorld(map, new THREE.Scene());
    const pathTint = map.lighting.day.pathTint.replace('#', '').toLowerCase();
    const path = findPathMesh(world, pathTint);
    const byDay = (path.material as THREE.MeshLambertMaterial).color.getHexString();

    for (let i = 0; i < 60 * 10; i++) world.setDaylight(0, 1 / 60);
    const byNight = (path.material as THREE.MeshLambertMaterial).color.getHexString();

    expect(byNight).not.toBe(byDay);
    expect(byNight).toBe(map.lighting.night.pathTint.replace('#', '').toLowerCase());
    world.dispose();
  });
});
