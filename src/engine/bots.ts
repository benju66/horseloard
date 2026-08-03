import type {
  Ability,
  EnemiesFile,
  Economy,
  Hero,
  MapDef,
  Perk,
  PerksFile,
  Projectile,
  TowerStats,
  TowersFile,
  WaveSet,
} from '../data/schemas';
import type { EnemyInstance } from './enemySystem';
import { marginalCoverage, plotCoverage, sampleLanes, type LaneSample, type Watcher } from './coverage';
import { SIM_DT, Simulation } from './simulation';
import type { PlotState } from './towerSystem';

/**
 * Headless bot players — the active-play counterpart to the lazy baseline.
 *
 * The lazy baseline (balance.harness.test.ts) answers "is this map too easy
 * for someone doing nothing?". These answer the questions that decide whether
 * the game is actually good: does one strategy dominate every map, is any
 * tower dead weight, does a map have exactly one answer? Bots drive the same
 * Simulation the phone does, at fixed timestep behind a seeded rng, so every
 * run reproduces exactly.
 *
 * SUBSTRATE RULE (CLAUDE.md #1): nothing here names a tower, enemy, map,
 * plot or ability. Bots rank towers from their schema stats and dispatch
 * abilities on effect TYPE — engine vocabulary, not content. Tower #5 gets
 * evaluated by these bots the day its JSON lands, zero edits to this file.
 * substrate.test.ts enforces that.
 */

// ─── Valuation weights — the bots' "taste". Tune here, never in the policies ───

/** Range that scores as 1.0; a tower's value scales linearly against it. */
const RANGE_REFERENCE = 120;
/**
 * A total freeze is worth this much dps — control is damage you don't have to
 * deal. Lowered from 60 after the solo-carry probe showed frost was the
 * *weakest* carry while the model was picking it for ~90% of builds.
 *
 * A sweep (22/32/40/60) showed the greedy scorer flips between monocultures
 * rather than mixing — at 32 it builds only bombard, at 40 only frost. That is
 * a property of picking the single best value-per-coin every time, not a bug,
 * and it means the free-choice preference numbers are NOT evidence about tower
 * strength. The `[solo carry]` table is the instrument that answers that.
 */
const CONTROL_TO_DPS = 40;
/** Blast radius that counts as one extra body hit. */
const SPLASH_UNIT = 40;
/** Income buys towers gradually, so they fight for ~half the remaining run. */
const INCOME_RAMP = 0.5;
/** Wave length assumed before the sim has run a wave to measure. */
const ASSUMED_WAVE_SECONDS = 45;

// ─── Behaviour tuning ───

/** Enemies inside this radius of the hero make an aoe ability worth casting. */
const CLUSTER_RADIUS = 90;
const CLUSTER_MIN_TARGETS = 3;
/** Alive-enemy count that makes a global tower buff worth spending. */
const BUFF_MIN_ENEMIES = 5;
/** Stop steering when this close to the target — anything tighter jitters. */
const ARRIVE_EPSILON = 6;
/** Longest a single wave may run before we call the run stalled. */
const MAX_WAVE_SECONDS = 240;
/**
 * Roster-average siege dps, used to guess how long a soldier survives.
 *
 * A constant rather than a read of enemies.json because the spender only ever
 * sees the tower file. It is a heuristic inside a heuristic — it only has to
 * rank a barracks against an archer, not predict a fight.
 */
const ASSUMED_SIEGE_DPS = 6;
/**
 * How much of a neighbour's dps a held enemy actually eats. Well under 1: a
 * blocked enemy is one target among several, and towers were already shooting
 * something.
 */
const EXPOSURE_AMPLIFICATION = 0.45;
/** Worth of stopping one enemy with no towers watching — small, but not zero. */
const BLOCK_FLOOR = 1.5;

function projectileById(file: TowersFile, id: string | null | undefined): Projectile | null {
  if (!id) return null;
  return file.projectiles.find((p) => p.id === id) ?? null;
}

/**
 * A tower's fighting worth per second, in damage-equivalent units. Combat
 * only — economy and support are scored separately below, because both
 * depend on run context that a stats blob can't see.
 *
 * Reads only schema fields, so new towers, new branches and new projectile
 * behaviours get scored automatically.
 */
