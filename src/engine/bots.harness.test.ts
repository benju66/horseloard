import { describe, it } from 'vitest';
import { loadGameData } from '../data/loader';
import { SkillTree } from './skillTree';
import {
  BOTS,
  armyOnly,
  forcedComposition,
  heroOnly,
  makeRng,
  pathBuild,
  pathShare,
  randomBuild,
  spreadBuild,
  runBot,
  combatTowersOnly,
  towersAndArmy,
  towersOnly,
  withoutAbilities,
  withoutHeroDamage,
  type BotFactory,
  type BotRunResult,
} from './bots';

/**
 * The active-play matrix: every bot × every map × N seeds.
 *
 * What to read in the output:
 *  - a bot that wins everything → one strategy dominates; the others are decoration
 *  - a bot that loses everything → that playstyle isn't viable, or its plan needs tuning
 *  - a map every bot 3-stars → too easy; a map nobody clears → too hard
 *  - a tower absent from every winning run → dead weight, or mispriced
 *
 * Bots measure solvability, not fun. They cannot tell you whether Charge
 * feels good — that is a phone-and-thumbs question, forever.
 *
 * On-demand (headless playtest, not a test): `npm run bots`
 */
/**
 * Twelve, not five. A five-seed sweep of enemy scaling on warlords-march
 * returned 47% → 33% → 47% → 53% across monotonically rising difficulty — the
 * ordering was noise, and ±13pp of it. Every tuning decision made against five
 * seeds was being made against sampling error, including the "knife edge"
 * recorded in the 2026-07-31 difficulty pass. Runs are cheap and headless; the
 * confidence is worth far more than the seconds.
 */
const SEEDS = [11, 23, 42, 57, 88, 101, 137, 199, 233, 271, 313, 359];

/**
 * The difficulty curve DESIGN §13 promises — "gentle map 1, honest challenge by
 * map 4" — expressed as something measurable instead of a feeling.
 *
 * `winRate` is the band a competent bot should land in. 100% everywhere means
 * the campaign has no curve; 0% means it is not a curve either, just a wall.
 *
 * `maxSinglePillarWinRate` is the one that matters (TRIANGLE.md, MG5.1). May a
 * SINGLE pillar — towers alone, or the hero alone — clear this map? Map 1 yes:
 * a new player leaning entirely on one thing and doing fine is the point. By
 * map 3 no, because that is what makes the three systems depend on each other
 * instead of substituting for each other.
 *
 * This replaces the retired `soloCarry`, which asked whether a single *tower*
 * could carry. That question could never stay answered: towers and the hero
 * both produce damage, so a progression system that scales both will always
 * eventually make one sufficient. Sufficiency is what we ban here, not
 * imbalance — leaning 70/30 in any direction must stay viable.
 */
export const DIFFICULTY_TARGETS: Record<
  string,
  { winRate: [number, number]; maxSinglePillarWinRate: number; intent: string }
> = {
  'meadow-road': { winRate: [90, 100], maxSinglePillarWinRate: 100, intent: 'nearly unloseable — it teaches' },
  'the-ford': { winRate: [70, 95], maxSinglePillarWinRate: 100, intent: 'comfortable, but leaks punish' },
  // Green Road back half (BIOMES.md C.1: 90-100 → 70-90 across the biome).
  // Single-pillar stays uncapped through the teaching biome — the counters
  // that force the triangle deliberately live in Iron and Steppe.
  'market-road': { winRate: [65, 90], maxSinglePillarWinRate: 100, intent: 'greed under pressure — the thieves know' },
  'harvest-night': { winRate: [60, 85], maxSinglePillarWinRate: 100, intent: 'the tide — green road finale' },
  'crossroads': { winRate: [45, 75], maxSinglePillarWinRate: 40, intent: 'one pillar is not enough' },
  // Iron Deeps descent (BIOMES.md C.2, band 55-75 easing as the quarry deepens).
  'pit-heads': { winRate: [45, 70], maxSinglePillarWinRate: 40, intent: 'five plots — choose like it matters' },
  'undercut': { winRate: [40, 65], maxSinglePillarWinRate: 30, intent: 'every answer punished by the next wave' },
  'deep-gate': { winRate: [35, 60], maxSinglePillarWinRate: 25, intent: 'everything down here breaks gates' },
  // Long Steppe road to the finale (BIOMES.md C.3, band 30-55 rising to it).
  'open-road': { winRate: [45, 70], maxSinglePillarWinRate: 40, intent: 'the steppe introduces itself' },
  'flank-road': { winRate: [35, 60], maxSinglePillarWinRate: 30, intent: 'the flank owns the game' },
  'broken-line': { winRate: [30, 55], maxSinglePillarWinRate: 25, intent: 'lines fail here — riders do not' },
  'warlords-march': { winRate: [25, 55], maxSinglePillarWinRate: 25, intent: 'honest challenge' },
};

function pct(n: number, of: number): string {
  return of === 0 ? '  –' : `${Math.round((n / of) * 100)}%`.padStart(4);
}

function summarize(runs: readonly BotRunResult[]): string {
  const wins = runs.filter((r) => r.outcome === 'win');
  const waves = runs.reduce((s, r) => s + r.wavesCleared, 0) / runs.length;
  const stars = wins.length ? wins.reduce((s, r) => s + r.stars, 0) / wins.length : 0;
  const dmg = runs.reduce((s, r) => s + r.damageTaken, 0) / runs.length;
  const stalls = runs.filter((r) => r.outcome === 'stalled').length;
  return (
    `win ${pct(wins.length, runs.length)}  ` +
    `waves ${waves.toFixed(1)}/${runs[0]!.totalWaves}  ` +
    `stars ${stars ? stars.toFixed(1) : ' – '}  ` +
    `dmg ${Math.round(dmg).toString().padStart(4)}  ` +
    (stalls ? `stalls ${stalls}` : '')
  );
}

/**
 * The reference career: **12 points** — what a player holds having played the
 * campaign once.
 *
 * SKILLTREE.md Part F guessed 22 ("mid-tree"). Measured, that was wrong by
 * about a factor of two: a full campaign at 3 stars pays roughly 7,400 XP,
 * which the career curve turns into level 12, not 22. Tuning the maps against
 * 22 would have been tuning them against a player who has already replayed the
 * whole campaign several times — and duly reported three of four maps "off
 * target" when the real first-run curve was 100/97/72/28.
 *
 * The [RAMP] report is what settled it and is the thing to re-read before ever
 * moving this number. The bands describe the 12pt column; the 40pt column is a
 * returning player and is *supposed* to be high — that is what a career is for.
 *
 * `FULL_POINTS` is the career ceiling — maxLevel × pointsPerLevel plus one per
 * map three-starred — read off the data rather than written down here, so a
 * curve change cannot leave the probes measuring a budget the game stopped
 * granting.
 */
const REFERENCE_LEVEL = 8;
/**
 * Maps three-starred at that point. Two, not four: three-starring scores on
 * damage *taken*, so a player clearing the campaign for the first time does not
 * hold a perfect record on the way through.
 */
const REFERENCE_STARS = 2;

