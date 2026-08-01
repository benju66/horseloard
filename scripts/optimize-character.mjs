/**
 * Character optimiser — for AI-generated models (Meshy and similar).
 *
 * Distinct from optimize-model.mjs, which strips surplus animation clips off CC0
 * packs. AI exports have the opposite problem: no clips at all, but a photoreal
 * triangle count and a full PBR material set aimed at a renderer this game is
 * deliberately not. A raw Meshy character arrives at ~435k triangles and 38 MB,
 * against a budget of ~3k and a whole-app target of a few MB.
 *
 * Four passes, in the order that matters:
 *
 *   1. weld + simplify   — collapse to the target triangle count. Welding first
 *                          is required; simplify cannot collapse across seams
 *                          that duplicate vertices split apart.
 *   2. strip PBR         — drop normal, metallicRoughness, occlusion and
 *                          emissive. The game lights flat albedo under its own
 *                          dusk rig (MIGRATION-3D Part A.1); these maps are dead
 *                          weight and actively fight that lighting.
 *   3. shrink albedo     — a palette-flat character needs no more than 256px.
 *   4. origin to feet    — exporters centre on the bounding box; the renderer
 *                          places models by their feet, so an uncorrected model
 *                          sinks halfway into the ground.
 *
 *   node scripts/optimize-character.mjs <in.glb> [out.glb] [--tris=6000] [--tex=256]
 *
 * Triangle budget is per-model on purpose: exactly one hero is ever on screen,
 * so it can afford several times what a grunt gets when forty of them spawn.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, textureCompress, center } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : dflt;
};

const [input, output = input.replace(/\.glb$/i, '.opt.glb')] = files;
if (!input) {
  console.error('usage: node scripts/optimize-character.mjs <in.glb> [out.glb] [--tris=6000] [--tex=256]');
  process.exit(1);
}

const targetTris = flag('tris', 6000);
const targetTex = flag('tex', 256);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const before = statSync(input).size;

const countTris = () => {
  let t = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      t += idx ? idx.getCount() / 3 : pos ? pos.getCount() / 3 : 0;
    }
  }
  return Math.round(t);
};

const trisBefore = countTris();
console.log(`\n${input}`);
console.log(`  in    ${(before / 1024 / 1024).toFixed(1)} MB, ${trisBefore.toLocaleString()} tris`);

// --- 1. Decimate -------------------------------------------------------------
await MeshoptSimplifier.ready;
const ratio = Math.min(1, targetTris / Math.max(1, trisBefore));
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.005, lockBorder: false }),
);
console.log(`  simplify  ratio ${ratio.toFixed(4)} -> ${countTris().toLocaleString()} tris`);

// --- 2. Strip the PBR maps the game will never light -------------------------
let stripped = 0;
for (const mat of root.listMaterials()) {
  for (const slot of ['NormalTexture', 'MetallicRoughnessTexture', 'OcclusionTexture', 'EmissiveTexture']) {
    if (mat[`get${slot}`]()) {
      mat[`set${slot}`](null);
      stripped++;
    }
  }
  // Emissive factor left non-zero without its map would glow flat.
  mat.setEmissiveFactor([0, 0, 0]);
  mat.setMetallicFactor(0);
  mat.setRoughnessFactor(1);
}
console.log(`  stripped  ${stripped} PBR map slots`);

// --- 3. Shrink what's left ---------------------------------------------------
await doc.transform(
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [targetTex, targetTex] }),
);

// --- 4. Origin to the feet ---------------------------------------------------
await doc.transform(center({ pivot: 'below' }));

await io.write(output, doc);
const after = statSync(output).size;
console.log(`  out   ${(after / 1024 / 1024).toFixed(2)} MB, ${countTris().toLocaleString()} tris`);
console.log(`  saved ${(100 - (after / before) * 100).toFixed(1)}%  ->  ${output}\n`);
