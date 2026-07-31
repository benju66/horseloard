import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/loader';

/**
 * The substrate rule, enforced (CLAUDE.md #1): `/src/engine` never names
 * specific game content. Engines consume schemas; all balance and content
 * lives in `/src/data/*.json`. Adding tower #5 must be a JSON entry plus
 * assets — zero engine changes.
 *
 * That rule has held by vigilance alone since M0. Vigilance is exactly what
 * erodes at the end of a long session, and the failure is silent: the game
 * still runs, the substrate promise just quietly stops being true. So it
 * gets the same treatment as the dead-plot bug class — a guard, forever.
 *
 * Test files are exempt: tests SHOULD name content, that's what they test.
 */

/**
 * Test scaffolding that lives outside a `.test.ts` name. Exempt for the same
 * reason tests are — these build synthetic content on purpose. Keep this
 * list tiny; every entry is a file the guard stops protecting.
 */
const TEST_SUPPORT = new Set(['./testFixtures.ts']);

/** Every engine source file, read as text by Vite — no node types needed. */
const ENGINE_SOURCES = import.meta.glob('./**/*.ts', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

/**
 * Words the engine is allowed to say because they are its own vocabulary —
 * schema enums, not content. Kept explicit so that adding one is a decision.
 *
 * KNOWN HOLE: an ability id collides with an effect type ("charge"), so that
 * literal can't be policed here. If a future content id collides with an
 * engine enum, rename the content — the guard silently stops covering it.
 */
const ENGINE_VOCABULARY = new Set([
  // TargetingModeSchema
  'nearest',
  'first',
  'strongest',
  'none',
  // ProjectileSchema.behavior
  'ballistic',
  'instant',
  'aoe',
  'aura',
  // AbilitySchema.effect.type
  'aoe-damage',
  'tower-rate-buff',
  'charge',
  // EnemyState
  'walking',
  'to-slot',
  'at-slot',
  'looting',
  // SimPhase
  'build',
  'wave',
  'done',
  'defeat',
]);

/** Every quoted string literal on a line. */
function stringLiterals(line: string): string[] {
  const out: string[] = [];
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) out.push(m[2]!);
  return out;
}

describe('substrate rule', () => {
  const data = loadGameData();

  const contentIds = new Set<string>();
  const add = (id: string) => {
    if (!ENGINE_VOCABULARY.has(id)) contentIds.add(id);
  };

  for (const p of data.towers.projectiles) add(p.id);
  for (const t of data.towers.towers) {
    add(t.id);
    for (const b of t.branches) add(b.id);
  }
  for (const e of data.enemies.enemies) add(e.id);
  for (const a of data.abilities) add(a.id);
  for (const n of data.metaTree) add(n.id);
  for (const a of data.archetypes) add(a.id);
  for (const [mapId, map] of Object.entries(data.maps)) {
    add(mapId);
    for (const plot of map.plots) add(plot.id);
    for (const lane of map.lanes) add(lane.id);
  }

  it('knows what content looks like', () => {
    // A guard that policed nothing would pass forever and prove nothing.
    expect(contentIds.size).toBeGreaterThan(20);
  });

  it('no engine file names a tower, enemy, ability, map, plot or lane', () => {
    const violations: string[] = [];

    for (const [path, source] of Object.entries(ENGINE_SOURCES)) {
      if (path.includes('.test.') || TEST_SUPPORT.has(path)) continue; // tests SHOULD name content
      source.split(/\r?\n/).forEach((line: string, i: number) => {
        for (const literal of stringLiterals(line)) {
          if (contentIds.has(literal)) {
            violations.push(`src/engine/${path.replace('./', '')}:${i + 1} names content "${literal}"`);
          }
        }
      });
    }

    expect(
      violations,
      `The engine must consume schemas, never content (CLAUDE.md #1).\n` +
        `Move this into /src/data JSON and drive it from the config:\n  ` +
        violations.join('\n  '),
    ).toEqual([]);
  });
});
