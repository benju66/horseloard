/**
 * Rewrite a .glb's material base colours.
 *
 *   node scripts/retint-model.mjs <file.glb> <materialName>=<#rrggbb> [...]
 *
 * Why this exists: the Kenney kits are Unity exports whose materials pointed at
 * a shared `Textures/colormap.png` that was never downloaded with them. The
 * Castle and Tower-Defense kits left `baseColorFactor` at pure white, which
 * `ModelViewFactory.repairUntextured` recognises and replaces with the manifest
 * tint. The Nature kit did not: it was re-exported through glTF-Transform and
 * kept whatever factors happened to be sitting in the material, which are junk
 * — `leafsGreen` is teal (0.161, 0.788, 0.671) and `woodBark` is salmon. Those
 * are not white, so the repair path deliberately skips them, and the props
 * render in colours nobody chose.
 *
 * Retinting by material *name* rather than by index keeps the trunk/foliage
 * split intact, which flattening to a single manifest tint would destroy. The
 * names survived the export even though the colours did not.
 *
 * glTF `baseColorFactor` is defined in LINEAR space, so the sRGB hex you pass
 * here is converted before it is written. Passing sRGB values straight through
 * is the usual way this goes wrong and produces washed-out models.
 *
 * Edits the JSON chunk directly, in the style of strip-missing-texture.mjs:
 * gltf-transform's NodeIO wants to resolve resources on read, and these files
 * are exactly the ones where that is awkward.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'

/** sRGB channel (0..1) → linear. The glTF spec's transfer function. */
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToLinearRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => +srgbToLinear(v / 255).toFixed(6));
}

function retint(file, byName) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${file}: not a GLB`);

  const jsonLength = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== CHUNK_JSON) throw new Error(`${file}: first chunk is not JSON`);
  const jsonStart = 20;
  const rest = buf.subarray(jsonStart + jsonLength); // BIN chunk, untouched
  const gltf = JSON.parse(buf.subarray(jsonStart, jsonStart + jsonLength).toString('utf8'));

  const applied = [];
  for (const material of gltf.materials ?? []) {
    const rgb = byName.get(material.name);
    if (!rgb) continue;
    const pbr = (material.pbrMetallicRoughness ??= {});
    const alpha = pbr.baseColorFactor?.[3] ?? 1;
    pbr.baseColorFactor = [...rgb, alpha];
    // Flat-shaded look: no spec highlight to fight the key light (ART-BRIEF §3).
    pbr.metallicFactor = 0;
    pbr.roughnessFactor = 1;
    applied.push(material.name);
  }
  if (applied.length === 0) {
    const known = (gltf.materials ?? []).map((m) => m.name).join(', ');
    return { file, skipped: `no material matched (has: ${known || 'none'})` };
  }

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

  writeFileSync(file, Buffer.concat([header, json, rest]));
  return { file, applied };
}

const [, , file, ...pairs] = process.argv;
if (!file || pairs.length === 0) {
  console.error('usage: node scripts/retint-model.mjs <file.glb> <materialName>=<#rrggbb> [...]');
  process.exit(1);
}

const byName = new Map();
for (const pair of pairs) {
  const at = pair.indexOf('=');
  if (at < 0) throw new Error(`expected name=#rrggbb, got: ${pair}`);
  byName.set(pair.slice(0, at), hexToLinearRgb(pair.slice(at + 1)));
}

const r = retint(file, byName);
if (r.skipped) console.log(`  skip  ${r.file} — ${r.skipped}`);
else console.log(`  ok    ${r.file}  retinted: ${r.applied.join(', ')}`);
