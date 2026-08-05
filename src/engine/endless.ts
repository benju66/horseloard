import type { EnemiesFile, MapDef, Wave } from '../data/schemas';

/**
 * Endless mode: procedurally escalating waves on the same schema authored
 * waves use (DESIGN §3). Budget-based composition — weights shift toward
 * heavies as n climbs; HP scales without limit. Boss-trait and looter
 * enemies are excluded (looters by design pressure only in campaign for
 * now; the Warlord is a campaign event).
 */
export function generateEndlessWave(
  n: number,
  enemies: EnemiesFile,
  map: MapDef,
  rng: () => number,
): Wave {
  // The biome pool binds generated waves exactly as it binds authored ones —
  // the loader cannot check what does not exist yet, so the generator checks
  // itself. Fixture maps without a resolved pool keep the whole roster.
  const pool = (map as { pool?: readonly string[] }).pool;
  const roster = enemies.enemies.filter(
    (e) => !e.warCry && !e.lootsCoins && (!pool || pool.length === 0 || pool.includes(e.id)),
  );
  const lanes = map.lanes.map((l) => l.id);
  const budget = 24 + n * 9;
  // Linear escalation never catches a competent board — measured, the green
  // pool's endless ran to a median of wave 39 against a 12-28 band. The
  // quadratic term leaves the early milestones alone (+0.8 at w10) and
  // closes the deep tail (+12 at w39): the run ends because the WORLD ends
  // it, not because attention lapsed.
  const hpMultiplier = Math.round((1 + n * 0.14 + 0.008 * n * n) * 100) / 100;

  // weight: cheap fodder early, heavies scale in
  const weight = (cost: number) => {
    const heaviness = cost / 15; // rough: coinValue tracks toughness
    return 1 + Math.max(0, heaviness * (n / 8 - 0.4));
  };

  const entries: Wave['entries'] = [];
  let remaining = budget;
  let delay = 0;
  let guard = 12;
  while (remaining > 4 && guard-- > 0) {
    const weights = roster.map((e) => weight(e.coinValue));
    let pick = rng() * weights.reduce((a, b) => a + b, 0);
    let chosen = roster[0]!;
    for (let i = 0; i < roster.length; i++) {
      pick -= weights[i]!;
      if (pick <= 0) {
        chosen = roster[i]!;
        break;
      }
    }
    const unitCost = Math.max(2, chosen.coinValue);
    const count = Math.max(1, Math.min(10, Math.floor((remaining * (0.35 + rng() * 0.4)) / unitCost)));
    entries.push({
      enemyId: chosen.id,
      count,
      spacing: Math.max(0.15, 1.1 - n * 0.04 - rng() * 0.3),
      laneId: lanes[Math.floor(rng() * lanes.length)]!,
      delay: Math.round(delay * 10) / 10,
    });
    remaining -= count * unitCost;
    delay += 1.5 + rng() * 2.5;
  }
  if (entries.length === 0) {
    entries.push({ enemyId: roster[0]!.id, count: 3, spacing: 1, laneId: lanes[0]!, delay: 0 });
  }
  return { entries, hpMultiplier };
}
