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
import { plotCoverage, sampleLanes, type LaneSample } from './coverage';
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
    supportValue(stats, stats.towerAura ? v.neighbourCombat(plot.x, plot.y, stats.towerAura.radius) : 0)
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
function affordablePurchases(
  sim: Simulation,
  file: TowersFile,
  plots: readonly PlotState[],
  maxTowers: number,
  /** when set, the bot may only ever build this tower — the forced-composition probe */
  onlyTowerId: string | null,
): Purchase[] {
  const out: Purchase[] = [];
  const built = sim.towerSystem.plots.filter((p) => p.towerId !== null).length;
  const v = valuation(sim, file);

  for (const plot of plots) {
    if (plot.towerId === null) {
      if (built >= maxTowers) continue;
      for (const tower of sim.towerSystem.roster) {
        if (onlyTowerId !== null && tower.id !== onlyTowerId) continue;
        const cost = sim.towerSystem.buildCost(tower.id);
        const level1 = tower.levels[0];
        if (cost === null || !level1 || cost > sim.gold) continue;
        const gain = totalValue(level1, projectileById(file, tower.projectileId), plot, v);
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
 * Cast whatever is ready, judged by effect type — the engine's vocabulary,
 * not the ability roster's. A new ability with a known effect type is used
 * automatically; one with a new effect type is ignored until taught here.
 */
function castReady(sim: Simulation, opts: { chargeWhenMoving: boolean }): void {
  for (const slot of sim.abilities.slots) {
    if (!slot.unlocked || slot.cooldownRemaining > 0) continue;
    const effect = slot.ability.effect;
    switch (effect.type) {
      case 'aoe-damage':
        if (countWithin(sim, sim.hero.x, sim.hero.y, effect.radius) >= CLUSTER_MIN_TARGETS) {
          sim.castAbility(slot.ability.id);
        }
        break;
      case 'tower-rate-buff':
        if (sim.enemySystem.aliveCount >= BUFF_MIN_ENEMIES) sim.castAbility(slot.ability.id);
        break;
      case 'charge':
        // The identity verb: ride through bodies, and the escape from a shove.
        if (sim.hero.staggered || (opts.chargeWhenMoving && sim.hero.moving)) {
          sim.castAbility(slot.ability.id);
        }
        break;
    }
  }
}

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
  chargeWhenMoving: boolean;
  /** restrict every build to this tower id — null = free choice */
  onlyTowerId?: string | null;
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
          castReady(sim, { chargeWhenMoving: plan.chargeWhenMoving });
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
        castReady(sim, { chargeWhenMoving: plan.chargeWhenMoving });
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
  chargeWhenMoving: false,
});

/** Cavalry: minimal field, maximal bow, intercept up the road. */
export const rider: BotFactory = makePolicy({
  name: 'rider',
  maxTowers: 2,
  bowShare: 0.6,
  repairFloor: 0.5,
  leash: Infinity,
  chargeWhenMoving: true,
});

/** Balanced: towers where they pay, hero where the pressure is. */
export const mixed: BotFactory = makePolicy({
  name: 'mixed',
  maxTowers: 4,
  bowShare: 0.35,
  repairFloor: 0.7,
  leash: Infinity,
  chargeWhenMoving: true,
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
    chargeWhenMoving: true,
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
      // Bots play the late-game loadout: everything unlocked. We're measuring
      // the skill ceiling, not the meta-tree ramp.
      unlockedAbilityIds: abilities.map((a) => a.id),
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
    towers: sim.towerSystem.plots
      .filter((p) => p.towerId !== null)
      .map((p) => `${p.towerId}${p.branchId ? ':' + p.branchId : '@L' + p.level}`),
    perks: (sim.perks?.takenPerks ?? []).map(
      ({ perk, stacks }) => `${perk.id}${stacks > 1 ? ' x' + stacks : ''}`,
    ),
  };
}
