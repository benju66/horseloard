import type { z } from 'zod';
import {
  AbilitiesFileSchema,
  ArchetypesFileSchema,
  EconomySchema,
  EnemiesFileSchema,
  HeroSchema,
  MapSchema,
  MetaTreeFileSchema,
  TowersFileSchema,
  WaveSetSchema,
  type AbilitiesFile,
  type ArchetypesFile,
  type Economy,
  type EnemiesFile,
  type Hero,
  type MapDef,
  type MetaTreeFile,
  type TowersFile,
  type WaveSet,
} from './schemas';

import towersJson from './towers.json';
import enemiesJson from './enemies.json';
import abilitiesJson from './abilities.json';
import metatreeJson from './metatree.json';
import heroJson from './hero.json';
import economyJson from './economy.json';
import archetypesJson from './archetypes.json';
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
  metaTree: MetaTreeFile['nodes'];
  hero: Hero;
  economy: Economy;
  archetypes: ArchetypesFile['archetypes'];
  /** keyed by map id */
  maps: Record<string, MapDef>;
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
  metatree: unknown;
  hero: unknown;
  economy: unknown;
  archetypes: unknown;
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
  const metaTreeFile = validateFile(MetaTreeFileSchema, raw.metatree, 'metatree.json');
  const hero = validateFile(HeroSchema, raw.hero, 'hero.json');
  const economy = validateFile(EconomySchema, raw.economy, 'economy.json');
  const archetypesFile = validateFile(ArchetypesFileSchema, raw.archetypes, 'archetypes.json');

  const maps: Record<string, MapDef> = {};
  for (const [file, content] of Object.entries(raw.maps)) {
    const map = validateFile(MapSchema, content, file);
    if (maps[map.id]) fail([`${file} → id: duplicate map id "${map.id}"`]);
    maps[map.id] = map;
  }

  const waveSets: Record<string, WaveSet> = {};
  const errors: string[] = [];
  const enemyIds = new Set(enemies.enemies.map((e) => e.id));
  const towerIds = new Set(towers.towers.map((t) => t.id));
  const abilityIds = new Set(abilitiesFile.abilities.map((a) => a.id));

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

  metaTreeFile.nodes.forEach((node, i) => {
    const effect = node.effect;
    if (effect.type === 'unlock-ability' && !abilityIds.has(effect.abilityId)) {
      errors.push(
        `metatree.json → nodes.${i}.effect.abilityId: unknown ability "${effect.abilityId}" (known: ${[...abilityIds].join(', ')})`,
      );
    }
    if (effect.type === 'unlock-tower' && !towerIds.has(effect.towerId)) {
      errors.push(
        `metatree.json → nodes.${i}.effect.towerId: unknown tower "${effect.towerId}" (known: ${[...towerIds].join(', ')})`,
      );
    }
    if (effect.type === 'tower-stat' && effect.towerId !== null && !towerIds.has(effect.towerId)) {
      errors.push(
        `metatree.json → nodes.${i}.effect.towerId: unknown tower "${effect.towerId}" (known: ${[...towerIds].join(', ')})`,
      );
    }
  });

  if (errors.length > 0) fail(errors);

  return {
    towers,
    enemies,
    abilities: abilitiesFile.abilities,
    metaTree: metaTreeFile.nodes,
    hero,
    economy,
    archetypes: archetypesFile.archetypes,
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
    metatree: metatreeJson,
    hero: heroJson,
    economy: economyJson,
    archetypes: archetypesJson,
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
