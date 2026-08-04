import type { Ability, Economy, EnemiesFile, Hero, MapDef, TowersFile, WaveSet } from '../data/schemas';
import { TERRAIN_RULES } from '../data/schemas';
import { IdGenerator } from './ids';
import { buildLanePaths, type LanePath } from './path';
import { EnemySystem } from './enemySystem';
import { WaveRunner } from './waveRunner';
import { ProjectileSystem } from './projectileSystem';
import { HeroSystem } from './heroSystem';
import { EconomySystem } from './economySystem';
import { TowerSystem } from './towerSystem';
import { GateSystem } from './gateSystem';
import { AbilitySystem } from './abilitySystem';
import { LooterSystem } from './looterSystem';
import { ZoneSystem } from './zoneSystem';
import { Scaling, type ScaleSpec } from './scaling';
import { ArmySystem } from './armySystem';
import { XpSystem } from './xpSystem';
import { generateEndlessWave } from './endless';

/** Fixed simulation timestep. Rendering framerate is unrelated (CLAUDE.md #2). */
export const SIM_DT = 1 / 60;

/** Longest real-time delta we'll simulate per advance() — guards the spiral of death after tab-switches. */
const MAX_FRAME = 0.25;

export interface SimData {
  enemies: EnemiesFile;
  map: MapDef;
  waveSet: WaveSet;
  hero: Hero;
  economy: Economy;
  towers: TowersFile;
  /** empty array = no abilities (engine tests); the game passes the real roster */
  abilities?: readonly Ability[];
  /** ability ids force-unlocked beyond unlockedByDefault (meta-tree flags, M3) */
  unlockedAbilityIds?: readonly string[];
  /** how many abilities may be carried at once; defaults to the schema's 3 */
  equipSlots?: number;
  /**
   * The chosen ability bar, in order. Empty = fill from what is unlocked, in
   * roster order — see `AbilitySystem` for why the fallback is not a lesser path.
   */
  loadout?: readonly string[];
  /**
   * Towers the career tree has not unlocked yet. Empty = the whole roster is
   * buildable, which is what engine tests and the bot harness want.
   */
  lockedTowerIds?: readonly string[];
  /**
   * Rules the career build has switched on (`RuleKeySchema`).
   *
   * Engine vocabulary, not content — `pierce-on-kill` names a mechanic the same
   * way `aoe-damage` does, so the substrate rule is untouched and a system may
   * read this set directly.
   */
  rules?: readonly string[];
  /**
   * Live scaling the build granted (`ScaleKeySchema` → spec). Unlike stats,
   * these cannot be folded into the balance data — what they count changes
   * every tick.
   */
  scaling?: Record<string, ScaleSpec>;
  /** endless mode: waves generate forever, victory never comes */
  endless?: boolean;
}

/**
 * 'build'  — between waves, player spends and positions (besiegers may still
 *            be battering the gate — a leak is a fixable problem, not a score)
 * 'wave'   — spawning/fighting; ends when spawning is done and nothing walks.
 *            The FINAL wave also demands a clean field: ride back and break
 *            the siege before it counts as done.
 * 'done'   — victory
 * 'defeat' — the gate fell; the sim freezes
 */
export type SimPhase = 'build' | 'wave' | 'done' | 'defeat';

/**
 * The whole game state advances here, in fixed ticks, with no reference to
 * Phaser or wall-clock time. Scenes call advance(elapsed) and read state.
 */
