import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { attachAtRest } from './entityViews';

/**
 * Rendering does not generally get tests (CLAUDE.md); like world.test.ts this
 * is pure Object3D maths — no canvas, no WebGL — and it covers the two ways a
 * bone-anchored prop silently goes wrong: inheriting the bone's arbitrary rest
 * axes (riders lie down) and inheriting the host root's normalisation scale
 * (riders shrink to doll size). Both failures produce *something* on screen,
 * which is exactly why they need assertions rather than eyeballs.
 */

/** A miniature rigged host: root (normalisation scale) → spine bone, rotated. */
function makeHost(): { group: THREE.Group; bone: THREE.Bone } {
  const group = new THREE.Group();
  const root = new THREE.Group();
  root.scale.setScalar(0.05); // a raw asset normalised down, as buildFromGltf does
  group.add(root);

  const bone = new THREE.Bone();
  bone.position.set(0, 200, 40); // spine sits high on the (pre-scale) body
  bone.rotation.set(Math.PI / 2, 0, Math.PI / 4); // bones point along arbitrary axes
  root.add(bone);

  group.updateMatrixWorld(true);
  return { group, bone };
}

describe('attachAtRest', () => {
  it('seats the prop at the bone rest position, upright, at its own scale', () => {
    const { group, bone } = makeHost();
    const rider = new THREE.Group();
    rider.scale.setScalar(30); // sized in group units by the caller

    const boneRest = new THREE.Vector3();
    bone.getWorldPosition(boneRest);

    attachAtRest(bone, rider, new THREE.Vector3(0, 0, 0));
    group.updateMatrixWorld(true);

    const pos = new THREE.Vector3();
    rider.getWorldPosition(pos);
    expect(pos.distanceTo(boneRest)).toBeLessThan(1e-6);

    // Upright: the rider's up axis is still the world's up axis.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
      rider.getWorldQuaternion(new THREE.Quaternion()),
    );
    expect(up.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6);

    // The host's 0.05 normalisation must not leak into the rider.
    const scl = new THREE.Vector3();
    rider.getWorldScale(scl);
    expect(scl.x).toBeCloseTo(30, 5);
    expect(scl.y).toBeCloseTo(30, 5);
  });

  it('applies the offset in host space, not bone space', () => {
    const { group, bone } = makeHost();
    const rider = new THREE.Group();

    const boneRest = new THREE.Vector3();
    bone.getWorldPosition(boneRest);

    attachAtRest(bone, rider, new THREE.Vector3(0, 5, 0));
    group.updateMatrixWorld(true);

    const pos = new THREE.Vector3();
    rider.getWorldPosition(pos);
    // Straight up in the host's frame, regardless of the bone's own axes.
    expect(pos.x).toBeCloseTo(boneRest.x, 6);
    expect(pos.y).toBeCloseTo(boneRest.y + 5, 6);
    expect(pos.z).toBeCloseTo(boneRest.z, 6);
  });

  it('follows the bone rigidly once it animates away from rest', () => {
    const { group, bone } = makeHost();
    const rider = new THREE.Group();
    attachAtRest(bone, rider, new THREE.Vector3(0, 5, 0));
    group.updateMatrixWorld(true);

    const before = rider.getWorldPosition(new THREE.Vector3());

    // The walk cycle moves the spine: raise it and roll it a little.
    bone.position.y += 60; // 60 pre-scale units = 3 world units under 0.05
    bone.rotateX(0.3);
    group.updateMatrixWorld(true);

    const after = rider.getWorldPosition(new THREE.Vector3());

    // It moved with the bone —
    expect(after.distanceTo(before)).toBeGreaterThan(1);
    // — by translation and rotation about the bone, not by drifting off it:
    // the rider's distance to the bone origin is invariant under rigid motion.
    const boneNow = bone.getWorldPosition(new THREE.Vector3());
    expect(after.distanceTo(boneNow)).toBeCloseTo(5, 5);

    // And returning the bone to rest returns the rider exactly.
    bone.position.y -= 60;
    bone.rotateX(-0.3);
    group.updateMatrixWorld(true);
    const restored = rider.getWorldPosition(new THREE.Vector3());
    expect(restored.distanceTo(before)).toBeLessThan(1e-6);
  });
});
