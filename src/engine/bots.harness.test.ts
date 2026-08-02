import { describe, it } from 'vitest';
import { loadGameData } from '../data/loader';
import { BOTS, forcedComposition, forcedPerk, runBot, type BotRunResult } from './bots';

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
 * `soloCarry` is the more interesting one: may a SINGLE tower type clear this
 * map on its own? Map 1 yes — a new player picking one tower and doing fine is
 * the point. By map 3 it should be no, because that is what makes composition a
 * decision rather than a preference. This is the dial that protects tower
 * balance while difficulty rises: raising enemy HP alone would just crown
 * whichever tower has the highest dps.
 */
export const DIFFICULTY_TARGETS: Record<
  string,
  { winRate: [number, number]; soloCarry: boolean; intent: string }
> = {
  'meadow-road': { winRate: [90, 100], soloCarry: true, intent: 'nearly unloseable — it teaches' },
  'the-ford': { winRate: [70, 95], soloCarry: true, intent: 'comfortable, but leaks punish' },
  'crossroads': { winRate: [45, 75], soloCarry: false, intent: 'composition starts to matter' },
  'warlords-march': { winRate: [25, 55], soloCarry: false, intent: 'honest challenge' },
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
  it('reports the difficulty curve against its target', () => {
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

      // Solo carry: does ANY single tower clear this map by itself?
      const carriers = data.towers.towers.filter((t) => {
        const solo = SEEDS.map((seed) => runBot(botData, mapId, forcedComposition(t.id), seed));
        return solo.every((r) => r.outcome === 'win');
      });
      const soloOk = target.soloCarry ? true : carriers.length === 0;

      if (!winOk || !soloOk) failures++;
      lines.push(
        `  ${mapId.padEnd(16)} win ${String(winRate).padStart(3)}% (want ${lo}-${hi}) ${winOk ? '✓' : '✗'}   ` +
          `solo-carriers ${carriers.length}${target.soloCarry ? ' (allowed)' : ` (want 0) ${soloOk ? '✓' : '✗'}`}` +
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
        '\n  A large positive Δ means drafting flattened the curve that was just tuned.',
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
