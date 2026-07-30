import { z } from 'zod';
import { IdSchema } from './common';

/**
 * archetypes.json — named special waves (Horde / Raid / War Party).
 * A wave referencing one gets a warning banner; the composition itself is
 * plain wave data (DESIGN §8).
 */
export const ArchetypeSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).describe('banner headline, e.g. "RAID"'),
  subtitle: z.string().min(1).describe('one-line warning under the headline'),
});
export type Archetype = z.infer<typeof ArchetypeSchema>;

export const ArchetypesFileSchema = z
  .object({
    archetypes: z.array(ArchetypeSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.archetypes.forEach((a, i) => {
      if (seen.has(a.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['archetypes', i, 'id'],
          message: `duplicate archetype id "${a.id}"`,
        });
      }
      seen.add(a.id);
    });
  });
export type ArchetypesFile = z.infer<typeof ArchetypesFileSchema>;
