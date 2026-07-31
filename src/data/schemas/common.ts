import { z } from 'zod';

/** All content ids are kebab-case and stable — they appear in saves and telemetry. */
export const IdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'ids are kebab-case (e.g. "wolf-rider")');

/** World-space position. The world is a fixed logical space per map (prototype: 420x780). */
export const Vec2Schema = z.object({ x: z.number(), y: z.number() });
export type Vec2 = z.infer<typeof Vec2Schema>;

/** Key into a sprite atlas. Placeholder strings until the art pass; swapping art never touches engine code. */
export const SpriteRefSchema = z.string().min(1);

/** Key into the sfx manifest. */
export const SfxRefSchema = z.string().min(1);

/** `#rrggbb`. Render-layer data — the engine never reads these. */
export const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'colors are #rrggbb');