export class Simulation {
  readonly ids = new IdGenerator();
  readonly lanes: Map<string, LanePath>;
  readonly enemySystem: EnemySystem;
  readonly waveRunner: WaveRunner;
  readonly projectileSystem: ProjectileSystem;
  readonly hero: HeroSystem;
  readonly economy: EconomySystem;
  readonly towerSystem: TowerSystem;
  readonly gate: GateSystem;
  readonly abilities: AbilitySystem;
  /** Ground hazards the hero leaves behind — the only friendly thing that is not a unit or a tower. */
  readonly zones: ZoneSystem;
  /** The army pillar: soldiers posted by garrison towers (TRIANGLE.md §B.2). */
  readonly army: ArmySystem;
  readonly looters: LooterSystem;
  /**
   * Kills → XP. The run does not spend it — XP is **career** currency now
   * (SKILLTREE.md), banked at run end and spent in the tree between runs.
   * Nothing about a run's power changes while it is being played.
   */
  readonly xp: XpSystem;
  readonly endless: boolean;
  /** The rules this run is playing under. Fixed before wave 1, never changes. */
  readonly rules: ReadonlySet<string>;
  /** Power that grows with the board. Read live; see `scaling.ts`. */
  readonly scaling: Scaling;
  /**
   * The raw specs behind `scaling`, for anything that has to *reason* about the
   * build rather than apply it — the bot's tower valuation, which otherwise
   * prices a barracks as if the synergy the player bought did not exist.
   */
  readonly scalingSpecs: Readonly<Record<string, ScaleSpec>>;
  /**
   * Fired when a wave is cleared, with the wave number and the XP it paid.
   *
   * Reporting, never asking. The run's XP is the only thing a player earns
   * while playing, and before this it arrived silently — the bar moved and
   * nothing said so. A wave is the natural beat to say it on: frequent enough
   * to be a rhythm, rare enough not to be noise.
   */
  readonly onWaveClear: Array<(wave: number, xpEarned: number) => void> = [];
  private xpAtWaveStart = 0;
  private readonly enemiesFile: EnemiesFile;
  private readonly mapDef: MapDef;
  private readonly rng: () => number;

  phase: SimPhase = 'build';
  kills = 0;
  private waveElapsed = 0;
  private pendingDrop: { delay: number; x: number; y: number; value: number; lifetime: number } | null = null;
  tickCount = 0;
  /** seconds spent in the current build phase — the early-start bonus decays over it */
  buildElapsed = 0;
  private accumulator = 0;