export function combatValue(stats: TowerStats, def: Projectile | null): number {
  let dps = stats.fireInterval > 0 ? stats.damage / stats.fireInterval : 0;
  if (stats.crit) dps *= 1 + stats.crit.chance * (stats.crit.multiplier - 1);
  let reach = stats.range;

  if (def?.behavior === 'aoe') {
    dps *= 1 + def.radius / SPLASH_UNIT; // splash lands on more than one body
    if (def.bomblets) dps += (def.bomblets.count * def.bomblets.damage) / stats.fireInterval;
    if (def.stun) dps += CONTROL_TO_DPS * (1 - def.stun.factor) * 0.5;
  }

  if (def?.behavior === 'aura') {
    // Auras tick on their own interval and are usually control, not damage.
    reach = def.radius;
    dps = def.tickInterval > 0 ? stats.damage / def.tickInterval : 0;
    if (def.slow) dps += CONTROL_TO_DPS * (1 - def.slow.factor);
    if (def.vulnerability) dps += CONTROL_TO_DPS * (def.vulnerability - 1);
  }

  return dps * (reach / RANGE_REFERENCE);
}

/**
 * What an economy tower is actually worth: not its coins-per-second, but the
 * fighting power those coins eventually buy before the run ends.
 *
 * The first version of this file scored income instantaneously, which made
 * every mill look like ~1 dps and guaranteed no bot ever built one. That was
 * a bug in the bot, not a verdict on the tower. Scoring against the remaining
 * run correctly makes an early mill strong and a late one worthless.
 */
export function incomeValue(
  stats: TowerStats,
  horizonSeconds: number,
  valuePerGold: number,
): number {
  if (!stats.income) return 0;
  const goldEarned = (stats.income.value / stats.income.interval) * horizonSeconds;
  // The towers that gold buys arrive gradually, so they fight for roughly
  // half the remaining run on average.
  return goldEarned * valuePerGold * INCOME_RAMP;
}

/**
 * What a garrison is worth: not what it kills, but what it *holds still*.
 *
 * Exposure is a different factor from rate (TRIANGLE.md §B.2), so it cannot be
 * scored as damage. A held enemy is a body standing inside whatever the
 * neighbouring towers cover, which means the value of the block is the fire it
 * eats — so this multiplies the combat already in range rather than adding to
 * it. A barracks with nothing near it is nearly worthless, and one posted in
 * front of an archer line is worth more than the archers cost. That asymmetry
 * is the pillar, and a scorer that missed it would never build the tower.
 *
 * **Scored against what actually covers the post, with no projection.** The
 * obvious fix for "the first barracks is worth nothing" is to score it against
 * the fire that will *eventually* arrive, the way `incomeValue` above scores
 * against the run still to come. Measured, that was strictly worse: it made a
 * barracks the single best opening buy on every map, the bot opened with one,
 * and every run died on wave 1 with two kills. A complement projected forward
 * stops being a complement.
 *
 * The honest numbers rank it exactly right on their own — measured on
 * meadow-road with three archers standing, a barracks on a covered plot scores
 * 0.40 against a fresh archer's 0.41 and an archer upgrade's 0.28. Below the
 * next tower, above the next upgrade. That is the whole model.
 */
export function exposureValue(
  stats: TowerStats,
  neighbourCombat: number,
  assumedSiegeDps: number,
): number {
  const g = stats.garrison;
  if (!g) return 0;
  // How long one soldier survives the average attacker, and what fraction of
  // the time its post is therefore occupied at all.
  const holdSeconds = g.hp / Math.max(0.5, assumedSiegeDps);
  const duty = holdSeconds / (holdSeconds + g.respawn);
  const heldAtOnce = g.squad * duty;
  const ownDps = (g.damage / g.attackInterval) * g.squad;
  return heldAtOnce * (neighbourCombat * EXPOSURE_AMPLIFICATION + BLOCK_FLOOR) + ownDps;
}

/** What a support aura adds, measured against the neighbours actually in range. */
export function supportValue(stats: TowerStats, neighbourCombat: number): number {
  if (!stats.towerAura) return 0;
  return neighbourCombat * (stats.towerAura.damageMultiplier - 1);
}

