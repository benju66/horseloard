import { z } from 'zod';

/**
 * The one rule a biome plays under (BIOMES.md Part C.4). A closed enum the sim
 * reads — the same shape as `RuleKeySchema`, named per biome rather than per
 * build. Deliberately NOT stackable and NOT parameterised per level: a biome
 * has exactly one, and every level in it plays under the same one. That is
 * what makes it a *place* rather than a modifier.
 */
export const TerrainRuleSchema = z.enum(['narrow-cuts', 'open-country']);
export type TerrainRule = z.infer<typeof TerrainRuleSchema>;

/**
 * What each rule does, applied by the Simulation at construction to its own
 * cloned data. Missing keys mean ×1. Fixed here rather than in biomes.json on
 * purpose — a rule whose numbers vary per biome is a modifier wearing a rule's
 * name. The sim iterates this table generically, so adding a third rule is an
 * enum member and a row here: no engine change, and no rule name ever appears
 * in engine source.
 */
export const TERRAIN_RULES: Record<
  TerrainRule,
  { towerRange?: number; towerDamage?: number; enemySpeed?: number }
> = {
  /**
   * The walls are close. Coverage stops being free and plot choice matters
   * more than plot count — but what a tower does cover, it shreds.
   *
   * The damage half arrived by measurement: as a bare −18% range tax the rule
   * collapsed every low-tower playstyle at once (25% win, two of three bots at
   * zero), which is the flat-tax failure M9 documented for enemies — punishing
   * every composition instead of asking a question. A rule, like a keystone,
   * has to be a trade.
   */
  'narrow-cuts': { towerRange: 0.82, towerDamage: 1.15 },
  /** Long sightlines both ways. Being in the right place matters more than holding the line. */
  'open-country': { towerRange: 1.1, enemySpeed: 1.12 },
};
