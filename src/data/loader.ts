import type { z } from 'zod';
import {
  AbilitiesFileSchema,
  ArchetypesFileSchema,
  EconomySchema,
  EnemiesFileSchema,
  HeroSchema,
  MapSchema,
  ModelsFileSchema,
  SkillTreeFileSchema,
  TowersFileSchema,
  WaveSetSchema,
  type AbilitiesFile,
  type ArchetypesFile,
  type Economy,
  type EnemiesFile,
  type Hero,
  type Biome,
  BiomesFileSchema,
  type ResolvedMapDef,
  type ModelsFile,
  type SkillTreeFile,
  type TowersFile,
  type WaveSet,
} from './schemas';

import towersJson from './towers.json';
import enemiesJson from './enemies.json';
import abilitiesJson from './abilities.json';
import heroJson from './hero.json';
import economyJson from './economy.json';
import archetypesJson from './archetypes.json';
import modelsJson from './models.json';
import skillTreeJson from './skilltree.json';
import biomesJson from './biomes.json';
import meadowRoadMapJson from './maps/meadow-road.json';
import meadowRoadWavesJson from './waves/meadow-road.json';
import theFordMapJson from './maps/the-ford.json';
import theFordWavesJson from './waves/the-ford.json';
import crossroadsMapJson from './maps/crossroads.json';
import crossroadsWavesJson from './waves/crossroads.json';
import warlordsMarchMapJson from './maps/warlords-march.json';
import warlordsMarchWavesJson from './waves/warlords-march.json';

/** Everything the game needs, validated. Engines receive slices of this — they never import JSON. */
export interface GameData {
  towers: TowersFile;
  enemies: EnemiesFile;
  abilities: AbilitiesFile['abilities'];
  /** How many abilities the hero may carry at once — the burst-pillar cap (DESIGN §4). */
  equipSlots: number;
  equipSlotGrants: readonly number[];
  hero: Hero;
  economy: Economy;
  archetypes: ArchetypesFile['archetypes'];
  /** Render-layer manifest: logical states -> clips, and the variant roster. */
  models: ModelsFile['models'];
  /** The career tree — the only place a run's power is decided (SKILLTREE.md). */
  skillTree: SkillTreeFile;
  /** keyed by map id */
  maps: Record<string, ResolvedMapDef>;
  biomes: Biome[];
  /** keyed by map id */
  waveSets: Record<string, WaveSet>;
}

export class DataValidationError extends Error {
  override name = 'DataValidationError';
}

function fail(lines: string[]): never {
  throw new DataValidationError(`Invalid game data\n${lines.map((l) => `  • ${l}`).join('\n')}`);
}

