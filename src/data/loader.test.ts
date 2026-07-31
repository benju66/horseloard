import { describe, expect, it } from 'vitest';
import { validateGameData, type RawGameData } from './loader';

import towersJson from './towers.json';
import enemiesJson from './enemies.json';
import abilitiesJson from './abilities.json';
import metatreeJson from './metatree.json';
import heroJson from './hero.json';
import economyJson from './economy.json';
import archetypesJson from './archetypes.json';
import modelsJson from './models.json';
import meadowRoadMapJson from './maps/meadow-road.json';
import meadowRoadWavesJson from './waves/meadow-road.json';
import theFordMapJson from './maps/the-ford.json';
import theFordWavesJson from './waves/the-ford.json';
import crossroadsMapJson from './maps/crossroads.json';
import crossroadsWavesJson from './waves/crossroads.json';
import warlordsMarchMapJson from './maps/warlords-march.json';
import warlordsMarchWavesJson from './waves/warlords-march.json';

/** Fresh deep-cloned seed data; tests mutate it freely. Typed loose on purpose. */
function seed(): RawGameData & Record<string, any> {
  return structuredClone({
    towers: towersJson,
    enemies: enemiesJson,
    abilities: abilitiesJson,
    metatree: metatreeJson,
    hero: heroJson,
    economy: economyJson,
    archetypes: archetypesJson,
    models: modelsJson,
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
  }) as RawGameData & Record<string, any>;
}

describe('seed data', () => {
  it('validates clean', () => {
    const data = validateGameData(seed());
    expect(data.towers.towers.map((t) => t.id)).toEqual(['archer', 'bombard', 'frost-spire', 'mill']);
    expect(data.enemies.enemies.map((e) => e.id)).toEqual(['grunt', 'runner', 'brute', 'shieldbearer', 'swarm', 'wolf-rider', 'looter', 'warlord']);
    expect(data.abilities.map((a) => a.id)).toEqual(['charge', 'volley', 'rally-horn']);
    expect(Object.keys(data.maps).sort()).toEqual(['crossroads', 'meadow-road', 'the-ford', 'warlords-march']);
    expect(data.waveSets['meadow-road']?.waves).toHaveLength(8);
    expect(data.waveSets['the-ford']?.waves).toHaveLength(10);
    expect(data.archetypes.map((a) => a.id)).toEqual(['horde', 'raid', 'war-party']);
    expect(data.metaTree.length).toBeGreaterThanOrEqual(9);
  });

  it('only charge is unlocked by default', () => {
    const data = validateGameData(seed());
    const unlocked = data.abilities.filter((a) => a.unlockedByDefault).map((a) => a.id);
    expect(unlocked).toEqual(['charge']);
  });

  it('wave hpMultiplier defaults to 1 when omitted', () => {
    const raw = seed();
    delete (raw.waveSets['waves/meadow-road.json'] as any).waves[0].hpMultiplier;
    const data = validateGameData(raw);
    expect(data.waveSets['meadow-road']?.waves[0]?.hpMultiplier).toBe(1);
  });
});

describe('schema validation fails loud with file + field path', () => {
  it('wrong type on a tower stat', () => {
    const raw = seed();
    (raw.towers as any).towers[0].levels[1].damage = 'lots';
    expect(() => validateGameData(raw)).toThrow('towers.json → towers.0.levels.1.damage');
  });

  it('negative enemy hp', () => {
    const raw = seed();
    (raw.enemies as any).enemies[0].hp = -5;
    expect(() => validateGameData(raw)).toThrow('enemies.json → enemies.0.hp');
  });

  it('elite chance outside 0..1', () => {
    const raw = seed();
    (raw.enemies as any).elite.chance = 12;
    expect(() => validateGameData(raw)).toThrow('enemies.json → elite.chance');
  });

  it('non-kebab-case id', () => {
    const raw = seed();
    (raw.enemies as any).enemies[0].id = 'Grunt';
    expect(() => validateGameData(raw)).toThrow('enemies.json → enemies.0.id');
  });

  it('duplicate enemy id', () => {
    const raw = seed();
    (raw.enemies as any).enemies[1].id = 'grunt';
    expect(() => validateGameData(raw)).toThrow('duplicate enemy id "grunt"');
  });

  it('branch pair must be exactly two', () => {
    const raw = seed();
    const archer = (raw.towers as any).towers[0];
    archer.branches.push({ ...archer.branches[0], id: 'archer-third' });
    expect(() => validateGameData(raw)).toThrow('towers.json → towers.0.branches');
  });

  it('unknown projectile ref on a tower', () => {
    const raw = seed();
    (raw.towers as any).towers[0].projectileId = 'bolt';
    expect(() => validateGameData(raw)).toThrow('unknown projectile "bolt"');
  });

  it('attacking tower with null projectile', () => {
    const raw = seed();
    (raw.towers as any).towers[0].projectileId = null;
    expect(() => validateGameData(raw)).toThrow('needs a projectileId');
  });

  it('unknown ability effect type', () => {
    const raw = seed();
    (raw.abilities as any).abilities[0].effect.type = 'nuke-everything';
    expect(() => validateGameData(raw)).toThrow('abilities.json → abilities.0.effect');
  });

  it('map with fewer than two waypoints on a lane', () => {
    const raw = seed();
    (raw.maps['maps/meadow-road.json'] as any).lanes[0].waypoints = [{ x: 0, y: 0 }];
    expect(() => validateGameData(raw)).toThrow('maps/meadow-road.json → lanes.0.waypoints');
  });

  it('hero bow level with negative cost', () => {
    const raw = seed();
    (raw.hero as any).bow.levels[1].cost = -30;
    expect(() => validateGameData(raw)).toThrow('hero.json → bow.levels.1.cost');
  });

  it('economy with non-integer starting gold', () => {
    const raw = seed();
    (raw.economy as any).startingGold = 45.5;
    expect(() => validateGameData(raw)).toThrow('economy.json → startingGold');
  });
});