/** Run context the economy and support models need. */
interface Valuation {
  /** seconds of run expected to remain — drives whether income can pay back */
  horizonSeconds: number;
  /** combat value one coin buys at the best rate on offer, self-calibrated from the roster */
  valuePerGold: number;
  /** combat value already standing within a given radius of a point */
  neighbourCombat: (x: number, y: number, radius: number) => number;
}

function totalValue(
  stats: TowerStats,
  def: Projectile | null,
  plot: PlotState,
  v: Valuation,
): number {
  return (
    combatValue(stats, def) +
    incomeValue(stats, v.horizonSeconds, v.valuePerGold) +
    supportValue(stats, stats.towerAura ? v.neighbourCombat(plot.x, plot.y, stats.towerAura.radius) : 0) +
    exposureValue(
      stats,
      // Everything that can shoot the stretch of road this garrison would hold.
      stats.garrison
        ? v.neighbourCombat(plot.x, plot.y, stats.garrison.rallyRange + stats.garrison.engageRadius)
        : 0,
      ASSUMED_SIEGE_DPS,
    )
  );
}

/** Value of a plot's current tower, 0 when empty. */
function currentValue(sim: Simulation, plot: PlotState, v: Valuation): number {
  const stats = sim.towerSystem.stats(plot);
  if (!stats) return 0;
  return totalValue(stats, sim.towerSystem.projectileDef(plot), plot, v);
}

/**
 * Build the run context. `horizonSeconds` comes from the sim's own clock —
 * average wave duration so far × waves left — so it self-corrects instead of
 * relying on a guessed run length.
 */
function valuation(sim: Simulation, file: TowersFile): Valuation {
  const elapsed = sim.tickCount * SIM_DT;
  const wavesDone = sim.waveRunner.waveNumber;
  const perWave = wavesDone > 0 ? elapsed / wavesDone : ASSUMED_WAVE_SECONDS;
  const wavesLeft = Math.max(0, sim.waveRunner.totalWaves - wavesDone);

  // Best combat-per-coin on offer anywhere in the roster — the exchange rate
  // between gold and fighting power.
  let valuePerGold = 0;
  for (const tower of file.towers) {
    const level1 = tower.levels[0];
    if (!level1) continue;
    const rate = combatValue(level1, projectileById(file, tower.projectileId)) / level1.cost;
    if (rate > valuePerGold) valuePerGold = rate;
  }

  return {
    horizonSeconds: perWave * wavesLeft,
    valuePerGold,
    neighbourCombat: (x, y, radius) => {
      let sum = 0;
      const rSq = radius * radius;
      for (const p of sim.towerSystem.plots) {
        if (p.towerId === null) continue;
        if ((p.x - x) ** 2 + (p.y - y) ** 2 > rSq) continue;
        const stats = sim.towerSystem.stats(p);
        if (stats) sum += combatValue(stats, sim.towerSystem.projectileDef(p));
      }
      return sum;
    },
  };
}

interface Purchase {
  /** value gained per coin spent — the only thing the greedy economist compares */
  efficiency: number;
  buy: () => boolean;
}

/**
 * Every purchase available right now, scored by value-per-coin. Build,
 * upgrade and branch all compete on the same axis, so the bot naturally
 * stops upgrading a maxed line and starts a new tower when that pays better.
 */
/**
 * How much a new build is discounted when it only re-watches road that is
 * already watched. A fully-overlapping tower still adds damage where it stands,
 * so it keeps most of its value — it just stops being worth as much as one that
 * opens new ground.
 */
const OVERLAP_FLOOR = 0.45;