  constructor(input: SimData, rng: () => number = Math.random) {
    // The sim owns its balance data outright.
    //
    // Every system holds its config by reference and reads it live, which is
    // what lets the in-run draft change the game mid-run by writing to these
    // objects. That same property makes sharing them across runs a data leak:
    // the bot harness passes one `loadGameData()` result into hundreds of runs,
    // and without this clone a perk taken in run 1 was still in force in run
    // 300 — measured as the harness reporting 100% win rates on maps tuned to
    // 60% and 40%.
    //
    // The game never hit it because `applyMetaModifiers` already clones before
    // building a Simulation, but that was incidental protection, not a
    // guarantee. Owning the data here makes it one.
    const data: SimData = {
      ...input,
      hero: structuredClone(input.hero),
      economy: structuredClone(input.economy),
      towers: structuredClone(input.towers),
      // Cloned for the same reason as the rest — and because the terrain rule
      // below multiplies enemy speed, which without the clone would compound
      // across every run the harness feeds from one loadGameData() result.
      enemies: structuredClone(input.enemies),
      map: structuredClone(input.map),
      abilities: structuredClone(input.abilities ?? []),
    };

    // The biome's terrain rule (BIOMES.md C.4), applied once to this run's own
    // data. Iterated generically off the schema table: no rule name appears
    // here, so a third rule is a schema row and zero engine changes.
    if (data.map.terrainRule !== undefined) {
      const mods = TERRAIN_RULES[data.map.terrainRule];
      if (mods.towerRange !== undefined) {
        for (const tower of data.towers.towers) {
          for (const level of tower.levels) level.range *= mods.towerRange;
          for (const branch of tower.branches) branch.stats.range *= mods.towerRange;
        }
        // An aura's radius IS its reach — leaving it out would exempt Frost
        // from a rule about sightlines.
        for (const p of data.towers.projectiles) {
          if (p.behavior === 'aura') p.radius *= mods.towerRange;
        }
      }
      if (mods.towerDamage !== undefined) {
        for (const tower of data.towers.towers) {
          for (const level of tower.levels) level.damage *= mods.towerDamage;
          for (const branch of tower.branches) branch.stats.damage *= mods.towerDamage;
        }
      }
      if (mods.enemySpeed !== undefined) {
        for (const e of data.enemies.enemies) e.speed *= mods.enemySpeed;
      }
    }

    this.endless = data.endless ?? false;
    this.enemiesFile = data.enemies;
    this.mapDef = data.map;
    this.rng = rng;
    this.lanes = buildLanePaths(data.map);
    this.enemySystem = new EnemySystem(
      data.enemies.enemies,
      this.lanes,
      this.ids,
      data.enemies.elite,
      rng,
    );
    this.enemySystem.setWorldBounds(data.map.world.width, data.map.world.height);
    this.waveRunner = new WaveRunner(data.waveSet, (enemyId, laneId, hpMultiplier) => {
      this.enemySystem.spawn(enemyId, laneId, hpMultiplier);
    });
    this.projectileSystem = new ProjectileSystem(this.enemySystem, rng);
    this.hero = new HeroSystem(data.hero, data.map, this.enemySystem, this.projectileSystem, rng);
    this.economy = new EconomySystem(data.economy, rng);
    this.xp = new XpSystem(data.economy.xp);
    this.towerSystem = new TowerSystem(
      data.towers,
      data.map.plots,
      this.enemySystem,
      this.projectileSystem,
      rng,
      data.lockedTowerIds ?? [],
    );
    this.zones = new ZoneSystem(this.enemySystem, this.ids);
    this.army = new ArmySystem(this.towerSystem, this.enemySystem, this.lanes, this.ids);
    this.abilities = new AbilitySystem(
      data.abilities ?? [],
      data.unlockedAbilityIds ?? [],
      this.enemySystem,
      this.hero,
      this.towerSystem,
      this.zones,
      this.army,
      data.equipSlots,
      data.loadout ?? [],
    );

    this.looters = new LooterSystem(this.enemySystem, this.economy, this.lanes);

    // ─── Rules and scaling (SKILLTREE.md) ───
    this.rules = new Set(data.rules ?? []);

    // Every source the sim can count, in one place. Arrow functions rather than
    // captured values: the whole point is that these are read at the moment the
    // number is used, not at construction.
    this.scalingSpecs = data.scaling ?? {};
    this.scaling = new Scaling(this.scalingSpecs, {
      soldiersStanding: () => this.army.standingCount,
      gold: () => this.economy.gold,
      towersCovering: (x, y) => this.towerSystem.countCovering(x, y),
      looseCoins: () => this.economy.coins.length,
    });
    this.towerSystem.scaling = this.scaling;
    this.hero.scaling = this.scaling;
    this.zones.scaling = this.scaling;
    this.army.scaling = this.scaling;

    if (this.rules.has('crit-vs-hindered')) this.hero.critVsHindered = true;
    if (this.rules.has('pierce-on-kill')) this.projectileSystem.pierceOnKill = true;
    if (this.rules.has('zones-strip-armor')) this.zones.stripsArmor = true;
    if (this.rules.has('coins-never-expire')) this.economy.coinsNeverExpire = true;
    if (this.rules.has('full-salvage')) this.towerSystem.fullSalvage = true;
    if (this.rules.has('first-tower-free')) this.towerSystem.freeBuildsPerPhase = 1;

    // A held enemy that dies pays a bounty. The one rule that makes the army
    // pillar fund itself: soldiers barely damage by design, so before this a
    // garrison could only ever be a cost you hoped the towers repaid.
    if (this.rules.has('bounty-on-blocked')) {
      this.enemySystem.onDeath.push((e) => {
        if (e.state !== 'blocked') return;
        this.economy.spawnCoins(e.x, e.y, Math.max(1, Math.round(e.config.coinValue * 0.6)));
      });
    }

    // Mills drop coins beside themselves — map safety converted into economy.
    this.towerSystem.onIncome.push((x, y, value) => {
      this.economy.spawnCoins(x, y, value);
    });

    this.gate = new GateSystem(data.map.gate, this.enemySystem);
    this.gate.onDestroyed.push(() => {
      this.phase = 'defeat';
    });
    // The gate's capacity is set from `map.gate.hp` at construction, which the
    // career tree has already rewritten before the Simulation exists — so
    // nothing needs routing here any more. The draft used to change it mid-run;
    // nothing changes mid-run now.

    // Hero damage feeds `damage-dealt` triggers. Hero-sourced only: an ability
    // that fires "after a hard-fought stretch" has to mean the player's fight,
    // not the towers ticking over while they ride somewhere else.
    this.projectileSystem.onHeroDamage.push((amount) => this.abilities.noteHeroDamage(amount));
    this.hero.onTrample.push(() => this.abilities.noteHeroDamage(data.hero.trample.damage));

    // Kills drop coins where the enemy died — the loot line is the gameplay.
    // Elites pay double (enemies.json elite.coinMultiplier).
    this.enemySystem.onDeath.push((e) => {
      this.kills++;
      const mult = e.isElite ? data.enemies.elite.coinMultiplier : 1;
      this.economy.spawnCoins(e.x, e.y, Math.round(e.config.coinValue * mult));
      // ...and XP, which buys identity rather than commitment (TRIANGLE §B.4).
      this.xp.award(e.config.xpValue, e.isElite);
    });

  }

