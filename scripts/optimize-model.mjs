/**
 * Model optimiser — the `asset:add` step from MIGRATION-3D.md Part A.2.
 *
 *   node scripts/optimize-model.mjs <file.glb> [clipToKeep ...]
 *
 * CC0 character packs ship enormous animation libraries: a KayKit skeleton
 * carries 95 clips at ~15-24 KB each, which is ~4.6 MB of a 4.6 MB file. The
 * game plays six logical states. Keeping only the clips the manifest maps is
 * therefore the single biggest win available, worth far more than mesh or
 * texture work — the geometry is already under 5k vertices and the texture is
 * 17 KB.
 *
 * Clip names are matched case-insensitively; a name that matches nothing is
 * reported rather than silently ignored, because a typo here would quietly
 * ship a model that cannot animate.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { execFileSync } from 'node:child_process';
import { writeFileSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [, , file, ...keep] = process.argv;
if (!file) {
  console.error('usage: node scripts/optimize-model.mjs <file.glb> [clipToKeep ...]');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const before = statSync(file).size;
const doc = await io.read(file);
const root = doc.getRoot();

const wanted = keep.map((k) => k.toLowerCase());
const animations = root.listAnimations();
const kept = [];
const matched = new Set();

for (const anim of animations) {
  const name = anim.getName();
  const hit = wanted.find((w) => name.toLowerCase() === w);
  if (hit) {
    matched.add(hit);
    kept.push(name);
  } else if (wanted.length > 0) {
    anim.dispose();
  }
}

const missed = wanted.filter((w) => !matched.has(w));
if (missed.length > 0) {
  console.error(`  ! no clip matched: ${missed.join(', ')}`);
  console.error(`    available: ${animations.map((a) => a.getName()).join(', ')}`);
  process.exit(2);
}

// Write the clip-filtered document, then hand it to gltf-transform's own
// optimize pass. Rolling prune/weld/dedup by hand left ~2.8 MB of orphaned
// buffer data behind; the CLI pass reclaims it properly.
const tmp = `${file}.tmp.glb`;
writeFileSync(tmp, await io.writeBinary(doc));

// `quantize`, not `draco`: draco is smaller (204 KB vs 351 KB on a KayKit
// skeleton) but needs DRACOLoader plus a wasm decoder shipped and wired.
// KHR_mesh_quantization is supported natively by three's GLTFLoader, so this
// costs nothing at runtime.
// Run the CLI's entry directly on this node. Spawning `npx` is not portable
// here (no shell; npx.cmd is not directly executable), and the package does
// not export ./bin/cli.js, so resolve() cannot reach it either.
const cli = fileURLToPath(new URL('../node_modules/@gltf-transform/cli/bin/cli.js', import.meta.url));
execFileSync(
  process.execPath,
  [cli, 'optimize', tmp, file, '--compress', 'quantize', '--texture-compress', 'webp'],
  { stdio: 'pipe' },
);
rmSync(tmp, { force: true });
const after = statSync(file).size;

const pct = ((1 - after / before) * 100).toFixed(1);
console.log(
  `  ${file.split(/[\\/]/).pop()}: ${(before / 1e6).toFixed(2)} MB → ${(after / 1e6).toFixed(2)} MB ` +
    `(-${pct}%)  clips ${animations.length} → ${kept.length || animations.length}`,
);