function affordablePurchases(
  sim: Simulation,
  file: TowersFile,
  plots: readonly PlotState[],
  maxTowers: number,
  /** when set, the bot may only ever build this tower — the forced-composition probe */
  onlyTowerId: string | null,
  samples: readonly LaneSample[],
  garrisons: 'any' | 'only' | 'none' = 'any',
  noIncome = false,
): Purchase[] {
  const out: Purchase[] = [];
  const built = sim.towerSystem.plots.filter((p) => p.towerId !== null).length;
  const v = valuation(sim, file);

  // What the standing towers already watch. Recomputed per spend pass rather
  // than cached: a tower bought earlier in the same pass changes what the next
  // one is worth, which is exactly the effect this is here to capture.
  const watchers: Watcher[] = [];
  for (const p of sim.towerSystem.plots) {
    if (p.towerId === null) continue;
    const stats = sim.towerSystem.stats(p);
    if (stats) watchers.push({ x: p.x, y: p.y, reach: stats.range });
  }

  for (const plot of plots) {
    if (plot.towerId === null) {
      if (built >= maxTowers) continue;
      for (const tower of sim.towerSystem.roster) {
        if (onlyTowerId !== null && tower.id !== onlyTowerId) continue;
        const cost = sim.towerSystem.buildCost(tower.id);
        const level1 = tower.levels[0];
        if (cost === null || !level1 || cost > sim.gold) continue;
        if (garrisons === 'only' && !level1.garrison) continue;
        if (garrisons === 'none' && level1.garrison) continue;
        if (noIncome && level1.income) continue;
        // Breadth counts. Without this the greedy scorer stacks a corner and
        // leaves the rest of the road unwatched — measurably worse, and worse
        // the richer it gets.
        const { fresh, total } = marginalCoverage(samples, watchers, plot.x, plot.y, level1.range);
        const breadth = total > 0 ? OVERLAP_FLOOR + (1 - OVERLAP_FLOOR) * (fresh / total) : OVERLAP_FLOOR;
        const gain = totalValue(level1, projectileById(file, tower.projectileId), plot, v) * breadth;
        out.push({
          efficiency: gain / cost,
          buy: () => sim.buildTower(plot.plotId, tower.id),
        });
      }
      continue;
    }

    const tower = sim.towerSystem.getTower(plot.towerId);
    if (!tower) continue;
    const have = currentValue(sim, plot, v);

    const upCost = sim.towerSystem.upgradeCost(plot);
    if (upCost !== null && upCost <= sim.gold) {
      const next = tower.levels[plot.level]; // levels are 0-indexed; plot.level is 1-based
      if (next) {
        const gain = totalValue(next, projectileById(file, tower.projectileId), plot, v) - have;
        if (gain > 0) out.push({ efficiency: gain / upCost, buy: () => sim.upgradeTower(plot.plotId) });
      }
    }

    for (const branch of sim.towerSystem.branchOptions(plot)) {
      if (branch.cost > sim.gold) continue;
      const def = projectileById(file, branch.projectileId ?? tower.projectileId);
      const gain = totalValue(branch.stats, def, plot, v) - have;
      if (gain > 0) {
        out.push({
          efficiency: gain / branch.cost,
          buy: () => sim.branchTower(plot.plotId, branch.id),
        });
      }
    }
  }
  return out;
}

// ─── Steering helpers ───

function seek(sim: Simulation, tx: number, ty: number): void {
  const dx = tx - sim.hero.x;
  const dy = ty - sim.hero.y;
  const d = Math.hypot(dx, dy);
  if (d < ARRIVE_EPSILON) {
    sim.hero.input.x = 0;
    sim.hero.input.y = 0;
    return;
  }
  sim.hero.input.x = dx / d;
  sim.hero.input.y = dy / d;
}

function nearestBesieger(sim: Simulation): EnemyInstance | null {
  let best: EnemyInstance | null = null;
  let bestSq = Infinity;
  for (const e of sim.enemySystem.enemies) {
    if (e.state !== 'at-slot' && e.state !== 'to-slot') continue;
    const dSq = (e.x - sim.hero.x) ** 2 + (e.y - sim.hero.y) ** 2;
    if (dSq < bestSq) {
      bestSq = dSq;
      best = e;
    }
  }
  return best;
}

/** The enemy furthest along its lane — the next leak if nobody intervenes. */
function leadWalker(sim: Simulation): EnemyInstance | null {
  let best: EnemyInstance | null = null;
  for (const e of sim.enemySystem.enemies) {
    if (e.state !== 'walking') continue;
    if (!best || e.distance > best.distance) best = e;
  }
  return best;
}

/** A coin worth detouring for, or null. Chests have no magnet — ride onto them. */
function nearestPickup(sim: Simulation, maxDistance: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestSq = maxDistance * maxDistance;
  for (const c of sim.economy.coins) {
    const dSq = (c.x - sim.hero.x) ** 2 + (c.y - sim.hero.y) ** 2;
    if (dSq < bestSq) {
      bestSq = dSq;
      best = { x: c.x, y: c.y };
    }
  }
  return best;
}