  get gold(): number {
    return this.economy.gold;
  }

  /** Elapsed real seconds in, fixed ticks out. Returns the number of ticks executed. */
  advance(deltaSeconds: number): number {
    this.accumulator += Math.min(deltaSeconds, MAX_FRAME);
    let ticks = 0;
    while (this.accumulator >= SIM_DT) {
      this.accumulator -= SIM_DT;
      this.tick();
      ticks++;
    }
    return ticks;
  }

  tick(): void {
    if (this.phase === 'defeat') return; // the keep has fallen; the field freezes
    this.tickCount++;
    if (this.phase === 'build') this.buildElapsed += SIM_DT;
    if (this.phase === 'wave') {
      this.waveRunner.tick(SIM_DT);
      this.waveElapsed += SIM_DT;
      if (this.pendingDrop && this.waveElapsed >= this.pendingDrop.delay) {
        this.economy.spawnChest(
          this.pendingDrop.x,
          this.pendingDrop.y,
          this.pendingDrop.value,
          this.pendingDrop.lifetime,
        );
        this.pendingDrop = null;
      }
    }
    this.enemySystem.tick(SIM_DT); // besiegers persist and act across phases
    this.looters.tick(SIM_DT);
    this.gate.tick(SIM_DT);
    this.towerSystem.tick(SIM_DT);
    // After the towers, before the hero: a soldier that grabs an enemy this
    // tick should already be holding it when the hero decides where to ride.
    this.army.tick(SIM_DT);
    this.hero.tick(SIM_DT);
    this.abilities.tick(SIM_DT);
    // Hazards persist across phases, like besiegers. The hero position is the
    // anchor orbiting zones circle; static ones ignore it.
    this.zones.tick(SIM_DT, this.hero.x, this.hero.y);
    this.projectileSystem.tick(SIM_DT);
    this.economy.tick(SIM_DT, this.hero.x, this.hero.y, this.phase === 'wave');

    if (
      this.phase === 'wave' &&
      !this.waveRunner.spawning &&
      this.enemySystem.walkingCount === 0
    ) {
      if (this.endless || this.waveRunner.hasMoreWaves) {
        this.onWaveCleared('build'); // endless: there is always another wave
      } else if (this.enemySystem.aliveCount === 0) {
        // Final wave only counts once the siege is broken too.
        this.onWaveCleared('done');
      }
    }
  }

  private onWaveCleared(nextPhase: SimPhase): void {
    const { base, perWave } = this.economy.config.waveClearBonus;
    this.economy.gold += base + perWave * this.waveRunner.waveNumber;
    this.economy.sweep();
    // The host re-forms with the dawn rather than on a timer, so a wave that
    // cost you the whole garrison is not also a wave that starts the next one
    // undefended.
    if (this.rules.has('soldiers-reform')) this.army.reformAll();
    this.towerSystem.resetFreeBuilds();
    const wave = this.waveRunner.waveNumber;
    const earned = this.xp.totalXp - this.xpAtWaveStart;
    this.xpAtWaveStart = this.xp.totalXp;
    this.phase = nextPhase;
    this.buildElapsed = 0;

    // Nothing is offered here. A wave clear *reports* — how much the fighting
    // was worth — and the renderer decides how to show it. That distinction is
    // the whole redesign: the run may tell you anything and ask you nothing.
    //
    // There is deliberately still no 'draft' phase. The phase enum is consumed
    // well beyond the engine — the renderer's day/night cycle keys off
    // `phase === 'wave'` — so a fifth value would silently change how the game
    // *looks*.
    for (const fn of this.onWaveClear) fn(wave, earned);
  }

  /**
   * Coins paid for starting the next wave now, decaying over the build
   * phase. Rewards confident players, never punishes deliberate ones
   * (DESIGN §8). Zero before the first wave — nothing was cleared yet.
   */
  earlyStartBonus(): number {
    if (this.phase !== 'build' || this.waveRunner.waveNumber === 0) return 0;
    const { windowSeconds, maxBonus } = this.economy.config.earlyStart;
    const remaining = Math.max(0, windowSeconds - this.buildElapsed);
    return Math.ceil((maxBonus * remaining) / windowSeconds);
  }