/** Parse one file against its schema; throw listing every issue as "<file> → <field.path>: <message>". */
function validateFile<S extends z.ZodType>(schema: S, raw: unknown, file: string): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    fail(
      result.error.issues.map(
        (issue) => `${file} → ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    );
  }
  return result.data;
}

/** Raw JSON keyed the way it sits on disk, so error messages point at real files. */
export interface RawGameData {
  towers: unknown;
  enemies: unknown;
  abilities: unknown;
  hero: unknown;
  economy: unknown;
  archetypes: unknown;
  models: unknown;
  skillTree: unknown;
  biomes: unknown;
  /** file path (for messages) → raw content */
  maps: Record<string, unknown>;
  /** file path (for messages) → raw content */
  waveSets: Record<string, unknown>;
}

/**
 * Validates every file against its schema, then cross-checks references
 * between files. Throws DataValidationError with file + field path on any
 * problem — this runs at boot and must fail loud (CLAUDE.md #3).
 */
export function validateGameData(raw: RawGameData): GameData {
  const towers = validateFile(TowersFileSchema, raw.towers, 'towers.json');
  const enemies = validateFile(EnemiesFileSchema, raw.enemies, 'enemies.json');
  const abilitiesFile = validateFile(AbilitiesFileSchema, raw.abilities, 'abilities.json');
  const hero = validateFile(HeroSchema, raw.hero, 'hero.json');
  const economy = validateFile(EconomySchema, raw.economy, 'economy.json');
  const archetypesFile = validateFile(ArchetypesFileSchema, raw.archetypes, 'archetypes.json');
  const modelsFile = validateFile(ModelsFileSchema, raw.models, 'models.json');
  const skillTree = validateFile(SkillTreeFileSchema, raw.skillTree, 'skilltree.json');
  const biomesFile = validateFile(BiomesFileSchema, raw.biomes, 'biomes.json');
  const biomes = new Map(biomesFile.biomes.map((b) => [b.id, b]));

  const maps: Record<string, ResolvedMapDef> = {};
  for (const [file, content] of Object.entries(raw.maps)) {
    const map = validateFile(MapSchema, content, file);
    if (maps[map.id]) fail([`${file} → id: duplicate map id "${map.id}"`]);
    const biome = biomes.get(map.biomeId);
    if (!biome) {
      fail([
        `${file} → biomeId: unknown biome "${map.biomeId}" ` +
          `(known: ${[...biomes.keys()].join(', ')})`,
      ]);
    }
    // The palette is resolved exactly once, here. Everything downstream sees a
    // map that has one, so no renderer call site carries a fallback that could
    // differ from the biome's.
    maps[map.id] = { ...map, lighting: map.lighting ?? biome.lighting };
  }

  const waveSets: Record<string, WaveSet> = {};
  const errors: string[] = [];
  const enemyIds = new Set(enemies.enemies.map((e) => e.id));
  const towerIds = new Set(towers.towers.map((t) => t.id));
  const abilityIds = new Set(abilitiesFile.abilities.map((a) => a.id));

  /**
   * Which `ability-stat` keys a given ability actually carries. `cooldown` is
   * on every ability; the rest live on the effect variant, so Volley has a
   * radius and Heavy Shaft does not.
   *
   * Needed because an upgrade card naming a stat its target lacks would
   * validate, be drafted, and change nothing — reading as a weak perk rather
   * than a broken one, which is the failure mode this whole block exists to
   * prevent.
   */
  const abilityStats = new Map<string, Set<string>>();
  for (const a of abilitiesFile.abilities) {
    const stats = new Set<string>(['cooldown']);
    for (const [k, v] of Object.entries(a.effect)) {
      if (k !== 'type' && typeof v === 'number') stats.add(k);
    }
    abilityStats.set(a.id, stats);
  }
  /** Empty when the stat is on no ability at all — the `abilityId: null` failure. */
  const abilitiesWithStat = (stat: string): string[] =>
    [...abilityStats].filter(([, s]) => s.has(stat)).map(([id]) => id);

  const checkAbilityStat = (
    file: string,
    path: string,
    abilityId: string | null,
    stat: string,
  ): void => {
    if (abilityId === null) {
      if (abilitiesWithStat(stat).length === 0) {
        errors.push(`${file} → ${path}.stat: no ability has a "${stat}" — this effect is dead`);
      }
      return;
    }
    const stats = abilityStats.get(abilityId);
    if (!stats) {
      errors.push(
        `${file} → ${path}.abilityId: unknown ability "${abilityId}" (known: ${[...abilityIds].join(', ')})`,
      );
    } else if (!stats.has(stat)) {
      errors.push(
        `${file} → ${path}.stat: ability "${abilityId}" has no "${stat}" (has: ${[...stats].join(', ')})`,
      );
    }
  };

  for (const [file, content] of Object.entries(raw.waveSets)) {
    const waveSet = validateFile(WaveSetSchema, content, file);
    const map = maps[waveSet.mapId];
    if (!map) {
      errors.push(
        `${file} → mapId: unknown map "${waveSet.mapId}" (known: ${Object.keys(maps).join(', ')})`,
      );
      continue;
    }
    if (waveSets[waveSet.mapId]) {
      errors.push(`${file} → mapId: map "${waveSet.mapId}" already has a wave set`);
      continue;
    }
    waveSets[waveSet.mapId] = waveSet;

    const laneIds = new Set(map.lanes.map((l) => l.id));
    const archetypeIds = new Set(archetypesFile.archetypes.map((a) => a.id));
    waveSet.waves.forEach((wave, w) => {
      if (wave.archetypeId !== undefined && !archetypeIds.has(wave.archetypeId)) {
        errors.push(
          `${file} → waves.${w}.archetypeId: unknown archetype "${wave.archetypeId}" (known: ${[...archetypeIds].join(', ')})`,
        );
      }
      wave.entries.forEach((entry, e) => {
        if (!enemyIds.has(entry.enemyId)) {
          errors.push(
            `${file} → waves.${w}.entries.${e}.enemyId: unknown enemy "${entry.enemyId}" (known: ${[...enemyIds].join(', ')})`,
          );
        }
        if (!laneIds.has(entry.laneId)) {
          errors.push(
            `${file} → waves.${w}.entries.${e}.laneId: unknown lane "${entry.laneId}" on map "${map.id}" (known: ${[...laneIds].join(', ')})`,
          );
        }
      });
    });
  }

  for (const mapId of Object.keys(maps)) {
    if (!waveSets[mapId]) errors.push(`maps → ${mapId}: map has no wave set in waveSets`);
  }

  // Every wave draws from its own biome's pool. A boot failure rather than a
  // warning: a pool that data can quietly ignore is decoration, and the pool
  // probe (BIOMES.md Part L) showed it is the only part of a biome that
  // measurably changes which build wins.
  for (const [file, ws] of Object.entries(waveSets)) {
    const map = maps[ws.mapId];
    if (!map) continue;
    const biome = biomes.get(map.biomeId);
    if (!biome) continue;
    const pool = new Set(biome.pool);
    ws.waves.forEach((wave, w) => {
      wave.entries.forEach((entry, e) => {
        if (!pool.has(entry.enemyId)) {
          errors.push(
            `${file} → waves.${w}.entries.${e}.enemyId: "${entry.enemyId}" is not in ` +
              `biome "${biome.id}" (pool: ${biome.pool.join(', ')})`,
          );
        }
      });
    });
  }

  // Tree nodes are the only nodes now, and the effect vocabulary they use is
  // cross-file by nature — a stat key names an ability, a grant names a tower. A node aimed at a misspelled tower would validate,
  // sit in the tree, be bought, and do nothing — the worst kind of silent
  // failure, because it reads as the node being weak rather than broken.
  skillTree.nodes.forEach((node, i) => {
    node.effects.forEach((effect, j) => {
      const where = `skilltree.json → nodes.${i}.effects.${j}`;
      const towerScoped = effect.type === 'tower-stat' || effect.type === 'tower-grant';
      if (towerScoped && effect.towerId !== null && !towerIds.has(effect.towerId)) {
        errors.push(`${where}.towerId: unknown tower "${effect.towerId}"`);
      }
      if (effect.type === 'unlock-tower' && !towerIds.has(effect.towerId)) {
        errors.push(`${where}.towerId: unknown tower "${effect.towerId}"`);
      }
      if (effect.type === 'unlock-ability' && !abilityIds.has(effect.abilityId)) {
        errors.push(`${where}.abilityId: unknown ability "${effect.abilityId}"`);
      }
      if (effect.type === 'ability-stat') {
        checkAbilityStat('skilltree.json', `nodes.${i}.effects.${j}`, effect.abilityId, effect.stat);
      }
    });
  });

  // Every ability must be reachable from the tree, or it is content nobody can
  // ever equip. The old meta tree had this hole and it took a playtest to find:
  // the one ability a player actually had was the one they were told to cut.
  const treeUnlocks = new Set(
    skillTree.nodes.flatMap((n) =>
      n.effects.flatMap((e) => (e.type === 'unlock-ability' ? [e.abilityId] : [])),
    ),
  );
  abilitiesFile.abilities.forEach((a, i) => {
    if (!a.unlockedByDefault && !treeUnlocks.has(a.id)) {
      errors.push(
        `abilities.json → abilities.${i}.id: "${a.id}" is not unlocked by default and no tree node grants it`,
      );
    }
  });

  // Model refs are optional during the migration, but a ref that IS given must
  // resolve — a typo'd model would otherwise degrade silently to placeholder
  // geometry and look like an art gap rather than a bug.
  const modelIds = new Set(modelsFile.models.map((m) => m.id));
  const knownModels = () => [...modelIds].join(', ');
  enemies.enemies.forEach((enemy, i) => {
    if (enemy.model !== undefined && !modelIds.has(enemy.model)) {
      errors.push(
        `enemies.json → enemies.${i}.model: unknown model "${enemy.model}" (known: ${knownModels()})`,
      );
    }
  });
  towers.towers.forEach((tower, i) => {
    if (tower.model !== undefined && !modelIds.has(tower.model)) {
      errors.push(
        `towers.json → towers.${i}.model: unknown model "${tower.model}" (known: ${knownModels()})`,
      );
    }
  });

  if (errors.length > 0) fail(errors);

  return {
    towers,
    enemies,
    abilities: abilitiesFile.abilities,
    equipSlots: abilitiesFile.equipSlots,
    equipSlotGrants: abilitiesFile.equipSlotGrants,
    hero,
    economy,
    archetypes: archetypesFile.archetypes,
    models: modelsFile.models,
    skillTree,
    biomes: biomesFile.biomes,
    maps,
    waveSets,
  };
}

/** Load + validate the shipped game data. Called once at boot. */
export function loadGameData(): GameData {
  return validateGameData({
    towers: towersJson,
    enemies: enemiesJson,
    abilities: abilitiesJson,
    hero: heroJson,
    economy: economyJson,
    archetypes: archetypesJson,
    models: modelsJson,
    skillTree: skillTreeJson,
    biomes: biomesJson,
    maps: {
      'maps/meadow-road.json': meadowRoadMapJson,
      'maps/the-ford.json': theFordMapJson,
      'maps/crossroads.json': crossroadsMapJson,
      'maps/warlords-march.json': warlordsMarchMapJson,
    },
    waveSets: {
      'waves/meadow-road.json': meadowRoadWavesJson,
      'waves/the-ford.json': theFordWavesJson,
      'waves/crossroads.json': crossroadsWavesJson,
      'waves/warlords-march.json': warlordsMarchWavesJson,
    },
  });
}