describe('cross-file references', () => {
  it('wave entry with unknown enemy', () => {
    const raw = seed();
    (raw.waveSets['waves/meadow-road.json'] as any).waves[2].entries[0].enemyId = 'ogre';
    expect(() => validateGameData(raw)).toThrow(
      'waves/meadow-road.json → waves.2.entries.0.enemyId: unknown enemy "ogre"',
    );
  });

  it('wave entry with unknown lane', () => {
    const raw = seed();
    (raw.waveSets['waves/meadow-road.json'] as any).waves[0].entries[0].laneId = 'river';
    expect(() => validateGameData(raw)).toThrow(
      'waves/meadow-road.json → waves.0.entries.0.laneId: unknown lane "river"',
    );
  });

  it('wave set pointing at an unknown map', () => {
    const raw = seed();
    (raw.waveSets['waves/meadow-road.json'] as any).mapId = 'the-marsh';
    expect(() => validateGameData(raw)).toThrow('unknown map "the-marsh"');
  });

  it('wave with an unknown archetype banner', () => {
    const raw = seed();
    (raw.waveSets['waves/the-ford.json'] as any).waves[5].archetypeId = 'ambush';
    expect(() => validateGameData(raw)).toThrow(
      'waves/the-ford.json → waves.5.archetypeId: unknown archetype "ambush"',
    );
  });

  it('map without a wave set', () => {
    const raw = seed();
    delete raw.waveSets['waves/meadow-road.json'];
    expect(() => validateGameData(raw)).toThrow('map has no wave set');
  });

  it('meta node requiring a nonexistent node', () => {
    const raw = seed();
    (raw.metatree as any).nodes[0].requires = ['ghost-node'];
    expect(() => validateGameData(raw)).toThrow('unknown node id "ghost-node"');
  });

  it('unlock-ability pointing at an unknown ability', () => {
    const raw = seed();
    const node = (raw.metatree as any).nodes.find((n: any) => n.effect.type === 'unlock-ability');
    node.effect.abilityId = 'meteor';
    expect(() => validateGameData(raw)).toThrow('unknown ability "meteor"');
  });

  it('tower-stat node pointing at an unknown tower', () => {
    const raw = seed();
    const node = (raw.metatree as any).nodes.find((n: any) => n.effect.type === 'tower-stat');
    node.effect.towerId = 'tesla';
    expect(() => validateGameData(raw)).toThrow('unknown tower "tesla"');
  });

  it('enemy pointing at an unknown model', () => {
    const raw = seed();
    (raw.enemies as any).enemies[0].model = 'unit-griffin';
    expect(() => validateGameData(raw)).toThrow('unknown model "unit-griffin"');
  });

  it('tower pointing at an unknown model', () => {
    const raw = seed();
    (raw.towers as any).towers[0].model = 'build-tesla';
    expect(() => validateGameData(raw)).toThrow('unknown model "build-tesla"');
  });

  it('model deriving from a base that does not exist', () => {
    const raw = seed();
    (raw.models as any).models.push({ id: 'unit-ghost', base: 'base-phantom' });
    expect(() => validateGameData(raw)).toThrow('unknown base model "base-phantom"');
  });

  it('model base chain that cycles', () => {
    const raw = seed();
    const models = (raw.models as any).models;
    models.push({ id: 'loop-a', base: 'loop-b' }, { id: 'loop-b', base: 'loop-a' });
    expect(() => validateGameData(raw)).toThrow('base chain cycles');
  });

  it('a model may omit its glTF file — placeholder geometry is a valid state', () => {
    // The whole roster must be buildable before any asset is sourced; this is
    // the contract that makes "system first, models later" safe.
    const data = validateGameData(seed());
    expect(data.models.length).toBeGreaterThan(0);
    expect(data.models.every((m) => m.file === undefined)).toBe(true);
  });
});
