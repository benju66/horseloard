# BIOMES.md — the campaign, restructured

**Status: UNBLOCKED (2026-08-03). Part H may proceed.**
The thesis test failed on the original roster (**Part J**), and passes with the two
counter-enemies designed in **Part K** and shipped in M9 — see **Part L** for the numbers.
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

---

## Part J — The thesis test, and what it found (2026-08-03)

Run before authoring anything, exactly as Part G demanded. Twelve shared builds, one map,
reskinned per pool with wave shapes untouched and counts HP-normalised so **only the species
differ**.

```
                 cr      ho      hu      ri      st      wa     carries
green  89-100%   +10     +8      -10     -3      -3      -3     crown
iron   25-100%   +8      +0      +0      -5      -23     +20    wall
steppe  8- 58%   +5      +0      -5      -5      -23     +28    wall
```

**The thesis does not hold as specified.** Iron and Steppe — the two pools with real spread and
therefore the only two readable rows — return the same verdict and nearly the same signature:
build towers, and Storm is a trap. Green looks different but sits at 89–100%, where everything
wins and top-third-against-bottom-third is noise rather than signal.

### J.1 Why, and it is not about the pools

**The roster has no anti-tower pressure.** Armour, speed, `flying`, `blockImmune` — every trait
in the eleven is answered by *more towers*. The pools differ in flavour but not in what beats
them, so no arrangement of them can make a non-Wall build correct. Biomes built on this roster
would be palettes, which is precisely the failure Part A.1 set out to prevent and Part G was
written to catch.

This is the same shape as the finding that killed "no single tower carries" in M5: two things
that produce the same resource are substitutes forever. Here, every enemy asks the same question
of the player, so every answer is the same answer.

### J.2 What has to happen first

Biomes are still the right destination. The prerequisite is **enemies that punish specific
answers**, not just enemies with different numbers:

- something that **damages towers**, so a static line degrades and has to be repaired or moved
- something **immune to a damage shape** rather than to a blocker — splash-proof, or unhittable
  while moving — so one tower type stops being universal
- something that **outranges or bypasses** a tower line, making position rather than quantity
  the answer
- something that **punishes standing still**, which is the only pressure that makes the hero's
  mobility a requirement rather than a convenience

Two or three of those, and the pools become genuinely different questions. Then re-run this
probe; if the carrying path differs, Part H proceeds unchanged.

### J.3 What this cost, and what it saved

An hour of work, before eight hand-authored maps rather than after. **The probe did its job by
returning a negative** — which is the whole argument for building instruments before content.

---

## Part K — The counter-enemies

Design for the prerequisite J.2 names. **Not yet built.**

The finding to design against, stated precisely: *every trait in the roster is answered by more
towers*. Armour makes towers work harder; speed makes them work sooner; `flying` and
`blockImmune` route around the army but stay in tower range the whole way. So a counter-enemy
is not "a hard enemy" — it is **an enemy towers cannot answer by being more numerous.**

Four, and each names the tree answer it demands.

### K.1 The Sapper — punishes a static line

Slight, quick, carries a maul. Walks the lane and knocks a tower down a level as it passes.

- **Traits:** `towerBreak` (small radius, short cooldown), low HP, moderate speed, no armour
- **Engine work: none.** `towerBreak` is fully implemented in `towerSystem.ts` and is currently
  given to exactly one enemy — the warlord, which appears once at the end of a campaign. The
  anti-tower mechanic has been built the whole time and never deployed as a regular threat.
- **Punishes:** stacking towers and leaving them. A line with no answer degrades every wave.
- **Answers:** burst that kills it before it arrives — The Hunt, The Storm — or Frost holding
  it outside its own break radius.
- **Why it is not just "a threat":** killing it *late* is worthless. That is the property no
  amount of extra dps substitutes for.

### K.2 The Juggernaut — punishes towers *without* the other pillars

Vast, slow, and almost impervious while it has momentum.

- **Traits:** takes **80% less damage while moving freely**; normal damage while **slowed or
  blocked**. High HP, very slow, high siege dps.
- **Engine work: small.** `slowRemaining > 0 || state === 'blocked'` is already the "hindered"
  test used by `damageVsHindered` and `crit-vs-hindered`. This is one more read of it, inverted.
- **Punishes:** a pure tower board, absolutely. Rate alone cannot kill it.
- **Answers:** **The Host** (a soldier holding it) or **The Storm** (caltrops slowing it), and
  then anything. This is the one enemy that makes exposure *mandatory* rather than efficient.
- **This is the direct answer to Part J.** It is the first enemy in the roster whose counter is
  a pillar rather than a quantity, and it is the reason the pools would finally differ.

### K.3 The Stalker — punishes camping

Leaves the road and comes for you.

