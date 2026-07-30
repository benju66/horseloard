import { z } from 'zod';

/**
 * economy.json — all run-economy dials: coin physics, refunds, bonuses,
 * gate repair. Coins expire only during combat; wave clear sweeps the
 * ground (DESIGN §7 — both are invariants, not dials).
 */
export const EconomySchema = z.object({
  startingGold: z.number().int().nonnegative(),
  sellRefund: z
    .number()
    .gt(0)
    .lte(1)
    .describe('fraction of total invested coins returned on tower sell (0.7)'),
  coins: z.object({
    magnetRadius: z.number().positive().describe('world units around the hero'),
    collectRadius: z.number().positive(),
    expirySeconds: z.number().positive().describe('lifetime of an uncollected coin during combat'),
    magnetSpeed: z.number().positive().describe('world units per second toward the hero'),
  }),
  waveClearBonus: z.object({
    base: z.number().int().nonnegative(),
    perWave: z.number().int().nonnegative().describe('bonus = base + perWave × waveNumber'),
  }),
  earlyStart: z.object({
    windowSeconds: z.number().positive().describe('bonus decays to 0 over this build-phase time'),
    maxBonus: z.number().int().nonnegative(),
  }),
  repair: z.object({
    hpPerPurchase: z.number().int().positive().describe('gate HP restored per repair tap'),
    costPerHp: z.number().positive().describe('coins per HP restored'),
  }),
  stars: z.object({
    twoStarMaxDamageFraction: z
      .number()
      .gt(0)
      .lt(1)
      .describe('2★ if gate damage taken ≤ this fraction of max HP; 3★ = untouched; 1★ = survived'),
  }),
});
export type Economy = z.infer<typeof EconomySchema>;
