import { describe, it } from 'vitest';
import { loadGameData } from '../data/loader';
import { BOTS, forcedComposition, runBot, type BotRunResult } from './bots';

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
const SEEDS = [11, 23, 42, 57, 88];

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
  const botData = {
    towers: data.towers,
    enemies: data.enemies,
    abilities: data.abilities,
    hero: data.hero,
    economy: data.economy,
    maps: data.maps,
    waveSets: data.waveSets,
  };

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
});