- **Traits:** ignores the lane and beelines for the hero; `staggersHero`; low siege dps (it is
  harassment, not a gate threat); modest HP.
- **Engine work: moderate.** A new movement mode, but `lootsCoins` is the template — an enemy
  that leaves the lane, seeks a target and behaves differently is already a shape the
  EnemySystem supports.
- **Punishes:** standing still, and a hero with no damage of their own.
- **Answers:** **The Ride** (outrun it, trample it) or hero burst. Towers only help if you fight
  where they are — which makes *where you stand* a decision rather than a habit.
- **Note on the invariant:** the hero cannot die, so the cost is control, not life. Repeated
  stagger while you are trying to be somewhere else is the price.

### K.4 The Warden — punishes thin, spread damage

Carries a standard. Everything near it is harder to kill.

- **Traits:** aura granting nearby enemies a damage reduction; no attack of its own; travels
  mid-pack
- **Engine work: moderate.** `warCry` is the exact template — a periodic radius effect on other
  enemies — and this is the defensive version of it.
- **Punishes:** damage spread evenly across a board, which is what a wide tower line produces.
- **Answers:** focus fire and burst — reach the Warden and kill *it*. Rewards The Hunt's
  single-target damage and any ability that can be aimed.

### K.5 What each one takes away

| | punishes | pillar it makes necessary |
|---|---|---|
| Sapper | leaving a line alone | burst, or control |
| **Juggernaut** | **towers without exposure** | **army or Storm** |
| Stalker | camping | hero, mobility |
| Warden | thin spread damage | focus, burst |

Together they mean a tower board is necessary and **never sufficient** — which is the triangle
invariant finally expressed in the *enemies* rather than only in the wave budget.

### K.6 Build order, and the gate

| step | work |
|---|---|
| **M9.1** | Sapper. Zero engine work — a JSON entry. Re-run the pool probe immediately. |
| **M9.2** | Juggernaut. One damage read. Re-run the probe. **This is the one that should move it.** |
| **M9.3** | Stalker and Warden, if 9.1 and 9.2 have not already separated the pools. |
| **M9.4** | Re-run the pool probe as the gate. **If the carrying path now differs between pools, BIOMES.md Part H is unblocked.** |

Cheapest first, and re-measured after each. If the Sapper and the Juggernaut alone separate the
pools, the Stalker and the Warden are content rather than prerequisites — and the moderate
engine work never has to happen.

**Open:** none of these need art to be tested. Placeholder geometry is a valid state
(`loader.test.ts` asserts it), so the probe can answer whether they work before a model exists.

---

## Part L — The gate, re-run (2026-08-03)

Same probe, same twelve shared builds, same map. The only change is that Iron and Steppe each
carry one counter-enemy.

```
                 cr      ho      hu      ri      st      wa     carries
green  89-100%   +10     +8      -10     -3      -3      -3     crown
iron    0- 42%   +10     +20     -3      -18     +8      -18    host        ← Juggernaut
steppe 25-100%   +3      +3      -3      +0      -20     +18    wall        ← Sapper
```

**Three pools, three carrying paths. The thesis holds.**

The decisive line is Iron. Before the Juggernaut it read `wall +20`; it now reads **`wall −18`,
`host +20`**. The same map, the same builds, the same wave shapes — and towers went from the
answer to a *liability*, with exposure becoming the thing that wins. That is precisely what K.2
predicted, in a form specific enough to have been wrong.

Steppe with the Sapper stays tower-led but sharply separates from Iron, and Green remains the
control.

### L.1 What this cost

Two enemies. **One of them was free** — `towerBreak` was already implemented and had been given
to a single boss. The other was one line in the damage path, reusing the `hindered` test that
`damageVsHindered` and `crit-vs-hindered` already share.

The Stalker and the Warden (K.3, K.4) are **not needed as prerequisites** and drop to content.
Their moderate engine work never has to happen.

### L.2 Caveats, unresolved

- **Green is still saturated** at 89–100%, where top-third-against-bottom-third is noise. Its
  `crown` reading is not evidence; it is the control's *spread* that matters, and that wants
  fixing in tuning rather than trusted here.
- **Iron at 0–42% is hard**, possibly too hard. That is a band question for M8.7, not a reason
  to soften the Juggernaut — the trait is doing its job and the wave budget is the dial.
- Twelve builds remains a small sample. The direction is decisive; the digits are not.

---

## Part M — M8.4: the biomes measured as built

Part L measured a *hypothesis* — three pools reskinned onto one map, HP-normalised, no terrain
rules. That was the right instrument for "could pools ever matter", and it said yes. M8.4 asks
the shipping question instead: **do the biomes as actually authored still make different builds
correct**, with their real maps, their real wave sets and their terrain rules folded in.

Two probes, both in `bots.harness.test.ts`, both run before M8.5 authors a single new map.