  startNextWave(): boolean {
    if (this.phase !== 'build') return false;
    if (this.endless && !this.waveRunner.hasMoreWaves) {
      this.waveRunner.appendWave(
        generateEndlessWave(this.waveRunner.waveNumber + 1, this.enemiesFile, this.mapDef, this.rng),
      );
    }
    const bonus = this.earlyStartBonus();
    if (!this.waveRunner.startNextWave()) return false;
    this.economy.gold += bonus;
    this.phase = 'wave';
    this.waveElapsed = 0;
    this.pendingDrop = this.waveRunner.currentWaveData?.supplyDrop ?? null;
    return true;
  }

  /** Forge purchase: spend gold for the next bow level. Returns false if unaffordable or maxed. */
  buyBowUpgrade(): boolean {
    const cost = this.hero.nextBowCost();
    if (cost === null || !this.economy.spend(cost)) return false;
    this.hero.upgradeBow();
    return true;
  }

  /** What raising this tower costs right now — 0 while a free build is owed. */
  buildPrice(towerId: string): number | null {
    const cost = this.towerSystem.buildCost(towerId);
    if (cost === null) return null;
    return this.towerSystem.nextBuildIsFree ? 0 : cost;
  }

  buildTower(plotId: string, towerId: string): boolean {
    const price = this.buildPrice(towerId);
    const plot = this.towerSystem.getPlot(plotId);
    if (price === null || !plot || plot.towerId !== null) return false;
    const free = price === 0 && this.towerSystem.nextBuildIsFree;
    if (!this.economy.spend(price)) return false;
    const built = this.towerSystem.build(plotId, towerId);
    // Consumed only on a build that actually happened, so a refused placement
    // never burns the allowance.
    if (built && free) this.towerSystem.noteFreeBuild();
    return built;
  }

  upgradeTower(plotId: string): boolean {
    const plot = this.towerSystem.getPlot(plotId);
    if (!plot) return false;
    const cost = this.towerSystem.upgradeCost(plot);
    if (cost === null || !this.economy.spend(cost)) return false;
    return this.towerSystem.upgrade(plotId);
  }

  branchTower(plotId: string, branchId: string): boolean {
    const plot = this.towerSystem.getPlot(plotId);
    if (!plot) return false;
    const option = this.towerSystem.branchOptions(plot).find((b) => b.id === branchId);
    if (!option || !this.economy.spend(option.cost)) return false;
    return this.towerSystem.branch(plotId, branchId);
  }

  sellTower(plotId: string): boolean {
    const plot = this.towerSystem.getPlot(plotId);
    if (!plot || plot.towerId === null) return false;
    const refund = this.towerSystem.sell(plotId, this.economy.config.sellRefund);
    this.economy.gold += refund;
    return true;
  }

  /** Next repair purchase: {amount, cost}, or null when the gate is whole. */
  repairQuote(): { amount: number; cost: number } | null {
    const { hpPerPurchase, costPerHp } = this.economy.config.repair;
    const amount = Math.min(hpPerPurchase, Math.ceil(this.maxGateDeficit()));
    if (amount <= 0) return null;
    return { amount, cost: Math.ceil(amount * costPerHp) };
  }

  private maxGateDeficit(): number {
    return this.gate.maxHp - this.gate.hp;
  }

  /** Gate repair: a coin sink, between waves only (DESIGN §6). */
  repairGate(): boolean {
    if (this.phase !== 'build') return false;
    const quote = this.repairQuote();
    if (!quote || !this.economy.spend(quote.cost)) return false;
    this.gate.repair(quote.amount);
    return true;
  }

  castAbility(abilityId: string): boolean {
    if (this.phase === 'defeat' || this.phase === 'done') return false;
    return this.abilities.cast(abilityId);
  }

  /**
   * Stars score on damage TAKEN, never HP remaining — repair aids survival,
   * never the score chase (DESIGN §3).
   */
  stars(): 1 | 2 | 3 {
    const taken = this.gate.totalDamageTaken;
    if (taken <= 0) return 3;
    const threshold = this.gate.maxHp * this.economy.config.stars.twoStarMaxDamageFraction;
    return taken <= threshold ? 2 : 1;
  }
}
