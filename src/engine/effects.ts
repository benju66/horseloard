import type {
  Ability,
  Economy,
  Hero,
  MapDef,
  MetaEffect,
  TowersFile,
} from '../data/schemas';

export interface ModifiableData {
  hero: Hero;
  economy: Economy;
  towers: TowersFile;
  map: MapDef;
  /**
   * The ability roster is balance data like everything else here, because
   * ability upgrades are drafted (TRIANGLE.md §B.6). `AbilitySystem` holds these
   * objects by reference and reads `cooldown` and `effect` at cast time, so a
   * write here is live on the next cast.
   */
  abilities: Ability[];
}

const apply = (base: number, perRank: number, mode: 'add' | 'multiply', rank: number): number =>
  mode === 'add' ? base + perRank * rank : base * Math.pow(perRank, rank);

/**
 * Apply one stat effect to a balance-data bundle, mutating it in place.
 *
 * The single arithmetic for every effect in the game. It has had three callers
 * over the project's life — the meta tree, the in-run draft, and now the career
 * tree — and the reason it is shared has held through all of them: a node that
 * reads "+15% bow damage" must not quietly differ from another node that reads
 * the same, on any screen, ever.
 *
 * **Incremental application is exact, not an approximation.** Applying rank 1
 * repeatedly composes to applying rank N once, for both modes: `add` accumulates
 * `perRank` each time, and `multiply` accumulates `perRank^1` each time, which
 * is `perRank^N`. That is what lets the perk system hand out one stack at a time
 * mid-run while the meta tree applies all ranks at once before the sim exists.
 *
 * Returns the unlock ids rather than applying them, since an unlock is a
 * decision for a system rather than a number to mutate.
 */
