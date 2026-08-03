# BIOMES.md — the campaign, restructured

**Status: design, not yet built. Authoritative for M8 once approved.**
Supersedes DESIGN.md's flat map list. TRIANGLE.md still governs balance; SKILLTREE.md still
governs progression.

---

## Part A — The decision, and what it is actually for

**Three biomes of four levels each, replacing four standalone maps.**

The reason is not "more content". It is this:

> The tree has six paths. The campaign has four maps that all ask the same question.

Every map today is one or two lanes, six to eight plots, the same eleven enemies, differing
only in density and an HP multiplier. So there is one correct build, and the six paths we just
spent a milestone making distinct have nowhere to express themselves. The build-diversity probe
says exactly this: median 26%, spread 1–75%. Most builds fail — not because they are bad, but
because the maps only reward one answer.

**Biomes are the payoff for the tree, not a feature beside it.** Six paths become six
playstyles only where different ones are correct.

### A.1 What this costs

Twelve maps instead of four, and the honest risk is that eight of them are the same map at
higher HP. That failure is the whole reason this document exists before any code.

**The rule: a biome changes a rule, a level changes a question.** If a proposed level can be
described as "like the last one but harder", it does not ship. Difficulty is an axis, never a
design.

---

## Part B — What a biome is

Four things, and all four are required:

| | |
|---|---|
| **A palette** | lighting preset, ground and path tint, fog. Already the cheapest lever in the renderer (DESIGN §10), and already per-map data. |
| **An enemy pool** | the subset of the roster this biome draws from, plus one or two natives |
| **One terrain rule** | a rule that changes how the whole biome plays — the same shape as a tree rule, and the part that makes it a biome rather than a skin |
| **A difficulty band** | win-rate target for the biome, rising across its levels |

A biome missing the terrain rule is a reskin. That is the test.

### B.1 The roster already clusters into three

Read the eleven enemies by what they punish, and the biomes fall out:

| enemies | what they punish | what answers them |
|---|---|---|
| swarm · runner · looter | **rate** — more bodies than you have shots | towers, AoE, The Wall |
| brute · shieldbearer · halberdier | **the army** — `antiInfantry` shreds soldiers, armour blunts towers | armour-strip, burst, The Storm and The Hunt |
| wolf-rider · raven · outrider | **the line** — `flying` and `blockImmune` walk straight past a blocker | coverage, mobility, The Ride |

`grunt` is the connective tissue and appears everywhere. `warlord` is a finale, not a biome
native.

This is the argument in one line: **a Host build that dominates biome 1 gets dismantled by
biome 2's halberdiers.** That is the tree paying off, and it is impossible on today's campaign.

---

## Part C — The three biomes

### C.1 The Green Road — *rate*

Rolling farmland, warm and open. The teaching biome.

- **Pool:** grunt, swarm, runner, looter
- **Terrain rule:** none. **Deliberate** — the first biome has to be the control, the place a
  player learns what normal is. A rule here would teach the exception before the rule.
- **Band:** 90–100% → 70–90% across four levels
- **Absorbs:** meadow-road (level 1), the-ford (level 2)

### C.2 The Iron Deeps — *armour*

Quarry cuts and pit-heads. Tight sightlines, cold light, dust.

- **Pool:** grunt, brute, shieldbearer, halberdier, + one native
- **Terrain rule:** `narrow-cuts` — **tower range −18%**. The walls are close. Coverage stops
  being free, and the plots you pick matter more than how many you own.
- **Why it works:** halberdiers punish garrisons and armour blunts raw tower damage, so the
  biome specifically asks for The Storm's armour-strip or The Hunt's crit. A pure Host build
  should struggle here and that is correct.
- **Band:** 55–75%

### C.3 The Long Steppe — *speed*

Open grass to the horizon, high wind, long shadows.

- **Pool:** grunt, wolf-rider, raven, outrider, + one native
- **Terrain rule:** `open-country` — **enemy speed +12%, tower range +10%**. Long sightlines
  both ways. Blockers matter less because half the pool ignores them; being in the right place
  matters more.
- **Why it works:** `flying` and `blockImmune` make the army pillar nearly useless, which is
  the sharpest possible argument for having built a *career* rather than a single build.
- **Band:** 30–55%, finale absorbs warlords-march

### C.4 Terrain rules are engine work, and small

