/**
 * Inspect a .glb before wiring it into models.json.
 *
 * Reports the things that decide whether a model drops straight in or needs a
 * pass in Blender first: draw-call cost (one merged mesh or many), whether it is
 * skinned and animated, the clip names the manifest has to map, whether it
 * carries PBR maps this game will never light, and the two conventions an
 * exporter will not enforce for you — origin at the feet, and which way is +Z.
 *
 *   node scripts/inspect-model.mjs Art/Tier1_Rider.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { statSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/inspect-model.mjs <file.glb>');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path);
const root = doc.getRoot();

const kb = (statSync(path).size / 1024).toFixed(0);
console.log(`\n=== ${path} — ${kb} KB ===\n`);

// --- Meshes and cost ---------------------------------------------------------
const meshes = root.listMeshes();
let prims = 0;
let tris = 0;
let verts = 0;
for (const mesh of meshes) {
  for (const prim of mesh.listPrimitives()) {
    prims++;
    const pos = prim.getAttribute('POSITION');
    if (pos) verts += pos.getCount();
    const idx = prim.getIndices();
    tris += idx ? idx.getCount() / 3 : (pos ? pos.getCount() / 3 : 0);
  }
}
console.log('GEOMETRY');
console.log(`  meshes      ${meshes.length}`);
console.log(`  primitives  ${prims}   <- roughly the draw calls per instance`);
console.log(`  triangles   ${Math.round(tris)}`);
console.log(`  vertices    ${verts}`);
console.log(`  budget      ~3000 tris/character (MIGRATION-3D Part A.2)`);

// --- Skin and skeleton -------------------------------------------------------
const skins = root.listSkins();
console.log('\nSKELETON');
if (skins.length === 0) {
  console.log('  none — rigid mesh, cannot be animated by bones');
} else {
  for (const skin of skins) {
    const joints = skin.listJoints();
    console.log(`  skin "${skin.getName() || '(unnamed)'}" — ${joints.length} joints`);
    console.log('  joint names:');
    for (const j of joints) console.log(`    ${j.getName()}`);
  }
}

// --- Animations --------------------------------------------------------------
const anims = root.listAnimations();
console.log('\nANIMATIONS');
if (anims.length === 0) {
  console.log('  none — every state falls back to "procedural"');
} else {
  for (const anim of anims) {
    let dur = 0;
    const targets = new Set();
    for (const ch of anim.listChannels()) {
      const s = ch.getSampler();
      const input = s?.getInput();
      if (input) {
        const t = input.getArray();
        if (t && t.length) dur = Math.max(dur, t[t.length - 1]);
      }
      const node = ch.getTargetNode();
      if (node) targets.add(node.getName());
    }
    console.log(`  "${anim.getName()}"  ${dur.toFixed(2)}s  ${anim.listChannels().length} channels, ${targets.size} nodes`);
  }
}

// --- Materials ---------------------------------------------------------------
console.log('\nMATERIALS');
for (const mat of root.listMaterials()) {
  const maps = [];
  if (mat.getBaseColorTexture()) maps.push('baseColor');
  if (mat.getNormalTexture()) maps.push('normal');
  if (mat.getMetallicRoughnessTexture()) maps.push('metallicRoughness');
  if (mat.getOcclusionTexture()) maps.push('occlusion');
  if (mat.getEmissiveTexture()) maps.push('emissive');
  console.log(`  "${mat.getName() || '(unnamed)'}"  maps: ${maps.length ? maps.join(', ') : 'none (flat colour)'}`);
}
const textures = root.listTextures();
if (textures.length) {
  console.log('  textures:');
  for (const t of textures) {
    const img = t.getImage();
    console.log(`    ${t.getName() || '(unnamed)'}  ${t.getMimeType()}  ${img ? (img.byteLength / 1024).toFixed(0) + ' KB' : '?'}`);
  }
}

// --- Bounds: origin and facing ----------------------------------------------
// Walk the scene applying local transforms so the numbers match what Three.js
// will actually see, not raw mesh-space positions.
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];

function walk(node, m) {
  const t = node.getTranslation();
  const s = node.getScale();
  const local = [m[0] * s[0], m[1] * s[1], m[2] * s[2], m[3] + t[0] * m[0], m[4] + t[1] * m[1], m[5] + t[2] * m[2]];
  const mesh = node.getMesh();
  if (mesh) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const el = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el);
        for (let a = 0; a < 3; a++) {
          const v = el[a] * local[a] + local[3 + a];
          if (v < min[a]) min[a] = v;
          if (v > max[a]) max[a] = v;
        }
      }
    }
  }
  for (const child of node.listChildren()) walk(child, local);
}
for (const scene of root.listScenes()) {
  for (const node of scene.listChildren()) walk(node, [1, 1, 1, 0, 0, 0]);
}

if (min[0] !== Infinity) {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  console.log('\nBOUNDS');
  console.log(`  size   X ${size[0].toFixed(3)}  Y ${size[1].toFixed(3)}  Z ${size[2].toFixed(3)}`);
  console.log(`  min    X ${min[0].toFixed(3)}  Y ${min[1].toFixed(3)}  Z ${min[2].toFixed(3)}`);
  console.log(`  max    X ${max[0].toFixed(3)}  Y ${max[1].toFixed(3)}  Z ${max[2].toFixed(3)}`);

  const tallest = size.indexOf(Math.max(...size));
  console.log(`\n  up axis     ${'XYZ'[tallest]} is longest -> ${tallest === 1 ? 'Y-up, correct' : 'NOT Y-up, needs rotating'}`);

  const footY = Math.abs(min[1]);
  const scaleRef = size[1] || 1;
  console.log(`  origin      feet sit ${min[1].toFixed(3)} on Y (${((footY / scaleRef) * 100).toFixed(1)}% of height off zero)`);
  console.log(`              ${footY / scaleRef < 0.02 ? 'OK - origin is at the feet' : 'OFFSET - the renderer will float or sink it'}`);
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  console.log(`  centring    X ${cx.toFixed(3)}  Z ${cz.toFixed(3)} ${Math.abs(cx) / scaleRef < 0.02 && Math.abs(cz) / scaleRef < 0.02 ? '(centred)' : '(off-centre - will orbit when it turns)'}`);
  console.log(`  depth/width Z/X = ${(size[2] / size[0]).toFixed(2)} ${size[2] > size[0] ? '(deeper than wide - may already face +Z)' : '(wider than deep - typical of an A-pose facing Z)'}`);
  console.log('\n  NOTE: facing cannot be determined from bounds alone. Verify in-game;');
  console.log('  the renderer rotates by atan2(headingX, headingY) and expects +Z forward.');
}
console.log('');