export function applyEffectInPlace(
  data: ModifiableData,
  fx: MetaEffect,
  rank: number,
): {
  unlockAbilityId?: string;
  unlockTowerId?: string;
  rule?: string;
  scale?: { key: string; perUnit: number; max: number };
} {
  // Unlocks are decisions for a system, not numbers to mutate, so they are
  // returned rather than applied. All three are routed by the caller.
  if (fx.type === 'unlock-ability') return { unlockAbilityId: fx.abilityId };
  if (fx.type === 'unlock-tower') return { unlockTowerId: fx.towerId };
  // Rules are switches the systems read, not numbers to fold into a config, so
  // they are returned for the caller to route exactly as unlocks are.
  if (fx.type === 'rule') return { rule: fx.rule };
  // Scaling is evaluated live against the board, so like a rule it is routed
  // rather than folded into the data — there is no number here to multiply yet.
  if (fx.type === 'scaling') {
    return { scale: { key: fx.scale, perUnit: fx.perUnit * rank, max: fx.max } };
  }

  if (fx.type === 'hero-stat') {
    const h = data.hero;
    if (fx.stat === 'moveSpeed') h.moveSpeed = apply(h.moveSpeed, fx.perRank, fx.mode, rank);
    else if (fx.stat === 'staggerImmunity') h.stagger.immunityAfter = apply(h.stagger.immunityAfter, fx.perRank, fx.mode, rank);
    else if (fx.stat === 'bowCritChance') h.crit.chance = Math.min(1, apply(h.crit.chance, fx.perRank, fx.mode, rank));
    else if (fx.stat === 'bowCritMultiplier') h.crit.multiplier = Math.max(h.crit.multiplier, apply(h.crit.multiplier, fx.perRank, fx.mode, rank));
    else if (fx.stat === 'bowDamageVsHindered') h.damageVsHindered = apply(h.damageVsHindered, fx.perRank, fx.mode, rank);
    else if (fx.stat === 'trampleDamage') h.trample.damage = apply(h.trample.damage, fx.perRank, fx.mode, rank);
    else if (fx.stat === 'staggerResist') {
      // resist shrinks the shove and the control loss
      h.stagger.shoveDistance = h.stagger.shoveDistance / Math.pow(fx.perRank, rank);
      h.stagger.controlLossDuration = h.stagger.controlLossDuration / Math.pow(fx.perRank, rank);
    } else {
      for (const level of h.bow.levels) {
        if (fx.stat === 'bowDamage') level.damage = apply(level.damage, fx.perRank, fx.mode, rank);
        else if (fx.stat === 'bowRange') level.range = apply(level.range, fx.perRank, fx.mode, rank);
        else if (fx.stat === 'bowFireRate') level.fireInterval = level.fireInterval / Math.pow(fx.perRank, rank);
      }
    }
  } else if (fx.type === 'kingdom-stat') {
    const eco = data.economy;
    if (fx.stat === 'startingGold') eco.startingGold = Math.round(apply(eco.startingGold, fx.perRank, fx.mode, rank));
    else if (fx.stat === 'gateMaxHp') data.map.gate.hp = Math.round(apply(data.map.gate.hp, fx.perRank, fx.mode, rank));
    else if (fx.stat === 'repairCost') eco.repair.costPerHp = apply(eco.repair.costPerHp, fx.perRank, fx.mode, rank);
    else if (fx.stat === 'coinMagnetRadius') eco.coins.magnetRadius = apply(eco.coins.magnetRadius, fx.perRank, fx.mode, rank);
    else if (fx.stat === 'coinExpiryTime') eco.coins.expirySeconds = apply(eco.coins.expirySeconds, fx.perRank, fx.mode, rank);
    else if (fx.stat === 'waveClearBonus') {
      // Both halves together — the muster payment is one idea to a player, and
      // scaling only the flat part would quietly stop mattering by wave 10.
      eco.waveClearBonus.base = Math.max(0, Math.round(apply(eco.waveClearBonus.base, fx.perRank, fx.mode, rank)));
      eco.waveClearBonus.perWave = Math.max(0, apply(eco.waveClearBonus.perWave, fx.perRank, fx.mode, rank));
    }
    // wavePreviewDetail: UI concern, not a sim number — handled by scenes when the preview lands
  } else if (fx.type === 'tower-stat') {
    for (const tower of data.towers.towers) {
      if (fx.towerId !== null && tower.id !== fx.towerId) continue;
      const stats = [...tower.levels, ...tower.branches.map((b) => b.stats)];
      for (const st of stats) {
        if (fx.stat === 'damage') st.damage = apply(st.damage, fx.perRank, fx.mode, rank);
        else if (fx.stat === 'range') st.range = apply(st.range, fx.perRank, fx.mode, rank);
        else if (fx.stat === 'fireRate') st.fireInterval = st.fireInterval / Math.pow(fx.perRank, rank);
      }
      if (fx.stat === 'cost') {
        for (const level of tower.levels) level.cost = Math.max(1, Math.round(apply(level.cost, fx.perRank, fx.mode, rank)));
        for (const b of tower.branches) b.cost = Math.max(1, Math.round(apply(b.cost, fx.perRank, fx.mode, rank)));
      }
    }
  } else if (fx.type === 'ability-stat') {
    for (const ability of data.abilities) {
      if (fx.abilityId !== null && ability.id !== fx.abilityId) continue;
      if (fx.stat === 'cooldown') {
        // Floored rather than allowed to reach zero: a burst pillar with no
        // cooldown is a sustain pillar, which is the exact failure this whole
        // milestone exists to undo (TRIANGLE.md §B.3).
        ability.cooldown = Math.max(1, apply(ability.cooldown, fx.perRank, fx.mode, rank));
        continue;
      }
      // Effect fields are per-variant. `loader.ts` has already rejected a perk
      // naming a stat its target ability does not carry, so a miss here can
      // only be the `abilityId: null` case sweeping past an ability that
      // legitimately has no such number.
      const e = ability.effect as Record<string, unknown>;
      const current = e[fx.stat];
      if (typeof current === 'number') e[fx.stat] = apply(current, fx.perRank, fx.mode, rank);
    }
  } else if (fx.type === 'tower-grant') {
    for (const tower of data.towers.towers) {
      if (fx.towerId !== null && tower.id !== fx.towerId) continue;
      // Branch stats are alternative end-states of the same tower, so a grant
      // has to reach them too or the perk silently stops working the moment a
      // player branches.
      const stats = [...tower.levels, ...tower.branches.map((b) => b.stats)];
      for (const st of stats) {
        const g = fx.grant;
        if (g.kind === 'crit') {
          // Chance accumulates and caps; multiplier takes the better of the
          // two rather than compounding, so stacking grants cannot run away.
          const chance = Math.min(1, (st.crit?.chance ?? 0) + g.chance * rank);
          st.crit = { chance, multiplier: Math.max(st.crit?.multiplier ?? 1, g.multiplier) };
        } else if (g.kind === 'aura') {
          st.towerAura = {
            radius: Math.max(st.towerAura?.radius ?? 0, g.radius),
            // Aura multipliers compose, because two beacons should stack.
            damageMultiplier: (st.towerAura?.damageMultiplier ?? 1) * Math.pow(g.damageMultiplier, rank),
          };
        } else if (g.kind === 'income') {
          // Income: more coins per drop, never a faster drop, so granting it
          // broadly cannot outpace the coin pool or the sweep.
          st.income = {
            value: (st.income?.value ?? 0) + g.value * rank,
            interval: st.income?.interval ?? g.interval,
          };
        } else if (st.garrison) {
          // Scales an existing garrison, never creates one. A card that turned
          // an archer tower into a barracks would hand the army pillar out for
          // free, and it is supposed to cost a plot.
          st.garrison = {
            ...st.garrison,
            squad: st.garrison.squad + g.squad * rank,
            hp: st.garrison.hp * Math.pow(g.hpMultiplier, rank),
            damage: st.garrison.damage * Math.pow(g.damageMultiplier, rank),
            respawn: st.garrison.respawn * Math.pow(g.respawnMultiplier, rank),
            engageRadius: st.garrison.engageRadius * Math.pow(g.engageRadiusMultiplier, rank),
          };
        }
      }
    }
  }
  return {};
}