### M.1 Diversity — the thesis survives contact with real content

```
                                    cr    ho    hu    ri    st    wa    (pp heavier among winners)
  green-road   (control)    100-100%  +13   +7    +3   -10   +10   -23    unreadable (spread 0pp)
  iron-deeps   narrow-cuts    0- 42%  -13  +13   -10    -3    -3   +17    carries: wall
  long-steppe  open-country   0- 39%   +7  -10   +10   -13   +13    -7    carries: storm
```

Two readable rows, two distinct carrying paths. The thesis holds.

**The probe refuses to read Green, and that is the point.** Every sampled build clears it, so
there are no losers to compare winners against and the path deltas are noise wearing a number's
clothes — Green's `crown +13` means nothing whatsoever. This is the sixth time this project has
been bitten by an instrument that could not exercise its subject, and the first time the
instrument says so itself rather than printing a confident winner.

Iron carrying `wall` and Steppe carrying `storm` is not the Part L result (`host` and `wall`).
That is expected and not a contradiction: Part L held the map and terrain fixed and varied only
species, while this varies the whole place. What both agree on — the only claim either was built
to test — is that **the carrying path moves when the biome does**.

### M.2 The triangle, per biome — one half holds, one half does not

```
  green-road    towers 0%   army 0%   hero 50%    towers+gold 100%  pair 100%  all-three 100%
  iron-deeps    towers 0%   army 0%   hero  0%    towers+gold   0%  pair   0%  all-three  44%
  long-steppe   towers 0%   army 0%   hero  0%    towers+gold   0%  pair   0%  all-three   0%
```

**No single pillar clears any biome.** The first half of TRIANGLE.md's invariant holds
everywhere, comfortably, and the terrain rules did not break it in either direction.

The second half — *any two together must* — does not hold, and the failure is not subtle:

- **Iron needs all three.** Every two-pillar arm reads 0%; only the reference build clears, at
  44%. A map that demands the full triangle is not the invariant working, it is the invariant
  overshot: two pillars are supposed to be sufficient, not merely necessary.
- **Steppe is unwinnable.** 0% with all three. That is the difficulty curve, not the triangle.
- **The army leg buys nothing, anywhere.** Adding a barracks to a funded tower board is +0pp on
  Green (both pinned at the ceiling), **−17pp progress on Iron**, −2pp on Steppe.

### M.3 The army finding predates biomes

Worth stating plainly, because the temptation is to blame the new thing. Run on the pre-biome
tree (`dbaf0b6`), the per-map complement probe reports **"army helps on 0/4 maps"** — −8pp on
crossroads, −1.3 waves on warlords-march. Biomes did not break the army leg. They made it
*louder*, because a tower board against the Iron pool is stronger than it was against the old
mixed pool, so the plot a barracks costs is worth more.

The mechanism is visible in the composition breakdown the probe now prints. Both arms fill the
same eight plots; the pair arm simply spends four of them on `barracks` instead of `bombard`, and
kills fall from 89 to 69. **Plots are the scarce resource, not gold** — so for exposure to be
worth taking, one barracks must beat one combat tower on a shared board. It does not, by a wide
margin, and no amount of biome authoring will change that.

This is now the top open balance item. It is a TRIANGLE.md §B.2 failure, it is older than this
milestone, and authoring eight maps around a pillar that does not participate would bake it in.

### M.4 Two things that were checked and were not the cause

- **Rally geometry.** `narrow-cuts` shortens every sightline, and the design invariant defines
  the rally point *relative to the tower line* — so the rule was scaling tower range while
  leaving `rallyRange` fixed, posting soldiers outside the cover they exist to feed. The rule now
  scales both, which is what it always meant. Measured, it changes nothing: iron reads identically
  with and without. Kept because it is correct, not because it fixed anything.
- **Harness determinism.** One earlier reading of Iron's funded-towers arm said 83% where it now
  reproducibly says 0%. Every seed is fixed, `applyTo` and `applyTerrainRule` both clone, the
  pillar helpers are pure, and two back-to-back invocations are byte-identical — so the current
  numbers are the trustworthy ones and the outlier came from a tree state that could not be
  reconstructed. Recorded rather than quietly dropped: an 83pp swing nobody can explain is the
  kind of thing that should stay written down.

### M.5 What this changes about the plan

M8.5 (author eight maps) is **not** unblocked by this. The order changes:

| | |
|---|---|
| **M8.4.1** | Make the campaign winnable again. Steppe at 0% and Iron at 44% are off-band on every map the player can currently reach, and the game is deployed. |
| **M8.4.2** | Fix the army leg, or stop calling it a pillar. One barracks must beat one combat tower on a shared board. |
| **M8.5** | Then author the maps — against a triangle that closes. |