function countWithin(sim: Simulation, x: number, y: number, radius: number): number {
  const rSq = radius * radius;
  let n = 0;
  for (const e of sim.enemySystem.enemies) {
    if ((e.x - x) ** 2 + (e.y - y) ** 2 <= rSq) n++;
  }
  return n;
}

/**
 * Abilities used to be cast from here, by a `castReady` helper that judged each
 * effect type against the field. That helper is gone — `AbilitySystem` fires
 * abilities itself now, using the same conditions, because play feedback said
 * the ability bar should not exist at all.
 *
 * The harness suppresses hero abilities the way it suppresses the bow: with
 * data. `withoutAbilities` hands a run an empty roster, exactly as
 * `withoutHeroDamage` hands it a zeroed bow — no engine flag exists for the
 * benefit of a probe.
 */

// ─── Policies ───

export interface BotPolicy {
  readonly name: string;
  /** Once per build phase, before the wave starts. */
  spend(sim: Simulation): void;
  /** Every tick while a wave is running. */
  steer(sim: Simulation): void;
  /**
   * Choose from a pending draft. Optional — omitted means "take the first
   * card", which is already a weighted random pick because the offer was dealt
   * by weighted sampling. Return null to decline.
   */
  pickPerk?(offer: readonly Perk[], sim: Simulation): string | null;
}

export type BotFactory = (towers: TowersFile, map: MapDef) => BotPolicy;

interface Plan {
  name: string;
  /** cap on simultaneous towers — the dial between turtling and riding */
  maxTowers: number;
  /** buy bow levels before towers while the bow costs less than this share of gold */
  bowShare: number;
  /** repair whenever the gate sits below this fraction of max */
  repairFloor: number;
  /** stay within this distance of the gate (Infinity = roam the whole map) */
  leash: number;
  /** restrict every build to this tower id — null = free choice */
  onlyTowerId?: string | null;
  /**
   * Build only towers that post a garrison — the army-only pillar probe.
   *
   * Selected by schema shape rather than by id, so this file still names no
   * content (CLAUDE.md #1) and a second garrison tower is included the day its
   * JSON lands.
   */
  onlyGarrison?: boolean;
  /** Skip garrison towers — isolates the tower pillar from the army one. */
  noGarrison?: boolean;
  /**
   * Skip economy towers.
   *
   * For the complement probe, which funds both arms generously on purpose. A
   * rich early bot massively overvalues income — `incomeValue` scales with the
   * whole remaining run, so at wave 0 a mill scores ~2.4× an archer, and a
   * funded bot buys nothing but mills and kills nothing at all. That is a real
   * bot bug worth its own fix; excluding economy towers keeps it from
   * swallowing a probe about something else.
   */
  noIncome?: boolean;
}

/**
 * One spender, two personalities. Both are greedy value-per-coin economists;
 * the plan decides how much goes into the field vs the rider.
 */
function makePolicy(plan: Plan): BotFactory {
  return (file, map) => {
    const samples: LaneSample[] = sampleLanes(map);
    const gate = map.gate.position;

    // Best plots first, measured in lane covered — works on any map, including
    // ones authored after this file was written.
    const reach =
      file.towers.reduce((max, t) => Math.max(max, t.levels[0]?.range ?? 0), 0) || RANGE_REFERENCE;

    return {
      name: plan.name,

      spend(sim) {
        const ranked = [...sim.towerSystem.plots].sort(
          (a, b) =>
            plotCoverage(samples, b.x, b.y, reach) - plotCoverage(samples, a.x, a.y, reach),
        );

        // Keep the gate standing first — repair buys survival, never stars.
        while (sim.gate.hp < sim.gate.maxHp * plan.repairFloor && sim.repairGate()) {
          /* keep repairing */
        }

        let spending = true;
        while (spending) {
          spending = false;

          const bowCost = sim.hero.nextBowCost();
          if (bowCost !== null && bowCost <= sim.gold * plan.bowShare && sim.buyBowUpgrade()) {
            spending = true;
            continue;
          }

          const options = affordablePurchases(
            sim,
            file,
            ranked,
            plan.maxTowers,
            plan.onlyTowerId ?? null,
            samples,
            plan.onlyGarrison ? 'only' : plan.noGarrison ? 'none' : 'any',
            plan.noIncome ?? false,
          );
          if (options.length === 0) continue;
          options.sort((a, b) => b.efficiency - a.efficiency);
          if (options[0]!.buy()) spending = true;
        }
      },

      steer(sim) {
        // A siege in progress outranks everything — leaks never despawn, so
        // the only way the gate stops taking damage is the rider.
        const besieger = nearestBesieger(sim);
        if (besieger) {
          seek(sim, besieger.x, besieger.y);
          return;
        }

        const lead = leadWalker(sim);
        const inLeash = (x: number, y: number) =>
          Math.hypot(x - gate.x, y - gate.y) <= plan.leash;

        if (lead && inLeash(lead.x, lead.y)) {
          seek(sim, lead.x, lead.y);
        } else {
          const coin = nearestPickup(sim, plan.leash);
          if (coin) seek(sim, coin.x, coin.y);
          else seek(sim, gate.x, gate.y);
        }
      },
    };
  };
}

