import { z } from 'zod';
import { IdSchema } from './common';

/** One spawn group: `count` enemies of one type onto one lane. Groups overlap via `delay` to interleave types. */
export const WaveEntrySchema = z.object({
  enemyId: IdSchema,
  count: z.number().int().min(1),
  spacing: z.number().nonnegative().describe('seconds between spawns within this entry'),
  laneId: IdSchema.describe('must exist on the map this wave set belongs to'),
  delay: z.number().nonnegative().describe('seconds after wave start before first spawn'),
});
export type WaveEntry = z.infer<typeof WaveEntrySchema>;

export const WaveSchema = z.object({
  entries: z.array(WaveEntrySchema).min(1),
  supplyDrop: z
    .object({
      delay: z.number().nonnegative().describe('seconds after wave start'),
      x: z.number(),
      y: z.number(),
      value: z.number().int().positive(),
      lifetime: z.number().positive().describe('seconds before the chest despawns'),
    })
    .optional()
    .describe('an off-path chest — free coins if you ride for it (DESIGN §8)'),
  archetypeId: IdSchema.optional().describe(
    'named special wave (horde/raid/war-party) — shows a warning banner',
  ),
  hpMultiplier: z
    .number()
    .positive()
    .default(1)
    .describe('per-wave enemy HP scaling (prototype: 1.17^(wave-1))'),
});
export type Wave = z.infer<typeof WaveSchema>;

/** waves/<map>.json: the authored wave set for one map. Endless mode feeds this same schema from a generator. */
export const WaveSetSchema = z.object({
  mapId: IdSchema,
  waves: z.array(WaveSchema).min(1),
});
export type WaveSet = z.infer<typeof WaveSetSchema>;
