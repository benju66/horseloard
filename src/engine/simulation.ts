import type { Ability, Economy, EnemiesFile, Hero, MapDef, PerksFile, TowersFile, WaveSet } from '../data/schemas';
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
import { PerkSystem } from './perkSystem';
import { ZoneSystem } from './zoneSystem';
import { ArmySystem } from './armySystem';
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
  /** endless mode: waves generate forever, victory never comes */
  endless?: boolean;
  /** in-run draft pool; omitted = no drafting (engine tests, legacy callers) */
  perks?: PerksFile;
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
  /** The in-run draft, or null when this run has no perk pool. */
  readonly perks: PerkSystem | null;
  /** Wave clears between drafts — the feature's difficulty dial, from perks.json. */
  private readonly perkCadence: number;
  readonly endless: boolean;
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
      map: structuredClone(input.map),
      abilities: structuredClone(input.abilities ?? []),
    };

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
    this.waveRunner = new WaveRunner(data.waveSet, (enemyId, laneId, hpMultiplier) => {
      this.enemySystem.spawn(enemyId, laneId, hpMultiplier);
    });
    this.projectileSystem = new ProjectileSystem(this.enemySystem, rng);
    this.hero = new HeroSystem(data.hero, data.map, this.enemySystem, this.projectileSystem);
    this.economy = new EconomySystem(data.economy, rng);
    this.towerSystem = new TowerSystem(
      data.towers,
      data.map.plots,
      this.enemySystem,
      this.projectileSystem,
      rng,
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
    );

    this.looters = new LooterSystem(this.enemySystem, this.economy, this.lanes);

    // The draft mutates the very config objects the systems above hold by
    // reference, so it is built from the same `data` and needs no plumbing to
    // reach them. Off entirely when no pool is supplied, which keeps every
    // existing engine test and the legacy call sites untouched.
    this.perkCadence = data.perks?.everyNWaves ?? 1;
    this.perks = data.perks
      ? new PerkSystem(
          data.perks,
          {
            hero: data.hero,
            economy: data.economy,
            towers: data.towers,
            map: data.map,
            abilities: data.abilities as Ability[],
          },
          rng,
        )
      : null;

    // Mills drop coins beside themselves — map safety converted into economy.
    this.towerSystem.onIncome.push((x, y, value) => {
      this.economy.spawnCoins(x, y, value);
    });

    this.gate = new GateSystem(data.map.gate, this.enemySystem);
    this.gate.onDestroyed.push(() => {
      this.phase = 'defeat';
    });
    // GateSystem copies hp into maxHp at construction rather than reading its
    // config live, so a reinforcement perk has to be routed here.
    this.perks?.onGateMaxHpChanged.push((delta) => this.gate.adjustCapacity(delta));
    // Drafted abilities. TRIANGLE.md §B.6: the draft *is* the ability tree, so
    // `unlock-ability` has to actually reach the AbilitySystem.
    this.perks?.onUnlockAbility.push((id) => this.abilities.unlock(id));
    // ...and must stop being offered once it could not land. AbilitySystem owns
    // the equip cap; PerkSystem owns the offer; this is the only place that
    // knows both, which is why the veto is wired here rather than living in
    // either of them.
    if (this.perks) {
      this.perks.isOfferable = (perk) => {
        for (const fx of perk.effects) {
          if (fx.type !== 'unlock-ability') continue;
          const slot = this.abilities.getSlot(fx.abilityId);
          if (!slot || slot.unlocked || !this.abilities.hasFreeSlot) return false;
        }
        return true;
      };
    }

    // Kills drop coins where the enemy died — the loot line is the gameplay.
    // Elites pay double (enemies.json elite.coinMultiplier).
    this.enemySystem.onDeath.push((e) => {
      this.kills++;
      const mult = e.isElite ? data.enemies.elite.coinMultiplier : 1;
      this.economy.spawnCoins(e.x, e.y, Math.round(e.config.coinValue * mult));
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
    this.zones.tick(SIM_DT); // hazards persist across phases, like besiegers
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
    this.phase = nextPhase;
    this.buildElapsed = 0;

    // Deal the draft rather than introducing a 'draft' phase. Two reasons: the
    // phase enum is consumed well beyond the engine — the renderer's day/night
    // cycle keys off `phase === 'wave'` and the score keys off the same line —
    // so a fifth value would silently change how the game *looks*; and the sim
    // must never block on a UI decision. The offer simply sits in hand through
    // the build phase, and a player who ignores it loses nothing.
    //
    // Not on victory: a draft handed out after the last wave buys nothing.
    if (nextPhase === 'build' && this.waveRunner.waveNumber % this.perkCadence === 0) {
      this.perks?.deal();
    }
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

  buildTower(plotId: string, towerId: string): boolean {
    const cost = this.towerSystem.buildCost(towerId);
    const plot = this.towerSystem.getPlot(plotId);
    if (cost === null || !plot || plot.towerId !== null) return false;
    if (!this.economy.spend(cost)) return false;
    return this.towerSystem.build(plotId, towerId);
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