/** Turtle: fill the field with towers, hold the gate, break sieges. */
export const defender: BotFactory = makePolicy({
  name: 'defender',
  maxTowers: Infinity,
  bowShare: 0.15,
  repairFloor: 0.8,
  leash: 320,
});

/** Cavalry: minimal field, maximal bow, intercept up the road. */
export const rider: BotFactory = makePolicy({
  name: 'rider',
  maxTowers: 2,
  bowShare: 0.6,
  repairFloor: 0.5,
  leash: Infinity,
});

/** Balanced: towers where they pay, hero where the pressure is. */
export const mixed: BotFactory = makePolicy({
  name: 'mixed',
  maxTowers: 4,
  bowShare: 0.35,
  repairFloor: 0.7,
  leash: Infinity,
});

export const BOTS: readonly BotFactory[] = [defender, rider, mixed];

/**
 * A mixed bot forbidden from building anything but one tower.
 *
 * This is the honest way to answer "is this tower dead weight?". The free-choice
 * bots only tell you which tower the *valuation model* prefers — so a tower they
 * never build might be weak, or the model might simply misjudge it. Forcing the
 * composition takes the model out of the loop: if a tower can carry a map alone,
 * it shows up in the win rate, whatever the scoring function thinks of it.
 *
 * The id is supplied by the caller from the roster — this file still names nothing.
 */
export function forcedComposition(towerId: string): BotFactory {
  return makePolicy({
    name: `only:${towerId}`,
    maxTowers: 4,
    bowShare: 0.35,
    repairFloor: 0.7,
    leash: Infinity,
    onlyTowerId: towerId,
  });
}

/**
 * Wrap any bot so it always takes one named perk when the draft offers it.
 *
 * The same argument as `forcedComposition`, and the project already paid to
 * learn it: a free-choice bot only tells you what it *happened* to be dealt and
 * chose, so a perk that correlates with wins might be strong, or might simply
 * be common. BACKLOG records the tower version of this mistake — "the
 * preference column is not evidence about tower strength". Forcing the pick
 * takes chance out of the loop: if a perk swings the win rate on its own, that
 * shows up directly.
 *
 * Falls through to the wrapped bot's own choice when the perk is not on offer,
 * so a run still drafts normally rather than stalling.
 */
// ─── Pillar probes (TRIANGLE.md MG5.1) ───
//
// The invariant these exist to measure: no single pillar clears a map alone,
// and any two together must. "No single *tower* carries" is retired — towers
// and the hero both produce damage, and two systems producing the same
// resource are substitutes forever, which is why four rounds of counter-tuning
// each worked and then came undone.
//
// Each probe removes one pillar's contribution while leaving the others' inputs
// intact, so a failure means "this pillar is insufficient" rather than "this
// bot was starved".

/**
 * Towers only: the hero still rides, still sweeps coins, still repairs — but
 * deals no damage.
 *
 * The economy is deliberately left alone. Parking the hero in a corner would
 * also starve the gold that buys towers, and the probe would then be measuring
 * a funding problem rather than a damage one.
 */
export const towersOnly: BotFactory = makePolicy({
  name: 'towers-only',
  maxTowers: Infinity,
  bowShare: 0, // a zeroed bow is not worth a coin
  repairFloor: 0.8,
  leash: Infinity, // roam for coins; the gold still has to come from somewhere
  // Garrisons are the army pillar, not this one. Leaving them buildable here
  // would quietly make 'towers only' mean 'towers and army', and the probe
  // would stop isolating anything.
  noGarrison: true,
});

