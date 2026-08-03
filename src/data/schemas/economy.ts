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
  /**
   * Career XP — the **only** progression currency (SKILLTREE.md A.2).
   *
   * This block was `tokens` until M6.2. Tokens and XP were two currencies
   * buying the same kind of thing through two different screens, which is
   * exactly the confusion DESIGN §15 warns about. Now: gold buys commitment
   * inside a run, career XP buys identity between them.
   *
   * Everything below is denominated in the same XP a kill grants, so the
   * campaign bonuses and the fighting sit on one scale and can be compared.
   */
  career: z.object({
    perStarFirstTime: z.number().int().positive().describe('XP per newly earned star on a map'),
    perWaveOnDefeat: z.number().int().nonnegative().describe('loss payout — a failed run is progress'),
    endlessMilestoneEvery: z.number().int().positive(),
    perEndlessMilestone: z.number().int().positive(),
    /**
     * Career level curve: level n costs `base × growth^(n-2)` XP.
     *
     * Deliberately the same shape as the in-run curve below, because they are
     * measuring the same thing at two scales — and a player who has learned to
     * read one bar should not have to learn a second.
     */
    level: z.object({
      base: z.number().positive(),
      growth: z.number().gt(1),
    }),
  }),
  /**
   * The XP curve that replaces `everyNWaves` as the draft's cadence
   * (TRIANGLE.md §B.4). Kills grant XP, XP grants levels, **every level deals a
   * draft** — so riding out to fight *is* progression, which is DESIGN §1's
   * first pillar finally wired to the reward loop instead of sitting beside it.
   *
   * Target is ~25–35 levels on a full map, not ~12. Vampire Survivors fires
   * this loop every 20–40 seconds and that cadence is the whole dopamine spine;
   * one card per wave was never going to feel like a build coming together.
   *
   * `base × growth^(n-1)` for the nth level. Geometric rather than a table so
   * the curve keeps working on a 14-wave map and in endless, where a table
   * would simply run out.
   */
  xp: z.object({
    base: z.number().positive().describe('XP for level 2'),
    growth: z.number().gte(1).describe('multiplier per level; 1 = flat'),
    perKillDefault: z.number().nonnegative().describe('XP for an enemy with no xpValue'),
    eliteMultiplier: z.number().gte(1),
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
