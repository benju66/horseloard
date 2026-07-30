import { z } from 'zod';

/**
 * economy.json — run-economy dials. M0.5 extends this with coin physics
 * (magnet radius, expiry, wave-clear bonus, early-start bonus).
 */
export const EconomySchema = z.object({
  startingGold: z.number().int().nonnegative(),
});
export type Economy = z.infer<typeof EconomySchema>;