/**
 * Towers **and** army, hero still silent — the complement arm.
 *
 * TRIANGLE §B.2 claims exposure multiplies rate. That claim is falsifiable in
 * exactly one place: this arm must beat `towersOnly` on the same wave budget.
 * If it does not, the barracks is a worse tower rather than a third pillar, and
 * the whole milestone was wrong.
 */
export const towersAndArmy: BotFactory = makePolicy({
  name: 'towers+army',
  maxTowers: Infinity,
  bowShare: 0,
  repairFloor: 0.8,
  leash: Infinity,
  noIncome: true,
});

/** The control arm for the complement probe: same exclusions, minus the garrison. */
export const combatTowersOnly: BotFactory = makePolicy({
  name: 'towers-only(combat)',
  maxTowers: Infinity,
  bowShare: 0,
  repairFloor: 0.8,
  leash: Infinity,
  noGarrison: true,
  noIncome: true,
});

/**
 * Army only: garrison towers and nothing else, with a hero that deals no damage.
 *
 * The arm that has to *fail*. Soldiers are meant to hold, not kill, so if this
 * ever wins a map the barracks has stopped being an exposure source and become
 * a fourth tower — which would put us back where M5 started, with two systems
 * producing the same resource.
 */
export const armyOnly: BotFactory = makePolicy({
  name: 'army-only',
  maxTowers: Infinity,
  bowShare: 0,
  repairFloor: 0.8,
  leash: Infinity, // still rides for coins; the probe is about damage, not funding
  onlyGarrison: true,
});

/** Hero only: never builds, buys every bow level, roams freely. */
export const heroOnly: BotFactory = makePolicy({
  name: 'hero-only',
  maxTowers: 0,
  bowShare: 1,
  repairFloor: 0.5,
  leash: Infinity,
});

/**
 * A hero config that lands no damage, for the towers-only probe.
 *
 * Data rather than an engine flag: the Simulation clones its balance data, so
 * handing it a zeroed hero is enough, and MG5.1 stays a measurement task with
 * no engine behaviour added for the benefit of tests.
 *
 * Stagger is left intact — it is physical presence, not damage, and removing it
 * would change how enemies path around the hero rather than how much they take.
 */
/**
 * A run with no hero abilities, for the towers-only and army-only probes.
 *
 * Data rather than an engine flag, for the same reason `withoutHeroDamage`
 * below is: the Simulation clones its balance data, so handing it an empty
 * roster is enough, and no probe gets to add behaviour to the engine.
 */
export function withoutAbilities<T extends { abilities: readonly Ability[] }>(data: T): T {
  return { ...data, abilities: [] };
}

export function withoutHeroDamage(hero: Hero): Hero {
  const out = structuredClone(hero);
  for (const level of out.bow.levels) level.damage = 0;
  out.trample.damage = 0;
  return out;
}

export function forcedPerk(inner: BotFactory, perkId: string): BotFactory {
  return (towers, map) => {
    const policy = inner(towers, map);
    return {
      ...policy,
      name: `${policy.name}+${perkId}`,
      spend: (sim) => policy.spend(sim),
      steer: (sim) => policy.steer(sim),
      pickPerk: (offer, sim) => {
        if (offer.some((p) => p.id === perkId)) return perkId;
        return policy.pickPerk?.(offer, sim) ?? offer[0]?.id ?? null;
      },
    };
  };
}

// ─── Runner ───

export interface BotRunResult {
  mapId: string;
  bot: string;
  seed: number;
  outcome: 'win' | 'defeat' | 'stalled';
  wavesCleared: number;
  totalWaves: number;
  stars: number;
  gateHp: number;
  maxGateHp: number;
  damageTaken: number;
  kills: number;
  leaks: number;
  goldLeft: number;
  bowLevel: number;
  /** hero level reached — the draft cadence, and the ~25-35 target of TRIANGLE §B.4 */
  heroLevel: number;
  /** tower ids standing at the end — reported as data, to spot dead weight */
  towers: string[];
  /** perks drafted this run as "id xN" — the measurement the draft exists for */
  perks: string[];
}

