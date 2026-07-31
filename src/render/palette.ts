import * as THREE from 'three';

/**
 * The flat-palette texturing workflow (MIGRATION-3D.md Part A): one small
 * texture holds every colour the game uses, and model UVs point at a patch of
 * it. One material, one texture, one draw-call family for the whole roster —
 * which is most of how the perf budget gets met.
 *
 * Generated in code rather than shipped as a file so the palette stays a
 * single source of truth and recolouring is a diff, not an art task.
 */

/** Colours are laid out left-to-right in a single row; index = UV.x slot. */
export const PALETTE = [
  '#4a7c3a', // grass
  '#548a41', // grass alt
  '#c9a86a', // path
  '#a5814a', // path edge
  '#8f8f96', // stone
  '#6a6a72', // stone dark
  '#6b4a2b', // wood
  '#4a3018', // wood dark
  '#f6c945', // gold
  '#3b5dc9', // hero blue
  '#c4452e', // enemy red
  '#e8b88a', // skin
] as const;

const SWATCH_PX = 16;

/** Build the palette texture. Nearest filtering — patches must not bleed. */
export function makePaletteTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = PALETTE.length * SWATCH_PX;
  canvas.height = SWATCH_PX;
  const ctx = canvas.getContext('2d')!;
  PALETTE.forEach((hex, i) => {
    ctx.fillStyle = hex;
    ctx.fillRect(i * SWATCH_PX, 0, SWATCH_PX, SWATCH_PX);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** UV offset that lands on a given palette slot's centre. */
export function paletteUV(slot: number): number {
  return (slot + 0.5) / PALETTE.length;
}

/**
 * Remap a geometry's UVs so every vertex samples one palette slot. This is what
 * makes a whole model "the red one" without a per-model texture.
 */
export function tintGeometry(geometry: THREE.BufferGeometry, slot: number): void {
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  const u = paletteUV(slot);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, 0.5);
  uv.needsUpdate = true;
}