They are the same shape as `RuleKeySchema` — a closed enum the sim reads, named per map rather
than per build. Two to start; a third biome later is a JSON entry plus one `if`.

```
narrow-cuts    tower range ×0.82
open-country   enemy speed ×1.12, tower range ×1.10
```

**Not** stackable, **not** parameterised per level. A biome has exactly one, and every level in
it plays under the same one — that is what makes it a *place* rather than a modifier.

---

## Part D — Levels inside a biome

Four each. The biome sets the rule; the levels ask different questions under it.

| level | job |
|---|---|
| 1 | introduce the biome's rule and its pool, gently |
| 2 | a geometry question — a second lane, a long flank, a plot-poor board |
| 3 | a composition question — the pool at a mix that punishes one build |
| 4 | a setpiece — a named wave, a boss, or a rule pushed to its limit |

**The guard, again:** if level 3 is level 2 with more HP, cut it and ship three.

---

## Part E — Campaign flow

- Biomes unlock in order; a biome opens when its predecessor's **level 3** is cleared, not its
  level 4. The setpiece should be something you can come back for rather than a wall.
- Levels inside a biome unlock linearly, as today.
- Stars stay per level, so the tree's three-star bonus scales with the campaign rather than
  needing its own rule.
- **Equip slots** still grow with the campaign (2 / 3 / 4). With twelve levels the natural
  milestones are the biome boundaries — a slot per biome entered.

---

## Part F — Data shape

Maps and waves stay pure JSON (CLAUDE.md #1); the biome is a new file that groups them.

```
/src/data/biomes.json          id, name, palette, pool, terrainRule, order
/src/data/maps/<biome>/*.json  unchanged shape, plus `biomeId`
/src/data/waves/<biome>/*.json unchanged
```

- `MapDef.lighting` moves to the biome and is inherited, with per-map override kept — the
  palette is what makes a biome read as a place, and repeating it twelve times invites drift.
- Load-time checks: every map names a known biome; every wave entry draws from that biome's
  pool (**a wave summoning an enemy outside its own biome is a boot failure**, or the pools
  are decoration); every biome has at least one level.

---

## Part G — How this gets measured

The existing probes still run. Two change and one is new:

1. **Difficulty curve** becomes per-biome bands rather than per-map, since the point of a biome
   is that its levels share a character.
2. **Build diversity** runs *per biome*. This is the measurement the whole document exists for:
   **the path that carries should differ between biomes.** If Ride carries all three, the
   biomes are palettes.
3. **New — pillar-by-biome.** Towers-only, army-only and hero-only against each biome. The
   Iron Deeps should be brutal for army-only; the Long Steppe should be near-impossible for it.
   If those read the same, the pools are not doing their job.

**Accept:** no single path is in the top third of builds in all three biomes.

---

## Part H — Build order

| step | work |
|---|---|
| **M8.1** | `biomes.json` + schema, lighting inheritance, load-time pool checks. No new maps. |
| **M8.2** | Regroup the four existing maps into biomes 1 and 3. Campaign still playable throughout. |
| **M8.3** | Terrain rules: `narrow-cuts`, `open-country`. Tested like the tree rules. |
| **M8.4** | Probes: per-biome diversity, pillar-by-biome. **Measure before authoring content.** |
| **M8.5** | Author the missing levels — 8 maps + wave sets. |
| **M8.6** | Two biome natives + a finale. Placeholder geometry is a valid state. |
| **M8.7** | Tune, once, per biome band. This is where M7.3 finally happens. |

M8.4 sits before M8.5 on purpose. The last milestone taught this twice: measuring with an
instrument that cannot exercise its subject is worse than not measuring, and authoring eight
maps before the probe exists means authoring them blind.

---

## Part I — Open questions

1. **Do biome natives earn their cost?** Two new enemies is art, tuning and a wave-table
   rewrite. The roster may already be enough, and "reuse with a different mix" is the cheaper
   experiment — run M8.4 on the existing eleven before committing.
2. **Is `narrow-cuts` too blunt?** A flat −18% tower range punishes The Wall everywhere in the
   biome rather than asking a question. A per-map plot layout might do the same job with no
   engine work at all. Worth testing the cheap version first.
3. **Twelve levels against a 150-run career** is still roughly twelve runs of novelty and 138
   of repetition. Biomes improve the *shape* of the campaign; they do not by themselves solve
   the long game. Endless mode and the tree carry that, and whether that is enough is the
   question after this one.