describe.runIf(import.meta.env.MODE === 'balance')('bot matrix', () => {
  const data = loadGameData();
  /**
   * The reference configuration is a **mid-tree career build** (SKILLTREE.md
   * Part F): not an empty tree and not a maxed one.
   *
   * Which one it is matters as much as how many points it holds. The draft it
   * replaced dealt cards from every pillar, so the old reference was a
   * generalist by construction; a reference that walked one path top-down would
   * silently retune the whole campaign around a specialist. `spreadBuild` keeps
   * the generalist, so the difficulty bands below still mean what they meant.
   */
  const tree = new SkillTree(data.skillTree);
  /**
   * Points at a career level with `stars` maps three-starred, per pool.
   *
   * Stars are passed rather than assumed maxed: three-starring every map is the
   * *ceiling*, and pinning it there at every level makes a fresh career look
   * like it holds eight points. The ramp below pairs each level with the star
   * count a player would plausibly have at it.
   */
  const at = (level: number, stars: number) => tree.pointsAt(level, stars);
  const referenceBuild = spreadBuild(tree, at(REFERENCE_LEVEL, REFERENCE_STARS));
  const FULL_POINTS = at(data.skillTree.maxLevel, Object.keys(data.maps).length);
  const total = (p: number) => p;

  const botData = {
    towers: data.towers,
    skillTree: data.skillTree,
    skillNodes: referenceBuild,
    enemies: data.enemies,
    abilities: data.abilities,
    equipSlots: data.equipSlots,
    equipSlotGrants: data.equipSlotGrants,
    hero: data.hero,
    economy: data.economy,
    maps: data.maps,
    waveSets: data.waveSets,
  };

  const all: BotRunResult[] = [];

  for (const mapId of Object.keys(data.maps)) {
    it(`plays ${mapId}`, { timeout: 60_000 }, () => {
      const lines: string[] = [];
      for (const factory of BOTS) {
        const runs = SEEDS.map((seed) => runBot(botData, mapId, factory, seed));
        all.push(...runs);
        lines.push(`  ${runs[0]!.bot.padEnd(9)} ${summarize(runs)}`);
        for (const r of runs) {
          lines.push(
            `      seed ${String(r.seed).padStart(3)}: ${r.outcome.padEnd(8)} ` +
              `w${r.wavesCleared}/${r.totalWaves} gate=${r.gateHp}/${r.maxGateHp} ` +
              `leaks=${r.leaks} kills=${r.kills} bow=L${r.bowLevel} gold=${r.goldLeft}\n` +
              `                 towers: ${r.towers.join(', ') || '(none)'}`,
          );
        }
      }
      console.log(`\n[${mapId}]\n` + lines.join('\n'));
    });
  }

  /**
   * Economy pressure is the lever DESIGN pillar 2 actually names — difficulty
   * should come from it, never from twitch aiming. So measure whether gold is
   * actually scarce: leftover gold at run's end, and how much of the map the
   * player could afford to fill. Fully-funded boards mean plot and tower choice
   * are not decisions, which is both an easiness problem AND the thing most
   * likely to flatten tower balance if difficulty is raised by HP alone.
   */
  it('reports whether gold is actually scarce', { timeout: 120_000 }, () => {
    const lines: string[] = [];
    for (const mapId of Object.keys(data.maps)) {
      const runs = BOTS.flatMap((f) => SEEDS.map((seed) => runBot(botData, mapId, f, seed)));
      const avgLeft = runs.reduce((s, r) => s + r.goldLeft, 0) / runs.length;
      const avgTowers = runs.reduce((s, r) => s + r.towers.length, 0) / runs.length;
      const plots = data.maps[mapId]!.plots.length;
      const maxed = runs.reduce(
        (s, r) => s + r.towers.filter((t) => t.includes(':')).length,
        0,
      ) / runs.length;
      lines.push(
        `  ${mapId.padEnd(16)} leftover ${Math.round(avgLeft).toString().padStart(4)}g   ` +
          `plots filled ${avgTowers.toFixed(1)}/${plots}   branched ${maxed.toFixed(1)}`,
      );
    }
    console.log(
      '\n[economy pressure]  leftover gold = slack; high leftover means build order is not a decision\n' +
        lines.join('\n'),
    );
  });

  /**
   * The draft's cadence (TRIANGLE.md §B.4). Target is **25–35 levels on a full
   * map** — Vampire Survivors fires this loop every 20–40 seconds, and that
   * cadence is the dopamine spine the old one-card-per-wave-clear never had.
   *
   * Read levels against *waves cleared*, not against the target alone: a run
   * that dies on wave 4 should of course be short of 25, and averaging it in
   * with full clears would make a healthy curve look starved.
   */
  it('reports how many levels a run actually produces', { timeout: 120_000 }, () => {
    const lines: string[] = [];
    for (const mapId of Object.keys(data.maps)) {
      const runs = BOTS.flatMap((f) => SEEDS.map((s) => runBot(botData, mapId, f, s)));
      const wins = runs.filter((r) => r.outcome === 'win');
      const avg = (rs: BotRunResult[]) =>
        rs.length ? rs.reduce((s, r) => s + r.heroLevel, 0) / rs.length : 0;
      const onFull = avg(wins);
      const off = wins.length === 0 ? '' : onFull < 25 ? '   ← under 25' : onFull > 35 ? '   ← over 35' : '';
      lines.push(
        `  ${mapId.padEnd(16)} full clears ${String(wins.length).padStart(2)}/${runs.length}  ` +
          `levels ${onFull ? onFull.toFixed(1) : ' – '} (all runs ${avg(runs).toFixed(1)})${off}`,
      );
    }
    console.log(
      '\n[draft cadence — TRIANGLE.md §B.4, want 25-35 levels on a full clear]\n' + lines.join('\n'),
    );
  });

  it('reports tower preference across every free-choice run', () => {
    const used = new Map<string, number>();
    for (const r of all) {
      for (const t of r.towers) {
        const id = t.split(/[:@]/)[0]!;
        used.set(id, (used.get(id) ?? 0) + 1);
      }
    }
    const lines = data.towers.towers.map((t) => {
      const n = used.get(t.id) ?? 0;
      return `  ${t.id.padEnd(14)} chosen in ${String(n).padStart(3)} runs`;
    });
    console.log(
      '\n[tower preference — what the valuation model LIKES, not what works]\n' +
        lines.join('\n'),
    );
  });

  /**
   * The scoreboard. Actual difficulty against the intended curve, per map, so
   * a tuning pass has a target instead of a vibe. Reports rather than asserts —
   * this is an instrument for `npm run bots`, not a gate on `npm test`.
   */
  it('reports the difficulty curve against its target', { timeout: 180_000 }, () => {
    const lines: string[] = [];
    let failures = 0;

    for (const mapId of Object.keys(data.maps)) {
      const target = DIFFICULTY_TARGETS[mapId];
      if (!target) {
        lines.push(`  ${mapId.padEnd(16)} (no target set)`);
        continue;
      }

      const runs = BOTS.flatMap((f) => SEEDS.map((seed) => runBot(botData, mapId, f, seed)));
      const winRate = Math.round((runs.filter((r) => r.outcome === 'win').length / runs.length) * 100);
      const [lo, hi] = target.winRate;
      const winOk = winRate >= lo && winRate <= hi;

      // Solo carry, retained as texture: does ANY single tower clear this map
      // by itself? No longer a gate — the pillar probe below is the gate.
      const carriers = data.towers.towers.filter((t) => {
        const solo = SEEDS.map((seed) => runBot(botData, mapId, forcedComposition(t.id), seed));
        return solo.every((r) => r.outcome === 'win');
      });
      if (!winOk) failures++;
      lines.push(
        `  ${mapId.padEnd(16)} win ${String(winRate).padStart(3)}% (want ${lo}-${hi}) ${winOk ? '✓' : '✗'}   ` +
          `solo-carriers ${carriers.length} (texture only — see the pillar probe)` +
          `\n${' '.repeat(20)}${target.intent}` +
          (carriers.length ? `\n${' '.repeat(20)}carried by: ${carriers.map((t) => t.id).join(', ')}` : ''),
      );
    }

    console.log(
      `\n[difficulty curve vs target]  ${failures === 0 ? 'ON TARGET' : `${failures} map(s) off target`}\n` +
        lines.join('\n'),
    );
  });

  /**
   * MG5.1 — the pillar probe. **The gate for M5.**
   *
   * TRIANGLE.md's invariant: no single pillar clears a map alone, and any two
   * together must. This is the instrument, and it reports two things that have
   * never been measured before — whether towers alone can hold a map, and
   * whether the hero alone can.
   *
   * Each arm removes one pillar's *contribution* while leaving the others'
   * *inputs* intact, so a loss means the pillar is insufficient rather than
   * that the bot was starved:
   *
   * - `towers only` — the hero still rides, sweeps coins and repairs, but its
   *   bow and trample deal zero and it casts nothing. Gold keeps flowing, so
   *   this measures damage, not funding.
   * - `hero only`   — builds nothing at all, buys every bow level, roams free.
   *
   * The army arm lands with MG5.2; until the barracks exists there is no third
   * pillar to isolate, which is precisely why the triangle does not close yet.
   */
  it('reports whether any single pillar can hold a map alone', { timeout: 300_000 }, () => {
    const lines: string[] = [];
    let failures = 0;

    const heroDisabled = withoutAbilities({ ...botData, hero: withoutHeroDamage(data.hero) });

    for (const mapId of Object.keys(data.maps)) {
      const target = DIFFICULTY_TARGETS[mapId];
      const arms: Array<[string, BotRunResult[]]> = [
        ['towers only', SEEDS.map((s) => runBot(heroDisabled, mapId, towersOnly, s))],
        ['army only', SEEDS.map((s) => runBot(heroDisabled, mapId, armyOnly, s))],
        ['hero only', SEEDS.map((s) => runBot(botData, mapId, heroOnly, s))],
        ['both (reference)', BOTS.flatMap((f) => SEEDS.map((s) => runBot(botData, mapId, f, s)))],
      ];

      const cap = target?.maxSinglePillarWinRate ?? 100;
      const row: string[] = [`  ${mapId}   (single pillar must stay ≤ ${cap}%)`];
      for (const [label, runs] of arms) {
        const win = Math.round((runs.filter((r) => r.outcome === 'win').length / runs.length) * 100);
        const dmg = Math.round(runs.reduce((s, r) => s + r.damageTaken, 0) / runs.length);
        const waves = (runs.reduce((s, r) => s + r.wavesCleared, 0) / runs.length).toFixed(1);
        // Only the single-pillar arms are held to the cap. 'towers+army' and
        // the reference are two- and three-pillar arms, and are *supposed* to
        // win — that is the other half of the invariant.
        const isPillar = label.endsWith(' only');
        const over = isPillar && win > cap;
        if (over) failures++;
        // Towers built and kills matter as much as the win rate here. Coins drop
        // from kills, so a pillar that cannot kill also cannot fund itself — and
        // "insufficient" and "starved" are different diagnoses with different fixes.
        const towers = (runs.reduce((s, r) => s + r.towers.length, 0) / runs.length).toFixed(1);
        const kills = Math.round(runs.reduce((s, r) => s + r.kills, 0) / runs.length);
        // Gold left and bow level answer "was money the constraint?" — a pillar
        // sitting on unspent gold is limited by something other than income.
        const gold = Math.round(runs.reduce((s, r) => s + r.goldLeft, 0) / runs.length);
        const bow = (runs.reduce((s, r) => s + r.bowLevel, 0) / runs.length).toFixed(1);
        row.push(
          `      ${label.padEnd(18)} win ${String(win).padStart(3)}%  ` +
            `waves ${waves.padStart(4)}/${runs[0]!.totalWaves}  dmg ${String(dmg).padStart(4)}  ` +
            `towers ${towers.padStart(4)}  kills ${String(kills).padStart(3)}  ` +
            `gold ${String(gold).padStart(4)}  bow L${bow}` +
            (over ? '   ← pillar is sufficient alone' : ''),
        );
      }
      lines.push(row.join('\n'));
    }

    console.log(
      `\n[PILLAR PROBE — TRIANGLE.md MG5.1]  ${failures === 0 ? 'OK' : `${failures} pillar(s) sufficient alone`}\n` +
        lines.join('\n') +
        '\n  Each arm must fail alone. Whether two together succeed is the complement probe below.',
    );
  });

  /**
   * The other half of the invariant: **any two pillars together must clear a
   * map**. This probe answers it for the pair the barracks exists to create.
   *
   * Run on a deliberately inflated budget, which is the whole point. On the
   * shipped economy both tower arms die on wave 1 with one tower standing — the
   * bot never reaches the point where a garrison has anything to amplify, so a
   * comparison there measures which arm starves first, not whether exposure
   * multiplies rate. Funding both arms identically and generously isolates the
   * one variable that matters: is the barracks buildable, or not.
   *
   * If `towers+army` does not beat `towers only` here, TRIANGLE §B.2 is wrong
   * and the barracks is a worse tower rather than a third pillar.
   */
  it('reports whether exposure actually multiplies rate', { timeout: 600_000 }, () => {
    /**
     * Rebuilt (M8.4c). The old probe funded every map at one fixed 260 gold,
     * and the flaw was recorded the day it shipped: both arms saturate on the
     * easy maps and both die on the hard ones, so it reported "army helps on
     * 0/4 maps" while measuring nothing — an arm that cannot exercise its
     * subject, for the third recorded time.
     *
     * Now each map is measured at ITS OWN readable budget: sweep starting
     * gold, take the level where the towers-only control lands nearest 50%,
     * and compare the arms there. At 50% every run is winnable and losable,
     * which is the only place a complement can show up as a delta.
     */
    const GOLD_SWEEP = [140, 200, 280, 400, 560, 780];
    const garrisonIds = new Set(
      data.towers.towers.filter((t) => t.levels[0]?.garrison).map((t) => t.id),
    );
    const fundedAt = (gold: number) =>
      withoutAbilities({
        ...botData,
        hero: withoutHeroDamage(data.hero),
        economy: { ...data.economy, startingGold: gold },
      });
    const winOf = (runs: BotRunResult[]) =>
      (runs.filter((r) => r.outcome === 'win').length / runs.length) * 100;
    const waveOf = (runs: BotRunResult[]) =>
      runs.reduce((s, r) => s + r.wavesCleared, 0) / runs.length;

    const lines: string[] = [];
    let complements = 0;
    let readable = 0;
    for (const mapId of Object.keys(data.maps)) {
      // Find the budget where the control is mid-range.
      let control: BotRunResult[] = [];
      let controlGold = GOLD_SWEEP[0]!;
      let bestDist = Infinity;
      for (const gold of GOLD_SWEEP) {
        const runs = SEEDS.map((s) => runBot(fundedAt(gold), mapId, combatTowersOnly, s));
        const dist = Math.abs(winOf(runs) - 50);
        if (dist < bestDist) {
          bestDist = dist;
          control = runs;
          controlGold = gold;
        }
      }
      const army = SEEDS.map((s) => runBot(fundedAt(controlGold), mapId, towersAndArmy, s));

      const winGain = winOf(army) - winOf(control);
      const gain = waveOf(army) - waveOf(control);
      // Wins decide, waves break the tie. Waves alone reads a map where the
      // army converts near-misses into clears as a *regression*, because a run
      // that wins on wave 12 and one that dies on wave 12 score the same.
      const helps = winGain > 0 || (winGain === 0 && gain > 0);
      if (helps) complements++;
      // A control still saturated at every budget cannot answer the question —
      // say so instead of counting it as a verdict either way.
      const isReadable = winOf(control) > 5 && winOf(control) < 95;
      if (isReadable) readable++;

      const row = [
        `  ${mapId}  @${controlGold}g` +
          (isReadable ? '' : '   ← saturated at every budget; unreadable') +
          (isReadable && !helps ? '   ← army adds nothing here' : ''),
      ];
      for (const [label, runs] of [
        ['towers only', control],
        ['towers+army', army],
      ] as const) {
        const garr = (
          runs.reduce(
            (s, r) => s + r.towers.filter((t) => garrisonIds.has(t.split(/[:@]/)[0]!)).length,
            0,
          ) / runs.length
        ).toFixed(1);
        row.push(
          `      ${label.padEnd(14)} win ${String(Math.round(winOf(runs))).padStart(3)}%  ` +
            `waves ${waveOf(runs).toFixed(1).padStart(4)}/${runs[0]!.totalWaves}  ` +
            `towers ${(runs.reduce((s, r) => s + r.towers.length, 0) / runs.length).toFixed(1).padStart(4)}` +
            `  garr ${garr}  kills ${String(Math.round(runs.reduce((s, r) => s + r.kills, 0) / runs.length)).padStart(3)}`,
        );
      }
      row.push(
        `      Δwin ${winGain >= 0 ? '+' : ''}${winGain.toFixed(0)}pp   ` +
          `Δwaves ${gain >= 0 ? '+' : ''}${gain.toFixed(1)}`,
      );
      lines.push(row.join('\n'));
    }
    console.log(
      `\n[COMPLEMENT PROBE — TRIANGLE.md §B.2]  army helps on ${complements}/${readable} readable maps\n` +
        lines.join('\n') +
        '\n  Each map at the budget where its control is nearest 50% — the only place a complement can show as a delta.',
    );
  });

  /**
   * Can each tower carry a run on its own? This is the verdict that matters —
   * preference above only reports what the scoring function favours, so a tower
   * it never picks might be weak or might just be mis-scored. Forcing the build
   * removes the model from the question entirely.
   */
  it('reports whether each tower can carry a map alone', { timeout: 180_000 }, () => {
    const lines: string[] = [];
    for (const tower of data.towers.towers) {
      const runs: BotRunResult[] = [];
      for (const mapId of Object.keys(data.maps)) {
        for (const seed of SEEDS) {
          runs.push(runBot(botData, mapId, forcedComposition(tower.id), seed));
        }
      }
      const wins = runs.filter((r) => r.outcome === 'win');
      const stars = wins.length ? wins.reduce((s, r) => s + r.stars, 0) / wins.length : 0;
      const dmg = runs.reduce((s, r) => s + r.damageTaken, 0) / runs.length;
      lines.push(
        `  ${tower.id.padEnd(14)} win ${pct(wins.length, runs.length)}  ` +
          `stars ${stars ? stars.toFixed(1) : ' – '}  dmg ${Math.round(dmg).toString().padStart(4)}` +
          (wins.length === 0 ? '   ← cannot carry any map' : ''),
      );
    }
    console.log('\n[solo carry — forced composition, all maps × all seeds]\n' + lines.join('\n'));
  });

  /**
   * **Path probe — SKILLTREE.md Part F.1.** Spend the whole budget down each
   * path in turn, against two controls at the *same* budget.
   *
   * The controls are the whole probe. A maxed specialist beating maps tuned
   * for a mid-tree generalist proves nothing except that 40 points beat 22 —
   * which is what progression *is*. The first version of this probe had no
   * control arm and duly reported two "dominant" paths; the number that
   * actually means something is a path's distance from a generalist holding
   * the same budget.
   *
   * - `none` — no build at all. The floor: what the maps ask for unaided.
   * - `spread` — the same points, round-robin across every path. The control.
   * - each path — the same points, all down one line.
   *
   * **Accept:** no path more than ~15pp above `spread`. A path that far ahead
   * of a generalist on equal points is the one everybody takes, and the other
   * four are decoration.
   */
  it('reports whether any single path beats a generalist on equal points', { timeout: 300_000 }, () => {
    const lines: string[] = [];
    const hardMaps = Object.keys(data.maps).filter(
      (m) => (DIFFICULTY_TARGETS[m]?.winRate[1] ?? 100) <= 75,
    );

    const measure = (build: readonly string[]) => {
      const runs: BotRunResult[] = [];
      for (const mapId of hardMaps) {
        for (const f of BOTS) {
          for (const seed of SEEDS) {
            runs.push(runBot({ ...botData, skillNodes: build }, mapId, f, seed));
          }
        }
      }
      return {
        win: (runs.filter((r) => r.outcome === 'win').length / runs.length) * 100,
        waves: runs.reduce((s, r) => s + r.wavesCleared, 0) / runs.length,
      };
    };

    const row = (label: string, build: readonly string[], vs?: number) => {
      const m = measure(build);
      lines.push(
        `  ${label.padEnd(10)} ${String(build.length).padStart(2)} nodes / ` +
          `${String(total(tree.spent(build))).padStart(2)}pt  win ${m.win.toFixed(0).padStart(3)}%  ` +
          `waves ${m.waves.toFixed(1)}` +
          (vs === undefined
            ? ''
            : `  Δ ${(m.win - vs >= 0 ? '+' : '') + (m.win - vs).toFixed(0)}pp` +
              (m.win - vs > 15 ? '   ← dominant' : '')),
      );
      return m.win;
    };

    row('none', []);
    const spread = row('spread', spreadBuild(tree, FULL_POINTS));
    for (const path of [...new Set(tree.nodes.map((n) => n.path))].sort()) {
      row(path, pathBuild(tree, path, FULL_POINTS), spread);
    }

    console.log(
      `\n[PATH PROBE — SKILLTREE.md Part F.1]  ${total(FULL_POINTS)}pt budget, maps ` +
        `${hardMaps.join(' + ')} × all bots × all seeds\n` +
        lines.join('\n') +
        '\n  Δ is against the generalist on the same points, not against the reference\n' +
        '  curve. Accept: no path more than +15pp.',
    );
  });

  /**
   * **The ramp.** Win rate per map at a spread of career budgets.
   *
   * The difficulty bands are stated against *a* build, and picking which one is
   * a design decision that was being made by accident. A career grows, so the
   * same map is played at 0 points on a first run and at 40 by someone
   * replaying for stars — the band can only describe one of those, and it has
   * to be the one a player actually meets the map at.
   *
   * This is the table that decides it. Read down a column to see whether a map
   * holds its band at the budget a player reaches it with; read across a row to
   * see how fast the tree hands out power.
   */
  it('reports the difficulty ramp across career budgets', { timeout: 600_000 }, () => {
    // Level paired with the stars a career plausibly holds at it — the career as
    // actually lived, not a level sweep at a fixed ceiling.
    const stages: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [4, 1],
      [REFERENCE_LEVEL, REFERENCE_STARS],
      [14, 3],
      [22, 4],
      [data.skillTree.maxLevel, 4],
    ];
    const lines: string[] = [
      `  ${'map'.padEnd(16)}${stages.map(([l, st]) => `LV${l}/${st}★`.padStart(8)).join('')}   band`,
      `  ${''.padEnd(16)}${stages.map(([l, st]) => `${total(at(l, st))}pt`.padStart(8)).join('')}`,
    ];

    for (const mapId of Object.keys(data.maps)) {
      const cells = stages.map(([lv, st]) => {
        const build = spreadBuild(tree, at(lv, st));
        const runs = BOTS.flatMap((f) =>
          SEEDS.map((seed) => runBot({ ...botData, skillNodes: build }, mapId, f, seed)),
        );
        return (runs.filter((r) => r.outcome === 'win').length / runs.length) * 100;
      });
      const target = DIFFICULTY_TARGETS[mapId];
      lines.push(
        `  ${mapId.padEnd(16)}${cells.map((c) => `${c.toFixed(0)}%`.padStart(8)).join('')}   ` +
          (target ? `${target.winRate[0]}-${target.winRate[1]}%` : '—'),
      );
    }

    console.log(
      '\n[RAMP]  generalist build at career level N, all bots × all seeds\n' +
        lines.join('\n') +
        `\n  A first campaign clear reaches about LV${REFERENCE_LEVEL}/${REFERENCE_STARS}★, so that is the column the\n` +
        '  bands describe. The last column is a maxed career and is expected to be\n' +
        '  high — that is what a career is for.',
    );
  });

  /**
   * **Build diversity — the probe the path probe stopped being.**
   *
   * The pure-path arms asked "can one path clear a map alone?" and that question
   * died with M7.8: once a node's value depends on what else you built, a
   * single-path build is *supposed* to fail, and `wall 40%` reports the design
   * working rather than Wall being weak.
   *
   * The question that survives is the one that was always meant: **is one way of
   * playing superior?** That can only be asked over the builds a player would
   * actually assemble, which are mixed. So: sample legal builds at the reference
   * budget, run each, and look at two things.
   *
   * 1. **The spread.** If every build scores the same, the tree does not matter.
   *    If it spans 0-100%, most of it is traps.
   * 2. **Path share, top third against bottom.** This is the real answer. If a
   *    path takes a much larger share of points in the winning builds than the
   *    losing ones, that path is carrying, however its solo arm measured.
   *
   * Seeded off a fixed stream so the sampled builds are the same every run —
   * a probe whose subjects change between measurements cannot show a trend.
   */
  it('reports whether any way of building is superior', { timeout: 300_000 }, () => {
    const SAMPLES = 14;
    const rng = makeRng(90210);
    const tree2 = tree;
    const paths = [...new Set(tree2.nodes.map((n) => n.path))].sort();
    const hardMaps = Object.keys(data.maps).filter(
      (m) => (DIFFICULTY_TARGETS[m]?.winRate[1] ?? 100) <= 75,
    );

    const rows = Array.from({ length: SAMPLES }, () => {
      const build = randomBuild(tree2, at(REFERENCE_LEVEL, REFERENCE_STARS), rng);
      const runs: BotRunResult[] = [];
      for (const mapId of hardMaps) {
        for (const f of BOTS) {
          for (const seed of SEEDS) runs.push(runBot({ ...botData, skillNodes: build }, mapId, f, seed));
        }
      }
      const share = pathShare(tree2, build);
      const spentTotal = tree2.spent(build) || 1;
      return {
        win: (runs.filter((r) => r.outcome === 'win').length / runs.length) * 100,
        waves: runs.reduce((s, r) => s + r.wavesCleared, 0) / runs.length,
        nodes: build.length,
        share: Object.fromEntries(paths.map((p) => [p, ((share[p] ?? 0) / spentTotal) * 100])),
      };
    }).sort((a, b) => b.win - a.win);

    const lines = rows.map(
      (r) =>
        `  ${`${r.win.toFixed(0)}%`.padStart(4)}  w${r.waves.toFixed(1).padStart(4)}  ` +
        `${String(r.nodes).padStart(2)}n   ` +
        paths.map((p) => `${p.slice(0, 2)} ${r.share[p]!.toFixed(0).padStart(2)}`).join('  '),
    );

    // Top third against bottom third. A path much heavier among winners is the
    // one carrying, whatever its solo arm said.
    const third = Math.max(1, Math.floor(rows.length / 3));
    const avg = (set: typeof rows, p: string) => set.reduce((s, r) => s + r.share[p]!, 0) / set.length;
    const top = rows.slice(0, third);
    const bottom = rows.slice(-third);
    const verdict = paths
      .map((p) => {
        const d = avg(top, p) - avg(bottom, p);
        return (
          `  ${p.padEnd(6)} top ${avg(top, p).toFixed(0).padStart(2)}%  ` +
          `bottom ${avg(bottom, p).toFixed(0).padStart(2)}%  ` +
          `${(d >= 0 ? '+' : '') + d.toFixed(0)}pp` +
          (Math.abs(d) >= 12 ? (d > 0 ? '   ← carries' : '   ← drags') : '')
        );
      })
      .join('\n');

    const wins = rows.map((r) => r.win);
    console.log(
      `\n[BUILD DIVERSITY]  ${SAMPLES} sampled builds at LV${REFERENCE_LEVEL}/${REFERENCE_STARS}★, ` +
        `maps ${hardMaps.join(' + ')} × all bots × all seeds\n` +
        `   win  waves  size   ${paths.map((p) => p.slice(0, 2)).join('   ')}  (% of points)\n` +
        lines.join('\n') +
        `\n  spread ${Math.min(...wins).toFixed(0)}-${Math.max(...wins).toFixed(0)}%  ` +
        `median ${wins[Math.floor(wins.length / 2)]!.toFixed(0)}%\n\n` +
        '  Share of points, winning builds vs losing:\n' +
        verdict +
        '\n  Accept: no path more than ~12pp heavier among winners. A path that far\n' +
        '  ahead is the one everybody has to take, whatever its solo arm measured.',
    );
  });

  /**
   * **Contribution probe — the instrument M7.8 asked for.**
   *
   * Every earlier probe scored a path by the wins of builds that CONTAIN it,
   * which conflates "this path carries" with "winners happened to hold it" —
   * the exact confusion that had ride blamed for a poisoned instrument and
   * host read as dead when nothing green was worth blocking.
   *
   * This one asks the causal question: for each sampled build and each path
   * it spent points in, replay the same build with that path ABLATED and the
   * freed points RESPREAD across the build's other paths at the same budget.
   * The path's contribution is base − respread: what those points bought
   * *over spending them elsewhere*. Positive = the points earned their place;
   * negative = a respec would have won more.
   *
   * One composition level per biome — the L3s, where each world's question is
   * sharpest — so a path can contribute in one world and not another.
   */
  it("reports each path's marginal contribution (ablation, respread)", { timeout: 1_800_000 }, () => {
    const SAMPLES = 12;
    const ABLATION_SEEDS = SEEDS.slice(0, 6);
    /**
     * ALL maps, not a per-biome pick. The first run used the three L3
     * composition levels and read host at −24pp — but composition levels are
     * build-punishers BY DESIGN and two of three punish the army, so the path
     * was sentenced on hostile ground. Averaging every level a biome ships is
     * the only selection-free frame; the per-biome breakdown below preserves
     * the "earns its keep here, not there" signal that per-map picks wanted.
     */
    const probeMaps = Object.keys(data.maps);
    const biomeOf = (m: string) => data.maps[m]!.biomeId;
    const budget = at(REFERENCE_LEVEL, REFERENCE_STARS);
    const paths = [...new Set(tree.nodes.map((n) => n.path))].sort();

    const buildRng = makeRng(7777);
    const builds = Array.from({ length: SAMPLES }, () => randomBuild(tree, budget, buildRng));

    const winOf = (build: readonly string[]): { overall: number; byBiome: Record<string, number> } => {
      const wins: Record<string, number> = {};
      const totals: Record<string, number> = {};
      let allWins = 0;
      let allTotal = 0;
      for (const mapId of probeMaps) {
        const b = biomeOf(mapId);
        for (const f of BOTS) {
          for (const seed of ABLATION_SEEDS) {
            const r = runBot({ ...botData, skillNodes: build }, mapId, f, seed);
            allTotal++;
            totals[b] = (totals[b] ?? 0) + 1;
            if (r.outcome === 'win') {
              allWins++;
              wins[b] = (wins[b] ?? 0) + 1;
            }
          }
        }
      }
      const byBiome: Record<string, number> = {};
      for (const b of Object.keys(totals)) byBiome[b] = ((wins[b] ?? 0) / totals[b]!) * 100;
      return { overall: (allWins / allTotal) * 100, byBiome };
    };

    /** The build with `path` removed and its points respent on the rest. */
    const respread = (build: readonly string[], path: string, salt: number): readonly string[] => {
      const rng = makeRng(9000 + salt);
      let allocated: readonly string[] = [];
      for (const id of build) {
        const n = tree.node(id);
        if (!n || n.path === path) continue;
        if (tree.canAllocate(id, { allocated, pointsEarned: budget })) {
          allocated = tree.allocate(id, { allocated, pointsEarned: budget });
        }
      }
      for (;;) {
        const open = tree.nodes.filter(
          (n) => n.path !== path && tree.canAllocate(n.id, { allocated, pointsEarned: budget }),
        );
        if (open.length === 0) break;
        const pick = open[Math.min(open.length - 1, Math.floor(rng() * open.length))]!;
        allocated = tree.allocate(pick.id, { allocated, pointsEarned: budget });
      }
      return allocated;
    };

    const contributions = new Map<string, number[]>();
    const biomeContrib = new Map<string, Record<string, number[]>>();
    const pointsIn = new Map<string, number[]>();
    builds.forEach((build, bi) => {
      const base = winOf(build);
      const share = pathShare(tree, build);
      for (const [path, pts] of Object.entries(share)) {
        if (pts <= 0) continue;
        const after = winOf(respread(build, path, bi * 10 + paths.indexOf(path as (typeof paths)[number])));
        contributions.set(path, [...(contributions.get(path) ?? []), base.overall - after.overall]);
        const per = biomeContrib.get(path) ?? {};
        for (const b of Object.keys(base.byBiome)) {
          per[b] = [...(per[b] ?? []), base.byBiome[b]! - (after.byBiome[b] ?? 0)];
        }
        biomeContrib.set(path, per);
        pointsIn.set(path, [...(pointsIn.get(path) ?? []), pts]);
      }
    });

    const lines = paths.map((p) => {
      const cs = contributions.get(p) ?? [];
      if (cs.length === 0) return `  ${p.padEnd(6)} (unsampled)`;
      const mean = cs.reduce((a, b) => a + b, 0) / cs.length;
      const pts = (pointsIn.get(p) ?? []).reduce((a, b) => a + b, 0) / cs.length;
      const perPt = mean / Math.max(1, pts);
      const flag = mean <= -8 ? '   ← a respec would win more' : mean >= 8 ? '   ← earns its points' : '';
      const per = biomeContrib.get(p) ?? {};
      const biomeCols = Object.keys(per)
        .sort()
        .map((b) => {
          const v = per[b]!.reduce((a2, c) => a2 + c, 0) / per[b]!.length;
          return `${b.split('-')[0]} ${(v >= 0 ? '+' : '') + v.toFixed(0)}`;
        })
        .join('  ');
      return (
        `  ${p.padEnd(6)} contribution ${(mean >= 0 ? '+' : '') + mean.toFixed(1).padStart(5)}pp ` +
        `over ${String(cs.length).padStart(2)} builds  (~${pts.toFixed(1)}pt, ` +
        `${(perPt >= 0 ? '+' : '') + perPt.toFixed(1)}pp/pt)  [${biomeCols}]${flag}`
      );
    });

    console.log(
      `\n[CONTRIBUTION PROBE — M7.8's ask]  ${SAMPLES} builds × ablate-and-respread, ` +
        `all ${probeMaps.length} maps × all bots × ${ABLATION_SEEDS.length} seeds, per-biome breakdown\n` +
        lines.join('\n') +
        '\n  contribution = win(build) − win(same budget, this path respec into the rest).\n' +
        '  Positive: the points earn their place. Negative: a respec wins more.\n' +
        '  Accept: no path ≤ −8pp (dead weight) and none ≥ +12pp (the mandatory pick).',
    );
  });

  /**
   * **Pool probe — the biome thesis, tested before a single map is authored.**
   *
   * BIOMES.md rests on one claim: *different enemy pools make different builds
   * correct*. If that holds, twelve maps are worth authoring. If it does not,
   * biomes would be palettes and the whole plan should be cut — which is a much
   * cheaper thing to learn now than after eight hand-made boards.
   *
   * **Single variable.** Each pool runs the *same map* and the *same wave
   * shapes* — counts, spacing, lanes and pacing are untouched. Only the species
   * change, and counts are rebalanced so each entry carries the **same total
   * HP** it did before. Without that normalisation, swapping 8hp swarms for
   * 105hp halberdiers would make the Iron pool brutally harder and the probe
   * would measure difficulty rather than *type* — the confound that has bitten
   * this harness five times.
   *
   * Read the bottom table only. Per-pool win rates are not comparable to each
   * other (HP-matched is not difficulty-matched); what matters is whether the
   * *carrying path* differs between pools.
   */
  it('reports whether different enemy pools make different builds correct', { timeout: 600_000 }, () => {
    // Each pool now carries one counter-enemy (BIOMES.md Part K) — the whole
    // point of M9. Green keeps none: it is the teaching pool, and a pool where
    // towers *are* the answer is the control the other two are read against.
    //
    // Natives (warden, stalker) are deliberately NOT in these reskin pools.
    // The round-robin weights every species equally, which casts a sparse
    // accent enemy as one body in five — measured, that dragged both readable
    // pools toward the natives' shared hero-shaped counter (ride/hunt) and
    // failed Part G on density the campaign never ships. The authored-biome
    // probe below measures the natives at their real wave densities and is
    // the gate that judges them.
    // Each pool is measured under ITS OWN biome (the reskinned map's biomeId is
    // overridden per pool, so runBot resolves that biome's terrain rule) —
    // never under the base map's. Inheriting the base map's rule taxed every
    // reskin with physics only Iron has, which drove the green control row to
    // 0% and made it unreadable.
    const POOLS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
      ['green', 'green-road', ['grunt', 'swarm', 'runner', 'looter']],
      ['iron', 'iron-deeps', ['grunt', 'brute', 'halberdier', 'juggernaut']],
      ['steppe', 'long-steppe', ['grunt', 'wolf-rider', 'raven', 'sapper']],
    ];
    const SAMPLES = 18;
    const mapId = 'crossroads';
    const hpOf = new Map(data.enemies.enemies.map((e) => [e.id, e.hp]));
    const paths = [...new Set(tree.nodes.map((n) => n.path))].sort();

    /**
     * Same waves, different species, same TOTAL HP per wave.
     *
     * Two normalisations were tried and both saturated rows into
     * unreadability. Per-entry HP normalisation turns one 3-brute entry into a
     * 26-swarm flood the moment the base map's mix goes heavy — not a reskin
     * of the wave's shape but a different wave. Clamping the counts alone
     * fixed the floods but let total wave HP drift by the hp ratio of whatever
     * the round-robin happened to swap in.
     *
     * So: counts stay shape-preserving (at most double, at least half), and
     * the wave's own hpMultiplier absorbs the difference so every reskin
     * carries exactly the original wave's total HP. What still differs between
     * pools is species behaviour — speed, flying, blockImmune, towerBreak,
     * hindered-only damage — which is precisely the signal the probe exists
     * to read.
     */
    const reskin = (pool: readonly string[]) => {
      const base = data.waveSets[mapId]!;
      let i = 0;
      return {
        ...base,
        waves: base.waves.map((w) => {
          let origHp = 0;
          let newHp = 0;
          const entries = w.entries.map((e) => {
            const swap = pool[i++ % pool.length]!;
            const oldUnit = hpOf.get(e.enemyId) ?? 1;
            const newUnit = hpOf.get(swap) ?? 1;
            const normalised = Math.round((e.count * oldUnit) / newUnit);
            const count = Math.max(1, Math.max(Math.ceil(e.count / 2), Math.min(e.count * 2, normalised)));
            origHp += e.count * oldUnit;
            newHp += count * newUnit;
            return { ...e, enemyId: swap, count };
          });
          return { ...w, entries, hpMultiplier: w.hpMultiplier * (newHp > 0 ? origHp / newHp : 1) };
        }),
      };
    };

    // The same sampled builds for every pool, so a difference between pools
    // cannot be a difference between build samples.
    const buildRng = makeRng(4242);
    const builds = Array.from({ length: SAMPLES }, () =>
      randomBuild(tree, at(REFERENCE_LEVEL, REFERENCE_STARS), buildRng),
    );

    const lines: string[] = [];
    /** path → pools where it ranks in the top third of winners' point share. */
    const topThirdIn = new Map<string, string[]>();
    let readablePools = 0;
    for (const [name, biomeId, pool] of POOLS) {
      const poolData = {
        ...botData,
        maps: { ...data.maps, [mapId]: { ...data.maps[mapId]!, biomeId } },
        waveSets: { ...data.waveSets, [mapId]: reskin(pool) },
      };
      const rows = builds
        .map((build) => {
          const runs = BOTS.flatMap((f) =>
            SEEDS.map((seed) => runBot({ ...poolData, skillNodes: build }, mapId, f, seed)),
          );
          const share = pathShare(tree, build);
          const total = tree.spent(build) || 1;
          return {
            win: (runs.filter((r) => r.outcome === 'win').length / runs.length) * 100,
            share: Object.fromEntries(paths.map((p) => [p, ((share[p] ?? 0) / total) * 100])),
          };
        })
        .sort((a, b) => b.win - a.win);

      const third = Math.max(1, Math.floor(rows.length / 3));
      const avg = (set: typeof rows, p: string) =>
        set.reduce((s, r) => s + r.share[p]!, 0) / set.length;
      const deltas = paths.map((p) => avg(rows.slice(0, third), p) - avg(rows.slice(-third), p));
      // Top two, not one: a single max-delta label hides the signature. Two
      // pools can share a generically-strong top path while differing
      // completely in what comes second — and the second place is often the
      // biome talking (the sapper suppressing wall, open-country lifting ride).
      const order = paths
        .map((p, i) => ({ p, d: deltas[i]! }))
        .sort((a, b) => b.d - a.d);
      const wins = rows.map((r) => r.win);
      // A saturated row cannot rank anything: with every build at the same win
      // rate, "top third vs bottom third" is sort-order noise. The authored
      // probe already refuses to read such rows; the verdict here must too, or
      // green's 100–100% control votes on a question it never asked.
      const readable = Math.max(...wins) - Math.min(...wins) >= 10;
      const best = readable
        ? `${order[0]!.p}, then ${order[1]!.p} ${order[1]!.d >= 0 ? '+' : ''}${order[1]!.d.toFixed(0)}`
        : 'unreadable (saturated)';
      if (readable) {
        readablePools++;
        for (const { p } of order.slice(0, Math.ceil(paths.length / 3))) {
          topThirdIn.set(p, [...(topThirdIn.get(p) ?? []), name]);
        }
      }

      lines.push(
        `  ${name.padEnd(7)} win ${Math.min(...wins).toFixed(0).padStart(2)}-` +
          `${Math.max(...wins).toFixed(0).padStart(3)}%   ` +
          paths.map((p, i) => `${p.slice(0, 2)} ${(deltas[i]! >= 0 ? '+' : '') + deltas[i]!.toFixed(0)}`.padEnd(8)).join('') +
          `  carries: ${best}`,
      );
    }

    console.log(
      `\n[POOL PROBE — BIOMES.md thesis]  ${SAMPLES} shared builds, ${mapId} reskinned per pool,\n` +
        '  same wave shapes, counts HP-normalised so only the species differ.\n' +
        `  ${''.padEnd(20)}${paths.map((p) => p.slice(0, 2).padEnd(8)).join('')}  (pp heavier among winners)\n` +
        lines.join('\n') +
        '\n\n  THE TEST: does the carrying path differ between pools?\n' +
        '  Same path all three → biomes would be palettes; cut the plan.\n' +
        '  Different paths → the thesis holds and twelve maps are worth authoring.\n' +
        '\n' +
        // Part G's acceptance, as a verdict rather than a reading exercise:
        // a path in the winners' top third of ALL pools is the build everyone
        // takes everywhere, which is what biomes exist to prevent.
        (() => {
          if (readablePools < 2) {
            return '  [ACCEPT — BIOMES.md Part G] UNREADABLE: fewer than two pools have spread.';
          }
          const everywhere = [...topThirdIn.entries()]
            .filter(([, pools]) => pools.length === readablePools)
            .map(([p]) => p);
          return everywhere.length === 0
            ? `  [ACCEPT — BIOMES.md Part G] PASS: no path is top-third in every readable pool (${readablePools}).`
            : `  [ACCEPT — BIOMES.md Part G] FAIL: ${everywhere.join(', ')} top-third in every readable pool (${readablePools}).`;
        })(),
    );
  });

  /**
   * **Exposure probe — why the army leg fails, not that it does.**
   *
   * Every probe before this one could only report the *verdict*: a barracks is
   * not worth the plot it costs, everywhere, and was not worth it before biomes
   * either. None of them could say why, and the two candidate causes want
   * opposite fixes:
   *
   * - **Soldiers do not hold long enough.** Then `block s` is near zero and the
   *   fix is squad hp, respawn, or engage radius.
   * - **Soldiers hold in the wrong place.** Then `block s` is healthy but
   *   `under fire` is a small fraction of it, and the fix is geometry — rally
   *   range, plot choice, or where garrison plots sit on a map. CLAUDE.md
   *   already names this failure; nothing had ever measured it.
   *
   * The army is *defined* as exposure — it barely damages, it buys towers more
   * seconds on a stationary target. So held-seconds-under-fire is not a proxy
   * for the pillar's value, it **is** the pillar's value, and a pillar whose
   * defining quantity has never been measured is a pillar taken on faith.
   *
   * The coverage test is deliberately generous: any armed plot in range counts,
   * with no line of sight and no targeting check. A generous test that still
   * returns a low number is a far stronger result than a strict one that does.
   */
  it('reports what a garrison actually buys — held seconds under fire', { timeout: 600_000 }, () => {
    const funded = withoutAbilities({
      ...botData,
      hero: withoutHeroDamage(data.hero),
      economy: { ...data.economy, startingGold: 260 },
    });
    const lines: string[] = [];
    for (const mapId of Object.keys(data.maps)) {
      const arms: Array<[string, BotRunResult[]]> = [
        ['towers only', SEEDS.map((s) => runBot(funded, mapId, combatTowersOnly, s))],
        ['towers+army', SEEDS.map((s) => runBot(funded, mapId, towersAndArmy, s))],
        ['army only', SEEDS.map((s) => runBot(funded, mapId, armyOnly, s))],
      ];
      const row = [`  ${mapId}`];
      for (const [label, runs] of arms) {
        const mean = (f: (r: BotRunResult) => number) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
        const held = mean((r) => r.blockSeconds);
        const covered = mean((r) => r.coveredBlockSeconds);
        // The ratio is the diagnosis. Held seconds say whether the line holds;
        // the share under fire says whether holding was worth anything.
        const share = held > 0 ? (covered / held) * 100 : 0;
        row.push(
          `      ${label.padEnd(12)} block ${held.toFixed(0).padStart(5)}s  ` +
            `under fire ${covered.toFixed(0).padStart(5)}s (${share.toFixed(0).padStart(3)}%)  ` +
            `posts covered ${(mean((r) => r.postSeconds) > 0 ? (mean((r) => r.coveredPostSeconds) / mean((r) => r.postSeconds)) * 100 : 0).toFixed(0).padStart(3)}%  ` +
            `soldier life ${mean((r) => r.soldierLifetime).toFixed(1).padStart(5)}s  ` +
            `kills ${String(Math.round(mean((r) => r.kills))).padStart(3)}`,
        );
      }
      lines.push(row.join('\n'));
    }
    console.log(
      '\n[EXPOSURE PROBE — what the army leg actually buys]  funded arms, all seeds\n' +
        lines.join('\n') +
        '\n\n  block s near zero      → the line dies too fast; fix hp/respawn/engage.\n' +
        '  under fire % near zero → the line holds where nothing shoots; fix geometry.\n' +
        '  both healthy           → exposure works and the barracks is simply overpriced\n' +
        '                           against a combat tower on the same plot.',
    );
  });

  /**
   * **M8.4a — biome diversity, on the real thing.**
   *
   * The pool probe above is a laboratory: one map, reskinned, HP-normalised, no
   * terrain rule. It answered "could pools ever matter" and that was the right
   * question to ask before authoring anything. This probe asks the shipping
   * question instead — *do the biomes as actually built still make different
   * builds correct*, with their real maps, their real waves and their terrain
   * rules folded in.
   *
   * It is the weaker instrument of the two and deliberately so. Biomes sit at
   * different campaign positions, so difficulty is confounded with type and the
   * win rates are not comparable across rows. Only the carrying path is.
   *
   * **It refuses to read a row it cannot read.** A biome whose sampled builds
   * all win (or all lose) has no winners to compare against losers, and the
   * path deltas there are noise wearing a number's clothes. Green is expected
   * to land in exactly that state — it is the teaching biome — and printing
   * "unreadable" is the honest result. Reading it anyway is the mistake this
   * harness has now made six times.
   */
  it('reports whether the authored biomes make different builds correct', { timeout: 900_000 }, () => {
    const SAMPLES = 16;
    const paths = [...new Set(tree.nodes.map((n) => n.path))].sort();
    /** Below this spread between best and worst build, a row is not evidence. */
    const READABLE_SPREAD = 20;

    // The same sampled builds for every biome, so a difference between biomes
    // cannot be a difference between build samples.
    const buildRng = makeRng(8484);
    const builds = Array.from({ length: SAMPLES }, () =>
      randomBuild(tree, at(REFERENCE_LEVEL, REFERENCE_STARS), buildRng),
    );

    const lines: string[] = [];
    const carriers: string[] = [];
    for (const biome of [...data.biomes].sort((a, b) => a.order - b.order)) {
      const mapIds = Object.keys(data.maps).filter((id) => data.maps[id]!.biomeId === biome.id);
      if (!mapIds.length) continue;

      const rows = builds
        .map((build) => {
          const runs = mapIds.flatMap((mapId) =>
            BOTS.flatMap((f) => SEEDS.map((seed) => runBot({ ...botData, skillNodes: build }, mapId, f, seed))),
          );
          const share = pathShare(tree, build);
          const spent = tree.spent(build) || 1;
          return {
            win: (runs.filter((r) => r.outcome === 'win').length / runs.length) * 100,
            share: Object.fromEntries(paths.map((p) => [p, ((share[p] ?? 0) / spent) * 100])),
          };
        })
        .sort((a, b) => b.win - a.win);

      const wins = rows.map((r) => r.win);
      const spread = Math.max(...wins) - Math.min(...wins);
      const third = Math.max(1, Math.floor(rows.length / 3));
      const avg = (set: typeof rows, p: string) => set.reduce((s, r) => s + r.share[p]!, 0) / set.length;
      const deltas = paths.map((p) => avg(rows.slice(0, third), p) - avg(rows.slice(-third), p));
      const readable = spread >= READABLE_SPREAD;
      const best = paths[deltas.indexOf(Math.max(...deltas))]!;
      if (readable) carriers.push(best);

      lines.push(
        `  ${biome.id.padEnd(12)}${(biome.terrainRule ?? '(control)').padEnd(14)}` +
          `win ${Math.min(...wins).toFixed(0).padStart(3)}-${Math.max(...wins).toFixed(0).padStart(3)}%  ` +
          paths.map((p, i) => `${p.slice(0, 2)} ${(deltas[i]! >= 0 ? '+' : '') + deltas[i]!.toFixed(0)}`.padEnd(8)).join('') +
          (readable ? `  carries: ${best}` : `  unreadable (spread ${spread.toFixed(0)}pp)`) +
          `\n${''.padEnd(16)}maps: ${mapIds.join(', ')}`,
      );
    }

    const distinct = new Set(carriers).size;
    console.log(
      `\n[BIOME PROBE — M8.4a]  ${SAMPLES} shared builds at LV${REFERENCE_LEVEL}/${REFERENCE_STARS}★, ` +
        'every authored map in each biome × all bots × all seeds\n' +
        `  ${''.padEnd(26)}${''.padEnd(11)}${paths.map((p) => p.slice(0, 2).padEnd(8)).join('')}  (pp heavier among winners)\n` +
        lines.join('\n') +
        `\n\n  ${carriers.length} readable row(s), ${distinct} distinct carrying path(s).\n` +
        '  Win rates are NOT comparable across rows — biomes sit at different campaign\n' +
        '  positions. Only the carrying path is. Rows with too narrow a spread are not\n' +
        '  evidence in either direction and say so rather than reporting a winner.',
    );
  });

  /**
   * **M8.4b — the triangle, per biome rather than per map.**
   *
   * TRIANGLE.md's invariant is stated over maps, and until now it was measured
   * over maps. Biomes change what it is measuring: `narrow-cuts` takes 18% off
   * every sightline and `open-country` speeds the enemy up, and either could
   * push a pillar past the edges of the invariant in a way that a per-map read
   * averages into invisibility.
   *
   * Two failures are possible and they are not symmetric:
   *
   * - **A pillar becomes sufficient alone** in some biome. That is the invariant
   *   breaking, and it is the one the caps catch.
   * - **A pillar becomes worthless** in some biome — towers under `narrow-cuts`
   *   is the obvious candidate. No cap catches this, and it is arguably worse:
   *   a biome where one third of the game does not participate is a biome that
   *   plays itself. The `towers+army` row is the read for it.
   *
   * Runs before M8.5 authors eight more maps, because a terrain rule that
   * breaks the triangle is much cheaper to change now than across twelve boards.
   */
  it('reports whether the triangle holds in every biome', { timeout: 900_000 }, () => {
    const heroDisabled = withoutAbilities({ ...botData, hero: withoutHeroDamage(data.hero) });
    const funded = withoutAbilities({
      ...botData,
      hero: withoutHeroDamage(data.hero),
      // Same inflation as the complement probe, and for the same reason: on the
      // shipped economy neither tower arm survives to build a barracks, so an
      // unfunded comparison measures which arm starves first.
      economy: { ...data.economy, startingGold: 260 },
    });
    const winOf = (runs: BotRunResult[]) =>
      (runs.filter((r) => r.outcome === 'win').length / runs.length) * 100;
    const wavesOf = (runs: BotRunResult[]) =>
      runs.reduce((s, r) => s + r.wavesCleared / Math.max(1, r.totalWaves), 0) / runs.length * 100;

    const lines: string[] = [];
    let sufficient = 0;
    let inert = 0;
    for (const biome of [...data.biomes].sort((a, b) => a.order - b.order)) {
      const mapIds = Object.keys(data.maps).filter((id) => data.maps[id]!.biomeId === biome.id);
      if (!mapIds.length) continue;
      const across = (data: typeof botData, factory: BotFactory) =>
        mapIds.flatMap((mapId) => SEEDS.map((s) => runBot(data, mapId, factory, s)));

      // The funded pair and its control are printed rather than derived. An
      // earlier cut compared the funded pair against the *unfunded* solo arm and
      // reported the funding as if it were the army — the confound this harness
      // keeps re-inventing. Both halves of a comparison have to be on the page.
      const soloFunded = across(funded, combatTowersOnly);
      const pairFunded = across(funded, towersAndArmy);
      const arms: Array<[string, BotRunResult[]]> = [
        ['towers only', across(heroDisabled, towersOnly)],
        ['army only', across(heroDisabled, armyOnly)],
        ['hero only', across(botData, heroOnly)],
        ['towers only +gold', soloFunded],
        ['towers+army +gold', pairFunded],
        ['all three (ref)', mapIds.flatMap((m) => BOTS.flatMap((f) => SEEDS.map((s) => runBot(botData, m, f, s))))],
      ];
      // The cap is the loosest of the biome's maps: a biome is judged by whether
      // a pillar can hold *any* of its boards, not the average of them.
      const cap = Math.max(...mapIds.map((id) => DIFFICULTY_TARGETS[id]?.maxSinglePillarWinRate ?? 100));
      const pairGain = winOf(pairFunded) - winOf(soloFunded);
      // Wins decide, progress breaks the tie — the complement probe's rule. Two
      // arms both pinned at 100% is a ceiling, not a finding, and two both at 0%
      // still differ in how far they got.
      const progressGain = wavesOf(pairFunded) - wavesOf(soloFunded);
      const helps = pairGain > 0 || (pairGain === 0 && progressGain > 0);

      const row = [
        `  ${biome.id.padEnd(12)}${(biome.terrainRule ?? '(control)').padEnd(14)}` +
          `single pillar must stay ≤ ${cap}%   maps: ${mapIds.join(', ')}`,
      ];
      for (const [label, runs] of arms) {
        const isPillar = label.endsWith(' only');
        const win = winOf(runs);
        const over = isPillar && win > cap;
        if (over) sufficient++;
        // The composition, not just the count. "8 towers" hides the difference
        // between a board with one barracks and a board that is half garrison,
        // and those are opposite diagnoses: the first says exposure is not worth
        // a plot, the second says the bot built a garrison farm and the arm
        // never tested the pair at all.
        const built = new Map<string, number>();
        for (const r of runs) for (const t of r.towers) built.set(t, (built.get(t) ?? 0) + 1);
        const mix = [...built]
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => `${id}×${(n / runs.length).toFixed(1)}`)
          .join(' ');
        row.push(
          `      ${label.padEnd(16)} win ${win.toFixed(0).padStart(3)}%  ` +
            `progress ${wavesOf(runs).toFixed(0).padStart(3)}%  ` +
            `kills ${String(Math.round(runs.reduce((s, r) => s + r.kills, 0) / runs.length)).padStart(3)}  ` +
            `${mix || '(built nothing)'}` +
            (over ? '   ← sufficient alone, invariant broken' : ''),
        );
      }
      if (!helps) inert++;
      row.push(
        `      army over towers alone (both funded): ${pairGain >= 0 ? '+' : ''}${pairGain.toFixed(0)}pp win, ` +
          `${progressGain >= 0 ? '+' : ''}${progressGain.toFixed(0)}pp progress` +
          (helps ? '' : '   ← exposure buys nothing here'),
      );
      lines.push(row.join('\n'));
    }

    console.log(
      `\n[TRIANGLE BY BIOME — M8.4b]  ${sufficient} pillar(s) sufficient alone, ` +
        `${inert} biome(s) where the army adds nothing\n` +
        lines.join('\n') +
        '\n\n  Two ways to fail, and they need different fixes. A pillar sufficient alone is\n' +
        '  the invariant breaking. A pillar worth nothing is a biome that plays itself —\n' +
        '  no cap catches that one, so read the last line of each block.',
    );
  });

  /**
   * **Budget probe — Part F.2.** Rule 1 of the design ("you can never finish the
   * tree") as a number rather than an intention.
   *
   * The schema already refuses to load a tree over the ceiling, so this is not a
   * second guard — it is the readout that says how much headroom is left before
   * the next batch of nodes trips it.
   */
  it('reports the allocatable fraction at max level, per pool', () => {
    // Reported per half as well as overall — not as a second gate (one budget
    // buys anywhere now) but because a half nobody can afford to enter is still
    // a design problem, just a different one.
    const lines = tree.pools.map(
      (pool) =>
        `  ${tree.poolName(pool).padEnd(8)} ${String(tree.totalCost(pool)).padStart(3)}pt of nodes  ` +
        `(${((tree.totalCost(pool) / tree.totalCost()) * 100).toFixed(0)}% of the tree)`,
    );
    console.log(
      `\n[BUDGET PROBE — SKILLTREE.md Part F.2]  tree ${tree.nodes.length} nodes / ` +
        `${tree.totalCost()}pt\n` +
        `  budget ${FULL_POINTS}pt → ${((FULL_POINTS / tree.totalCost()) * 100).toFixed(1)}% allocatable\n` +
        lines.join('\n') +
        '\n  Accept: ≤35%. Above that the tree stops being a set of choices.',
    );
  });

  /**
   * **Keystone probe — Part F.3.** Force each keystone and compare it against
   * the one it excludes.
   *
   * Two failures, opposite shapes, same cost: a keystone nobody would take is a
   * dead node, and a keystone everybody would take is not a choice. Both show up
   * as a gap between the pair, which is why they are reported side by side
   * rather than ranked in one column.
   */
  it('reports whether either keystone in a pair dominates', { timeout: 300_000 }, () => {
    const lines: string[] = [];
    const hardMaps = Object.keys(data.maps).filter(
      (m) => (DIFFICULTY_TARGETS[m]?.winRate[1] ?? 100) <= 75,
    );
    const keystones = tree.nodes.filter((n) => n.kind === 'keystone');
    const seen = new Set<string>();

    for (const k of keystones) {
      if (seen.has(k.id)) continue;
      const partner = keystones.find((o) => k.excludes.includes(o.id));
      if (partner) seen.add(partner.id);
      seen.add(k.id);

      const rate = (id: string) => {
        // Walk the keystone's own path so the prerequisites are paid for, then
        // force the keystone itself. Spending elsewhere first would measure the
        // build around it rather than the keystone.
        const build = pathBuild(tree, k.path, FULL_POINTS).filter(
          (n) => n === id || !keystones.some((o) => o.id === n),
        );
        const withK = build.includes(id) ? build : [...build, id];
        const runs: BotRunResult[] = [];
        for (const mapId of hardMaps) {
          for (const f of BOTS) {
            for (const seed of SEEDS) {
              runs.push(runBot({ ...botData, skillNodes: withK }, mapId, f, seed));
            }
          }
        }
        // Build composition, because a win rate alone cannot distinguish "the
        // keystone is weak" from "the bot misplays under it" — the curtain
        // collapse taught that the hard way. '@L2'/'@L3' entries carry their
        // level; a ':branch' suffix is level 4; a bare id is level 1.
        const depthOf = (t: string) =>
          t.includes(':') ? 4 : t.includes('@L') ? Number(t.split('@L')[1]) : 1;
        const towers = runs.reduce((s2, r) => s2 + r.towers.length, 0) / runs.length;
        const totalBuilt = Math.max(1, runs.reduce((s2, r) => s2 + r.towers.length, 0));
        const depth =
          runs.reduce((s2, r) => s2 + r.towers.reduce((a2, t) => a2 + depthOf(t), 0), 0) / totalBuilt;
        // Income share, because a board can have the right count and depth and
        // still be mills all the way down — the documented rich-bot trap, and
        // exactly what a cost discount amplifies.
        const incomeIds = new Set(
          data.towers.towers.filter((t) => t.levels[0]?.income).map((t) => t.id),
        );
        const income =
          runs.reduce(
            (s2, r) => s2 + r.towers.filter((t) => incomeIds.has(t.split(/[:@]/)[0]!)).length,
            0,
          ) / totalBuilt;
        return {
          win: (runs.filter((r) => r.outcome === 'win').length / runs.length) * 100,
          towers,
          depth,
          income,
        };
      };

      const a = rate(k.id);
      const b = partner ? rate(partner.id) : null;
      // The path without either keystone — so a pair that both scores 90% can
      // be read as "the path was already at 90%" rather than "both keystones
      // are enormous".
      const bare = rate('');
      const comp = (r: { towers: number; depth: number; income: number }) =>
        `[${r.towers.toFixed(1)}t@${r.depth.toFixed(1)} inc${Math.round(r.income * 100)}%]`;
      lines.push(
        `  ${k.path.padEnd(6)} (no keystone ${bare.win.toFixed(0).padStart(3)}% ${comp(bare)})  ` +
          `${k.id.padEnd(20)} ${a.win.toFixed(0).padStart(3)}% ${comp(a)}` +
          (partner && b !== null
            ? `   vs  ${partner.id.padEnd(20)} ${b.win.toFixed(0).padStart(3)}% ${comp(b)}` +
              (Math.abs(a.win - b.win) > 25 ? '   ← one-sided' : '')
            : '   (unpaired)'),
      );
    }
    console.log(
      `\n[KEYSTONE PROBE — SKILLTREE.md Part F.3]  maps ${hardMaps.join(' + ')} × all bots × all seeds\n` +
        lines.join('\n') +
        '\n  Accept: no pair more than ~25pp apart. A one-sided pair is a fork with\n' +
        '  only one prong, which costs a choice and gains nothing.',
    );
  });
});
