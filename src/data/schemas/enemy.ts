import { z } from 'zod';
import { IdSchema, SpriteRefSchema } from './common';

export const EnemySchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  hp: z.number().positive(),
  speed: z.number().positive().describe('world units per second along the lane'),
  radius: z.number().positive().describe('body radius, world units (contact + render)'),
  coinValue: z.number().int().nonnegative().describe('coins dropped on death'),
  /**
   * XP granted on death. Optional — omitted falls back to `economy.xp
   * .perKillDefault`, so the whole roster works before a single value is
   * authored and a new enemy is never silently worth zero.
   *
   * Deliberately a separate number from `coinValue`. Gold buys commitment
   * (towers, the barracks); XP buys identity (perks, abilities). Tying them
   * together would collapse two currencies with different jobs into one
   * (TRIANGLE.md §B.4).
   */
  xpValue: z.number().nonnegative().optional(),
  siegeDps: z
    .number()
    .positive()
    .describe('gate damage per second while besieging — leaks never despawn (DESIGN §6)'),
  staggersHero: z
    .boolean()
    .describe('heavy enemies shove the hero on contact: knockback + ~0.4s control loss'),
  eliteEligible: z.boolean().describe('can spawn crowned (elite modifier)'),
  frontalBlock: z
    .object({
      arcDegrees: z.number().gt(0).lte(360),
      multiplier: z.number().min(0).lt(1).describe('damage factor for hits from the front'),
    })
    .optional()
    .describe('Shieldbearer: reduced damage from sources ahead of it — flank it or shoot it from behind'),
  ignoresSlows: z.boolean().optional().describe('Wolf Rider: immune to slows and freezes'),
  /**
   * Damage taken **while moving freely** — normal damage the moment it is slowed
   * or a soldier is holding it.
   *
   * The one trait in the roster whose counter is a *pillar* rather than a
   * quantity. Every other counter-trait — armour, speed, `flying`,
   * `blockImmune` — is answered by more towers; this one cannot be, because
   * rate alone never hinders anything. It is the enemy that makes exposure
   * mandatory instead of merely efficient, and the reason a tower board can be
   * necessary without ever being sufficient (TRIANGLE.md).
   */
  momentumArmor: z
    .object({
      multiplier: z.number().gt(0).lt(1).describe('damage factor while unhindered'),
    })
    .optional()
    .describe('Juggernaut: nearly impervious in motion, ordinary once stopped or slowed'),
  armor: z
    .number()
    .min(0)
    .max(0.9)
    .default(0)
    .describe(
      'fraction of incoming damage removed, unless the source ignoresArmor. The counter ' +
        'to single-target physical fire that is not positional — see DESIGN §6 option A.',
    ),
  flying: z
    .boolean()
    .default(false)
    .describe(
      'airborne: towers with targetsFlying=false cannot shoot it at all (DESIGN §6 option B). ' +
        'The one hard counter a ground-only AoE tower has no answer to.',
    ),
  lootsCoins: z
    .object({
      detectRadius: z.number().positive(),
      fleeSpeedMultiplier: z.number().gte(1),
    })
    .optional()
    .describe('Looter: beelines for ground coins and flees back up the lane with them'),
  warCry: z
    .object({
      radius: z.number().positive(),
      speedMultiplier: z.number().gt(1),
      duration: z.number().positive(),
      interval: z.number().positive().describe('seconds between cries'),
    })
    .optional()
    .describe('Warlord: periodically hastes every other enemy in radius'),
  towerBreak: z
    .object({
      radius: z.number().positive(),
      cooldown: z.number().positive().describe('seconds between breaks per plot'),
    })
    .optional()
    .describe('Warlord: knocks a tower down one level when it stomps past'),
  /**
   * Outrider: rides straight through the line and cannot be held.
   *
   * The counter that keeps the army honest. A blocker that stops *everything*
   * would make the barracks an auto-include and collapse the build decision —
   * the same trap DESIGN §6 records for towers. Flying enemies get this for
   * free (ground soldiers cannot reach them) and do not need the flag.
   */
  blockImmune: z
    .boolean()
    .default(false)
    .describe('cannot be stopped by soldiers; walks through the line'),
  /**
   * Halberdier: cuts soldiers down far faster than it batters the gate.
   *
   * The other counter, and the more interesting one — it does not ignore the
   * army, it *beats* it, so the answer is towers covering the rally point
   * rather than skipping the barracks.
   */
  antiInfantry: z
    .number()
    .gt(1)
    .optional()
    .describe('damage multiplier against soldiers (its siegeDps is the base rate)'),
  spriteRef: SpriteRefSchema,
  /**
   * Model manifest id (models.json). Optional during the 3D migration so the
   * Phaser build keeps working off spriteRef; the renderer falls back to
   * placeholder geometry when absent. Replaces spriteRef at MG.7.
   */
  model: IdSchema.optional(),
});
export type Enemy = z.infer<typeof EnemySchema>;

/** One multiplier system over the whole roster (DESIGN §6). */
export const EliteConfigSchema = z.object({
  chance: z.number().min(0).max(1).describe('base spawn chance per eligible enemy (~1 in 12)'),
  hpMultiplier: z.number().gt(1),
  coinMultiplier: z.number().gt(1),
});
export type EliteConfig = z.infer<typeof EliteConfigSchema>;

/** enemies.json: elite dials + the roster. */
export const EnemiesFileSchema = z
  .object({
    elite: EliteConfigSchema,
    enemies: z.array(EnemySchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.enemies.forEach((e, i) => {
      if (seen.has(e.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['enemies', i, 'id'],
          message: `duplicate enemy id "${e.id}"`,
        });
      }
      seen.add(e.id);
    });
  });
export type EnemiesFile = z.infer<typeof EnemiesFileSchema>;