/** The LCG the balance harness uses — same seed, same run, forever. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** Everything a bot run needs — the validated-data subset, no loader dependency. */
export interface BotGameData {
  towers: TowersFile;
  /** in-run draft pool; omit to run with drafting off (the pre-perk baseline) */
  perks?: PerksFile;
  enemies: EnemiesFile;
  abilities: readonly Ability[];
  /** how many abilities may be carried at once; defaults to the schema's 3 */
  equipSlots?: number;
  hero: Hero;
  economy: Economy;
  maps: Record<string, MapDef>;
  waveSets: Record<string, WaveSet>;
}

/**
 * Play one map start to finish with one bot and one seed. Pure: no wall
 * clock, no Math.random, no rendering.
 */
export function runBot(
  data: BotGameData,
  mapId: string,
  factory: BotFactory,
  seed: number,
): BotRunResult {
  const map = data.maps[mapId]!;
  const waveSet = data.waveSets[mapId]!;
  const abilities = data.abilities;

  const sim = new Simulation(
    {
      enemies: data.enemies,
      map,
      waveSet,
      hero: data.hero,
      economy: data.economy,
      towers: data.towers,
      abilities,
      equipSlots: data.equipSlots,
      // Bots start with the default loadout and fill the rest from the draft,
      // which is how a run actually plays now (TRIANGLE.md §B.6).
      //
      // They used to force-unlock the whole roster on the grounds that we were
      // measuring the skill ceiling rather than the meta-tree ramp. That stopped
      // being true the day abilities became draftable and the bar gained an
      // equip cap: force-unlocking filled every slot on wave 1, which made every
      // ability-unlock card a dead draw and quietly measured a loadout no player
      // can assemble.
      perks: data.perks,
    },
    makeRng(seed),
  );

  let leaks = 0;
  sim.enemySystem.onReachEnd.push(() => leaks++);

  const bot = factory(data.towers, map);
  const guardTicks = Math.round(MAX_WAVE_SECONDS / SIM_DT);
  let outcome: BotRunResult['outcome'] = 'stalled';

  for (let wave = 1; wave <= sim.waveRunner.totalWaves; wave++) {
    bot.spend(sim);
    if (!sim.startNextWave()) break;

    let guard = guardTicks;
    while (sim.phase === 'wave' && guard-- > 0) {
      bot.steer(sim);
      sim.tick();
    }

    if (sim.phase === 'defeat') {
      outcome = 'defeat';
      break;
    }
    if (sim.phase === 'wave') {
      outcome = 'stalled'; // ran out of clock with the field still live
      break;
    }
    if (sim.phase === 'done') {
      outcome = 'win';
      break;
    }

    // Draft, if the wave clear dealt one. Taking the first card is already a
    // weighted random pick — the offer was dealt by weighted sampling from the
    // sim's own seeded rng, so this stays reproducible without a second stream.
    const offer = sim.perks?.offer;
    if (offer && offer.length > 0) {
      const choice = bot.pickPerk ? bot.pickPerk(offer, sim) : offer[0]!.id;
      if (choice) sim.perks!.take(choice);
      else sim.perks!.skip();
    }
  }

  const cleared =
    outcome === 'win'
      ? sim.waveRunner.totalWaves
      : Math.max(0, sim.waveRunner.waveNumber - 1);

  return {
    mapId,
    bot: bot.name,
    seed,
    outcome,
    wavesCleared: cleared,
    totalWaves: sim.waveRunner.totalWaves,
    stars: outcome === 'win' ? sim.stars() : 0,
    gateHp: Math.max(0, Math.ceil(sim.gate.hp)),
    maxGateHp: sim.gate.maxHp,
    damageTaken: Math.round(sim.gate.totalDamageTaken),
    kills: sim.kills,
    leaks,
    goldLeft: sim.gold,
    bowLevel: sim.hero.bowLevel,
    heroLevel: sim.xp.level,
    towers: sim.towerSystem.plots
      .filter((p) => p.towerId !== null)
      .map((p) => `${p.towerId}${p.branchId ? ':' + p.branchId : '@L' + p.level}`),
    perks: (sim.perks?.takenPerks ?? []).map(
      ({ perk, stacks }) => `${perk.id}${stacks > 1 ? ' x' + stacks : ''}`,
    ),
  };
}
