import { describe, it } from 'vitest';
import { loadGameData } from '../data/loader';
import {
  BOTS,
  armyOnly,
  forcedComposition,
  forcedPerk,
  heroOnly,
  runBot,
  combatTowersOnly,
  towersAndArmy,
  towersOnly,
  withoutHeroDamage,
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
  'crossroads': { winRate: [45, 75], maxSinglePillarWinRate: 40, intent: 'one pillar is not enough' },
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

describe.runIf(import.meta.env.MODE === 'balance')('bot matrix', () => {
  const data = loadGameData();
  /**
   * The reference configuration is **drafting on**, because that is the shipped
   * game. It was off when the draft landed, which meant every headline number
   * here described a game nobody would play — and the difficulty targets below
   * were being compared against it.
   */
  const botData = {
    towers: data.towers,
    enemies: data.enemies,
    abilities: data.abilities,
    equipSlots: data.equipSlots,
    hero: data.hero,
    economy: data.economy,
    maps: data.maps,
    waveSets: data.waveSets,
    perks: data.perks,
  };
  /** Drafting off, kept only as the comparison arm of the draft-impact probe. */
  const noDraftData = { ...botData, perks: undefined };

  const all: BotRunResult[] = [];

  for (const mapId of Object.keys(data.maps)) {
    it(`plays ${mapId}`, () => {
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
  it('reports whether gold is actually scarce', () => {
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
  it('reports how many levels a run actually produces', () => {
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
  it('reports the difficulty curve against its target', { timeout: 60_000 }, () => {
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
  it('reports whether any single pillar can hold a map alone', { timeout: 120_000 }, () => {
    const lines: string[] = [];
    let failures = 0;

    const heroDisabled = { ...botData, hero: withoutHeroDamage(data.hero) };

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
  it('reports whether exposure actually multiplies rate', { timeout: 120_000 }, () => {
    const funded = {
      ...botData,
      hero: withoutHeroDamage(data.hero),
      economy: { ...data.economy, startingGold: 260 },
    };
    const lines: string[] = [];
    let complements = 0;
    for (const mapId of Object.keys(data.maps)) {
      const arms: Array<[string, BotRunResult[]]> = [
        ['towers only', SEEDS.map((s) => runBot(funded, mapId, combatTowersOnly, s))],
        ['towers+army', SEEDS.map((s) => runBot(funded, mapId, towersAndArmy, s))],
      ];
      const waveOf = (runs: BotRunResult[]) =>
        runs.reduce((s, r) => s + r.wavesCleared, 0) / runs.length;
      const winOf = (runs: BotRunResult[]) =>
        (runs.filter((r) => r.outcome === 'win').length / runs.length) * 100;
      const gain = waveOf(arms[1]![1]) - waveOf(arms[0]![1]);
      const winGain = winOf(arms[1]![1]) - winOf(arms[0]![1]);
      // Wins decide, waves break the tie. Waves alone reads a map where the
      // army converts near-misses into clears as a *regression*, because a run
      // that wins on wave 12 and one that dies on wave 12 score the same.
      const helps = winGain > 0 || (winGain === 0 && gain > 0);
      if (helps) complements++;
      const row = [`  ${mapId}${helps ? '' : '   ← army adds nothing here'}`];
      for (const [label, runs] of arms) {
        const win = Math.round((runs.filter((r) => r.outcome === 'win').length / runs.length) * 100);
        const towers = (runs.reduce((s, r) => s + r.towers.length, 0) / runs.length).toFixed(1);
        const kills = Math.round(runs.reduce((s, r) => s + r.kills, 0) / runs.length);
        row.push(
          `      ${label.padEnd(14)} win ${String(win).padStart(3)}%  ` +
            `waves ${waveOf(runs).toFixed(1).padStart(4)}/${runs[0]!.totalWaves}  ` +
            `towers ${towers.padStart(4)}  kills ${String(kills).padStart(3)}`,
        );
      }
      row.push(
        `      Δwin ${winGain >= 0 ? '+' : ''}${winGain.toFixed(0)}pp   ` +
          `Δwaves ${gain >= 0 ? '+' : ''}${gain.toFixed(1)}`,
      );
      lines.push(row.join('\n'));
    }
    console.log(
      `\n[COMPLEMENT PROBE — TRIANGLE.md §B.2]  army helps on ${complements}/${Object.keys(data.maps).length} maps\n` +
        lines.join('\n') +
        '\n  Funded equally on purpose — on the shipped economy neither arm survives to build.',
    );
  });

  /**
   * Can each tower carry a run on its own? This is the verdict that matters —
   * preference above only reports what the scoring function favours, so a tower
   * it never picks might be weak or might just be mis-scored. Forcing the build
   * removes the model from the question entirely.
   */
  it('reports whether each tower can carry a map alone', () => {
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
   * The in-run draft (DESIGN §15.1), measured rather than felt.
   *
   * Everything above measures the shipped game, drafting included. These two
   * probes isolate the draft's own contribution, and they are the whole reason
   * it was built on the injected rng.
   */
  it('reports what drafting does to the difficulty curve', { timeout: 60_000 }, () => {
    const lines: string[] = [];
    for (const mapId of Object.keys(data.maps)) {
      const off = BOTS.flatMap((f) => SEEDS.map((s) => runBot(noDraftData, mapId, f, s)));
      const on = BOTS.flatMap((f) => SEEDS.map((s) => runBot(botData, mapId, f, s)));
      const rate = (runs: BotRunResult[]) => (runs.filter((r) => r.outcome === 'win').length / runs.length) * 100;
      const delta = rate(on) - rate(off);
      const target = DIFFICULTY_TARGETS[mapId];
      const inBand = target ? rate(on) >= target.winRate[0] && rate(on) <= target.winRate[1] : true;
      lines.push(
        `  ${mapId.padEnd(16)} off ${pct(off.filter((r) => r.outcome === 'win').length, off.length)}  ` +
          `on ${pct(on.filter((r) => r.outcome === 'win').length, on.length)}  ` +
          `Δ ${(delta >= 0 ? '+' : '') + delta.toFixed(0)}pp` +
          (target && !inBand ? `   ← outside target ${target.winRate[0]}-${target.winRate[1]}%` : ''),
      );
    }
    console.log(
      '\n[draft impact — free-choice picks, all bots × all seeds]\n' +
        lines.join('\n') +
        '\n  Δ now measures the draft AND the abilities it unlocks — the off arm is a hero\n' +
        '  carrying only Charge, which is nobody\'s game. Read the on column, not Δ.',
    );
  });

  /**
   * Per-perk strength, forced. Free-choice picks cannot answer this — the
   * project already learned that for towers, and BACKLOG says so outright:
   * "the preference column is not evidence about tower strength". A perk that
   * shows up in winning runs might be strong, or might simply be dealt often.
   */
  it('reports whether any single perk swings the campaign', { timeout: 120_000 }, () => {
    const lines: string[] = [];
    // Maps 3-4 only: the easy maps win regardless, so a perk's effect is
    // invisible there. The interesting question is whether a perk rescues a map
    // that is supposed to be hard.
    const hardMaps = Object.keys(data.maps).filter(
      (m) => (DIFFICULTY_TARGETS[m]?.winRate[1] ?? 100) <= 75,
    );
    for (const perk of data.perks.perks) {
      const runs: BotRunResult[] = [];
      for (const mapId of hardMaps) {
        for (const f of BOTS) {
          for (const seed of SEEDS) runs.push(runBot(botData, mapId, forcedPerk(f, perk.id), seed));
        }
      }
      const wins = runs.filter((r) => r.outcome === 'win');
      lines.push(
        `  ${perk.id.padEnd(24)} win ${pct(wins.length, runs.length)}  ` +
          `waves ${(runs.reduce((s, r) => s + r.wavesCleared, 0) / runs.length).toFixed(1)}`,
      );
    }
    console.log(
      `\n[perk strength — forced pick, maps ${hardMaps.join(' + ')} × all bots × all seeds]\n` +
        lines.join('\n') +
        '\n  Compare against the draft-on row for these maps above. A perk well clear\n' +
        '  of the rest is carrying runs on its own.',
    );
  });
});
