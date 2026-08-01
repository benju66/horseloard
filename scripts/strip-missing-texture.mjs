/**
 * Remove a dangling external texture reference from a .glb.
 *
 * The Kenney Castle and Tower-Defense kits are Unity exports pointing at
 * `Textures/colormap.png`, which was never downloaded with them. The renderer
 * already repairs the resulting bare-white materials by substituting the
 * manifest tint, so the models look right — but the loader still *asks* for the
 * file on every boot, producing a failed request and a console error per model.
 * Sixteen wasted round trips on a phone, and noise that would mislead anyone
 * debugging a real texture problem later.
 *
 * Done by editing the JSON chunk directly rather than through gltf-transform:
 * its NodeIO refuses to even open these files, because resolving the missing
 * resource is part of reading them.
 *
 *   node scripts/strip-missing-texture.mjs <file.glb> [...]
 *
 * A glTF material with no baseColorTexture falls back to baseColorFactor, which
 * these exports leave at pure white — exactly the signature
 * ModelViewFactory.repairUntextured looks for. So stripping the reference does
 * not change how anything renders; it only stops the doomed request.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'

function stripTextures(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${file}: not a GLB`);

  const jsonLength = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== CHUNK_JSON) throw new Error(`${file}: first chunk is not JSON`);
  const jsonStart = 20;
  const rest = buf.subarray(jsonStart + jsonLength); // BIN chunk, untouched
  const gltf = JSON.parse(buf.subarray(jsonStart, jsonStart + jsonLength).toString('utf8'));

  const external = (gltf.images ?? []).some((img) => typeof img.uri === 'string');
  if (!external) return { file, skipped: 'no external image reference' };

  for (const material of gltf.materials ?? []) {
    delete material.pbrMetallicRoughness?.baseColorTexture;
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    delete material.pbrMetallicRoughness?.metallicRoughnessTexture;
  }
  delete gltf.images;
  delete gltf.textures;
  delete gltf.samplers;

  // TEXCOORD attributes are now unreferenced. Left in place deliberately: they
  // are a few KB, and removing them means rewriting accessors, bufferViews and
  // every index that follows — a far larger blast radius than this is worth.

  // The JSON chunk must be padded with spaces to a 4-byte boundary.
  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  if (pad) json = Buffer.concat([json, Buffer.from(' '.repeat(pad))]);

  const header = Buffer.alloc(20);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4); // version
  header.writeUInt32LE(20 + json.length + rest.length, 8); // total length
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(CHUNK_JSON, 16);

  const out = Buffer.concat([header, json, rest]);
  writeFileSync(file, out);
  return { file, before: buf.length, after: out.length };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/strip-missing-texture.mjs <file.glb> [...]');
  process.exit(1);
}
for (const f of files) {
  const r = stripTextures(f);
  if (r.skipped) console.log(`  skip  ${r.file} — ${r.skipped}`);
  else console.log(`  ok    ${r.file}  ${r.before} → ${r.after} bytes`);
}
