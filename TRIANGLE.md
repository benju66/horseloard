# TRIANGLE.md — the three-pillar rebalance (M5)

**Status:** authoritative for M5. `DESIGN.md` remains the spec; where this file and
DESIGN disagree, this file wins until its Part C amendments are folded in.

**Decision (2026-08-02):** Horse Lord becomes a **roguelite build game with a tower
defence spine**. A run is defined by what you drafted; the campaign is defined by the
towers you committed to; and a new third pillar — a standing army — makes the two
depend on each other instead of substituting for each other.

Target blend, in the player's words: *Vampire Survivors* progression, *Thronefall*
hero-on-the-field and day/night, tower defence structure.

---

## Part A — Why the previous balance kept failing

Four measured attempts to stop one tower carrying maps 3–4 (frontal block, flyers,
armor, enemy HP scaling) each worked briefly and then came undone. The last one —
raising warlords-march HP 8% — made a monoculture *stronger*, which is when the actual
cause became clear.

**Towers reduce enemy HP. The hero reduces enemy HP. Perks increase both.**

Two systems producing the same resource are substitutes, always. More of one covers
less of the other, so one will eventually be sufficient alone, and no counter-tuning
survives contact with a progression system that scales both. Every fix so far has been
aimed at the symptom.

Systems become **complements** only when they contribute different *factors* to the
same outcome, not different *terms*:

```
kills  =  rate  ×  exposure  ×  amplification
```

Add two rates and you get a substitute. Multiply rate by exposure and you get a
dependency. That is the whole problem, and the whole fix.

### The measurements this rests on

| finding | evidence |
|---|---|
| Perks dissolve every tower-level counter | all 18 perks rescue an archer monoculture, 92–100% |
| It is not a specific perk | including bombard-only and frost-only cards |
| It is not the hero's share | removing every hero perk left carriers unchanged and made crossroads *easier* (89%) |
| Draft volume is the only lever that moved it | `everyNWaves` 1→3 took warlords-march to 0 carriers |
| Enemy HP is not a safe difficulty dial | +8% HP turned archer from 9/12 into 12/12 wins |
| Five seeds is noise | a monotonic difficulty sweep returned 47→33→47→53% |

---

## Part B — The design

### B.1 Three pillars, three jobs

| pillar | contributes | shape | bought with |
|---|---|---|---|
| **Towers** | **rate** | sustained, position-locked, pre-committed | gold |
| **Army** | **exposure** | holds enemies in place; deals little damage | gold |
| **Hero** | **burst rate + amplification** | mobile, cooldown-gated, the only live decision | XP → perks |

Read it as *commitment, attrition, response*. Towers and the army are decided in the
day phase and cannot react. The hero is the only thing that can answer what is actually
happening — which is what makes it the fun one to play, and why it must not also be
able to do the other two jobs.

### B.2 The army is the missing pillar

A soldier that blocks the road is worth more than a soldier that shoots. Every second
an enemy spends fighting is a second your towers fire at it for free — **exposure
multiplies rate**, so the army makes towers better in a way that no amount of tower
damage can replicate.

This is the only resource in the game that nothing else produces. `DESIGN.md` §6
already reached the same conclusion and shelved it: *"Option D — Barracks. Blockers are
a non-DPS answer, so they change the question rather than the numbers."*

Two scales, because one is structural and one is spectacle:

- **Barracks** — a tower type on a plot. Maintains a small squad that walks to a rally
  point on the lane and holds it. Soldiers die and respawn on a timer. This is the
  pillar, and it must be continuous to be one.
- **The Muster** — a hero ability, long cooldown or once per map: the gates open and a
  host marches up the road. This is the moment people will remember. It stays special
  precisely because the barracks does the routine work.

Soldiers deal **low** damage on purpose. If they killed things they would be a third
rate source, and we would be back to substitutes.

**MG5.4 measured this and found the geometry matters more than the numbers.** Exposure is
only worth anything where something is *shooting* — a soldier who stops an enemy out of
tower range has converted a plot into a speed bump. The first build let a garrison post
up to 130 units from its own plot, and the result was that adding a barracks made a
board strictly **worse**: on crossroads, `towers+army` cleared 2.4 fewer waves than
towers alone and killed half as much. Making the soldiers *stronger* made it worse still
(−1.6 → −2.4 waves), which is the tell that it was never a tuning problem — longer holds
meant longer parked outside the fire.

Cutting the rally range to 50 flipped it in one change. On the-ford the same comparison
went from **17% → 92%** wins, +2.9 waves, kills 132 → 202. So the rule the barracks is
built on: **soldiers hold the road in front of their own tower line, not in front of
their own building.** Placement is the decision, and it has to be a *joint* decision with
the towers or the pillar does not exist.

### B.3 The hero is burst, not sustain — and that is the structural cap

**The single most important mechanical decision in this document.**

The hero's basic bow stays deliberately modest and scales slowly. The hero's *power*
lives in abilities on cooldowns, drafted during a run.

This is Vampire Survivors' actual structure — your character's base attack is nothing,
your build is the weapons you found — and it does something no amount of tuning has
managed: **it caps hero throughput structurally.** A cooldown means damage-per-minute
has a ceiling no multiplier can lift past. The hero can always answer a crisis; it can
never answer *everything, continuously*, which is the towers' job.

It also happens to be the most fun version. Abilities are what people remember.

**A cooldown alone is not the cap — MG5.3 measured that.** Damage-per-minute for one
ability is bounded by `burst / cooldown`, but the hero's total is the *sum over
everything equipped*, so a roster that grows without a limit is a sustain engine
assembled out of burst parts. The moment three more abilities became draftable, hero-only
climbed back to **33% on crossroads and 58% on warlords-march** — a pillar that had just
been driven to 0% on both.

So the cap is **the equip limit, not the cooldown**: `abilities.json` carries
`equipSlots` (3, which DESIGN §4 had always said and nothing had ever enforced), and
`AbilitySystem.unlock` refuses past it. This is what makes the ability roster safe to
grow — a tenth ability changes *which three* you carry, never how many. It is also the
better game: a full bar makes a fourth unlock a real trade rather than a free add.

### B.4 XP and levels drive the draft

Kills grant XP. XP levels the hero. **Every level deals a draft.** This replaces
`everyNWaves` entirely.

- Target **~25–35 levels per 12-wave map**, not 12. Vampire Survivors fires this loop
  every 20–40 seconds and that cadence *is* the dopamine spine.
- The draft does not pause the sim. The offer sits in hand — the existing "decide later"
  overlay is already the right behaviour. Level up mid-charge, take the card when you
  can breathe.
- XP comes from kills, so **riding out to fight is how you progress**. That is pillar 1
  from DESIGN §1 — greed pulls you toward danger — finally wired to progression instead
  of sitting beside it.

Gold and XP stay separate currencies with separate jobs: **gold buys commitment
(towers, barracks), XP buys identity (perks, abilities).**

### B.5 Perk families, and the rule that prevents monocultures structurally

Five families: **Hero · Towers · Army · Economy · Keep.**

1. **A perk contributes to one factor only.** No card that raises rate *and*
   amplification. Mixed cards are how a pool becomes uniformly-good mush.
2. **Every offer of three contains one Hero card, one Tower-or-Army card, and one
   wildcard.**

Rule 2 replaces all per-perk balance tuning with a structural guarantee. It bans
nothing and removes no agency — you still choose freely — but you cannot accidentally
draft a pure-hero run, and you never face an offer where every card is dead because of
what you built. It also fixes the dead-card problem that made tower-specific perks
awkward.

### B.6 Abilities come from the draft, not a new tree

`unlock-ability` is **already** in the effect vocabulary and already applied. So an
ability is simply a card you can draft. (It was in the vocabulary but its return value
was being dropped on the floor — MG5.3 routed it through `PerkSystem.onUnlockAbility` to
`AbilitySystem.unlock`, which is what made this true rather than nearly-true.)

Upgrades needed a new effect type, `ability-stat`, scoping `cooldown`/`damage`/`radius`/
`duration`/`range` to one ability or to all of them. `loader.ts` rejects a card naming a
stat its target has not got, because an upgrade that silently does nothing reads as a
weak perk rather than a broken one. An unlock card stops being offered once its ability
is carried or the bar is full — `PerkSystem.isOfferable`, a predicate the Simulation
supplies, since AbilitySystem owns the cap and PerkSystem owns the offer.

- **Meta tree (between runs)** → which abilities and perks are *eligible to appear*.
- **Draft (in run)** → which you actually get, plus upgrades to them.

That is exactly Vampire Survivors' unlock structure, and it means **no third selection
screen**. The draft already is the tree.

**The meta tree stops granting raw stats.** It grants unlocks and options only. This
removes the double-dip risk flagged when drafting landed — two systems multiplying the
same numbers on a curve that was never tuned for either.

Launch ability set, all cooldown-gated: Charge (identity verb), Volley, Rally Horn,
**Rapid Fire**, **Heavy Shaft** (one big piercing arrow), **Muster**, plus an
area-denial ability (caltrops/oil) because area denial is *exposure* and gives the hero
a way to contribute to the army's factor without replacing it.

### B.7 Maps stay single-lane where they want to be

The invariant is about **systems, not geography**. A single-lane map is fine as long as
its wave budget exceeds any one pillar's throughput. Multi-lane remains a tool for
variety, not a crutch for balance.

### B.8 The balance rule, stated numerically

For each map, with `H` = total enemy HP per wave and `T` = transit time:

- towers alone, all plots filled, cannot deliver `H` within `T`
- hero alone, fully drafted, cannot deliver `H` within `T` (guaranteed by B.3's
  cooldown ceiling)
- army alone deals almost no damage and obviously cannot
- **any two pillars together can**, at roughly 70/30 in either direction

Sufficiency is what we ban, not imbalance. A player leaning 70% into towers or 70% into
the hero should both win; 100/0 should not.

---

## Part A.1 — MG5.1 result (measured 2026-08-02): the towers are not a pillar yet

The first run of the pillar probe. Twelve seeds, drafting on, per map:

| map | towers only | hero only | both | cap |
|---|---|---|---|---|
| meadow-road | **8%** | 100% (0 damage taken) | 100% | 100 |
| the-ford | **0%** | 83% | 81% | 100 |
| crossroads | **0%** | 8% | 64% | 40 |
| warlords-march | **0%** | **42%** ✗ | 53% | 25 |

**Two findings, and the second is bigger than the one we went looking for.**

### 1. The hero is the game; the towers are garnish

Hero-only matches or beats the full reference on maps 1 and 2 (100 vs 100, 83 vs
**81** — towers make the-ford marginally *worse*, because the gold spent on them buys
less than the bow does). Towers alone clear between 1.0 and 2.6 waves of 8–14.

This is the opposite of the problem we thought we had. It was never "one tower carries";
it is "the hero carries and the towers barely participate". Every hour spent counter-
tuning towers against each other was spent on the wrong half of the game.

The one map where the hero cannot solo is **crossroads (8%)** — the two-lane map. The
hero's limit is *simultaneity*, exactly as predicted, and it is currently the only thing
in the game that imposes one.

### 2. Towers cannot bootstrap, because the economy is downstream of the hero

Look at the towers-only rows for the-ford and crossroads: **1.0 towers built, 0 kills.**
The bot spends its starting gold on one tower, that tower cannot kill wave 1 alone, no
coins drop, and nothing is ever built again. It is not a damage verdict — it is a
funding collapse.

```
coins drop from kills → the hero does the killing → gold buys towers
⇒ towers are funded by the hero
```

**A pillar that is funded by another pillar can never be independent of it.** This sits
*underneath* the whole triangle and invalidates the original sequencing: the barracks
costs gold too, so the army would be hero-funded in exactly the same way. Adding it
first would have produced a third dependent system, not a third pillar.

**Consequence: kill-independent income becomes MG5.2, ahead of the barracks.** Some
meaningful share of a run's gold must arrive without anything dying — wave-clear
payments, mills, or a base tithe. Only then can a non-hero pillar stand up.

---

## Part A.2 — MG5.2 result: income is not the constraint, and the bot was lying

MG5.1 concluded "towers cannot bootstrap, so fix the economy". Tested, and the
conclusion was **half right**. The 1-tower-0-kills observation was real; the implied
fix was not.

### The instrument was wrong first

Sweeping starting gold produced an impossible result: **more money, worse defence.**

| warlords-march, towers-only | towers built | waves cleared |
|---|---|---|
| 45 starting gold | 3.8 | 2.4 |
| 110 starting gold | 2.0 | 1.0 |

That is not a game truth. The bot ranks *plots* by lane coverage but decides *build vs
upgrade* on raw value-per-coin, which has no notion of covering new road — so once the
obvious plots are taken, an upgrade always out-scores a fourth tower. Handed more gold
it stacked a corner and left the map unwatched.

Fixed by scoring a new build against the lane it watches that **nothing already
watches** (`marginalCoverage`), discounted to `OVERLAP_FLOOR` when it fully overlaps.
The effect on the bots' play, at the unchanged economy:

| | before | after |
|---|---|---|
| crossroads reference | 64% | **78%** |
| warlords-march reference | 53% | **72%** |

**The bots were meaningfully bad at using towers, which is the half of the game we were
trying to measure.** Every tower number taken before this is suspect.

### With a competent bot, income still does not make towers a pillar

Across 45 / 80 / 110 starting gold, on every map, **towers-only wins 0%** and clears
1–2 waves. Tower count barely moves, because the coverage-aware bot buys fewer,
better-placed towers and banks the rest.

So the binding constraint is not funding. **It is that towers are simply weak relative
to the wave budget once hero damage is removed** — which is the MG5.1 finding restated
without the economic explanation. No economy change is shipped: there is no evidence for
one, and a balance change on weak evidence is how the last four attempts went wrong.

### Consequences

1. **Re-sequenced again.** Tower strength versus hero strength is the real work, so
   *hero becomes burst* moves ahead of the barracks. The army still cannot be measured
   until it exists, but it is no longer blocked on an economy fix that would not have
   helped.
2. **The difficulty bands now read easy.** With the fixed bot, crossroads measures 78%
   against a 45–75 band and warlords-march 72% against 25–55. The bands are design
   intent and should not move to flatter the instrument — but the campaign is easier
   than intended for a player who places towers well. Fold into MG5.8.
3. **Starting gold at 45 buys exactly one tower before wave 1.** Poor for a tower
   defence on feel grounds, but there is no measured case for changing it, and feel is
   a phone-and-thumbs question. Left open deliberately.

**Method note:** economy parameters change bot *behaviour*, which re-rolls the entire
run trajectory — so cross-config win rates are not controlled comparisons. Trust
within-config observations (1 tower, 0 kills) over across-config deltas.

---

## Part C — DESIGN.md amendments to apply

1. **§5 Towers** — add **Barracks** as a fifth launch tower (it was listed as a
   post-launch expansion). Note that soldiers block rather than kill.
2. **§6 Enemies** — the "open design problem" and its RESOLVED entry become historical.
   Solo-carry by a single *tower* is retired as an invariant and replaced by B.8's
   no-single-*pillar* rule. Keep the armor/flyer/frontal-block counters: they are good
   texture and they still shape which tower you want, they are just no longer load-bearing.
3. **§7 Economy** — add XP as a second currency with the gold/XP split from B.4.
4. **§8 Abilities** — abilities are drafted, not fixed; the meta tree gates eligibility.
5. **§10 Art** — no change (Thronefall direction stands).
6. **§15.1** — in-run drafts move from "parked" to shipped and central.
7. **CLAUDE.md** — add `ArmySystem`, `XpSystem` to the engine list; add the
   no-single-pillar rule to the game-rule invariants.

---

## Part D — Task list

Ordered so the triangle exists before anything is tuned against it, and so the cheapest
measurement comes first.

### M5.1 — Measure where we actually stand (GO/NO-GO) — ✅ DONE 2026-08-02
- [x] `towersOnly` / `heroOnly` bot policies + `withoutHeroDamage`.
- [x] Pillar probe in the harness, reporting win/waves/damage/towers/kills per arm.
- [x] `DIFFICULTY_TARGETS.soloCarry` → `maxSinglePillarWinRate`.
- **Result: see Part A.1.** Towers are not a pillar (0–8%), the hero nearly is
  (42–100%), and the economy is downstream of hero kills so towers cannot bootstrap.
  Re-sequenced the rest of M5 accordingly.

### M5.2 — Kill-independent income — ✅ CLOSED 2026-08-02, negative result
- [x] Fixed the instrument: the bot's build-vs-upgrade decision now scores the lane a
      tower watches that nothing already watches (`marginalCoverage`).
- [x] Swept starting gold 45/80/110 and wave-clear payments across all four maps.
- **Result: see Part A.2.** Income is not the constraint — towers-only wins 0% at every
  setting. No economy change shipped. The bot fix alone moved the reference +14pp on
  crossroads and +19pp on warlords-march, so every prior tower measurement is suspect.

### M5.3 — Hero becomes burst (PROMOTED — the real constraint) — ✅ DONE 2026-08-02
- [x] Re-shape the bow curve so base damage scales slowly: 27.4 → 65.7 dps across six
      levels, where it was 27.4 → 152.0.
- [x] Move hero power into abilities. **Rapid Fire** (`hero-buff`), **Heavy Shaft**
      (`pierce-shot`, a corridor along the hero's facing), **Caltrops** (`ground-zone`,
      the area denial — a new `ZoneSystem` owns persistent ground hazards).
- [x] Ability upgrade perks, via a new `ability-stat` effect: Practised Hands, Warhorse
      Shoes, Arrow Storm, plus three unlock cards.
- [x] **The equip cap** — not in the original plan, and the thing that actually made the
      criterion hold. See B.3.
- **Result.** Pillar probe, 12 seeds × all bots:

  | map | towers only | hero only | both |
  |---|---|---|---|
  | meadow-road | 8% | 42% | 97% |
  | the-ford | 0% | 0% | 75% |
  | crossroads | 0% | 0% | 53% |
  | warlords-march | 0% | 0% | 28% |

  `heroOnly` loses maps 3–4 outright, and map 2. The towers-only:hero-only gap on the
  one map where either wins is 5:1, down from the ~10:1 (0% vs 100%) that opened M5.

  The reference arm landed **in band on all four maps for the first time** (want
  90–100 / 70–95 / 45–75 / 25–55) without a single wave budget being touched. That is
  not tuning arriving early — it is the harness finally measuring a loadout a player
  can actually assemble: the bot used to force-unlock the entire roster on wave 1, which
  the equip cap made impossible, so it now starts with Charge and drafts the rest.
  Towers are still not a pillar; that is MG5.4's job, not a tuning problem.

### M5.4 — Barracks and soldiers — ✅ DONE 2026-08-03
- [x] `ArmySystem` in `/src/engine`: soldier entities, lane-relative posts, respawn
      timers, one-soldier-one-enemy pairing.
- [x] Enemies gain a `blocked` state — stopped and fighting, not walking. `walkingCount`
      counts it, or a wave would end mid-skirmish.
- [x] `barracks` tower in `towers.json`, fully data-driven via a `garrison` stat block;
      two branches (Shieldwall / Levy). Army perks via a `garrison` tower-grant.
- [x] Instanced rendering for soldiers, in their own colour with their own HP bars.
- [x] **The Muster** — `summon-host`, a plotless host on a lifetime, posted on the lane
      nearest the hero. Drafted via War Banner.
- [x] Counter enemies: **Outrider** (`blockImmune`) and **Halberdier** (`antiInfantry`).
- **Result.** Pillar probe (12 seeds × all bots), with the complement arm split out:

  | map | towers | army | hero | reference |
  |---|---|---|---|---|
  | meadow-road | 8% | 0% | 33% | 97% |
  | the-ford | 0% | 0% | 25% | 75% |
  | crossroads | 0% | 0% | 0% | 56% |
  | warlords-march | 0% | 0% | 0% | 22% |

  `armyOnly` loses every map — the criterion. And the complement probe, funded equally
  so both arms actually build:

  | map | towers only | towers+army |
  |---|---|---|
  | meadow-road | 100% | 92% (ceiling; towers alone already clear it) |
  | the-ford | 17% | **92%** |
  | crossroads | 0% | **17%** |
  | warlords-march | 0% | 0% (+1.5 waves, kills 90 → 126) |

  Exposure multiplies rate. It is not subtle where there is room for it to matter.

- **Deferred to MG5.8 on purpose:** the Outrider and Halberdier exist, are tested and are
  in `enemies.json`, but are **not in the campaign wave sets**. Adding them cost
  warlords-march 22% → 3% and the-ford 75% → 61%. Putting enemies into waves *is*
  re-pricing wave budgets, which is MG5.8's job, not MG5.4's.

### M5.5 — XP and levels — ✅ DONE 2026-08-03
- [x] `XpSystem`; `xpValue` on every enemy (optional, with a roster default so a new
      enemy is never silently worth zero); geometric curve in `economy.json`.
- [x] Levels deal drafts. `everyNWaves` is retired — the field survives only so old
      files validate, and nothing reads it.
- [x] `PerkSystem.queue()`: cards owed beyond the one in hand are **banked**, not
      dropped and not swapped under the player's thumb. Levelling twice mid-charge is
      routine now; either alternative reads as the game eating a reward.
- [x] HUD: XP bar, level, and the queued-card count.
- **Result.** Levels on a full clear, 12 seeds × all bots:

  | map | full clears | levels |
  |---|---|---|
  | meadow-road | 33/36 | 29.6 |
  | the-ford | 26/36 | 28.4 |
  | crossroads | 16/36 | 31.9 |
  | warlords-march | 9/36 | 34.8 |

  All four inside the 25–35 band. The curve is `base 6 × 1.075^(n-1)` — front-loaded
  (level 2 costs ~3 kills) with a slow tail. Both halves were measured: `base 7.5 ×
  1.06` gave the right level counts but cost the-ford 75% → 64% and warlords 22% → 14%,
  because power arrived too late to matter; `base 6 × 1.05` fixed the difficulty and
  overshot to 36–44 levels. Steepening the tail instead of the head kept both.

- **Reference curve after the change:** 92 / 72 / 44 / 25 against bands of 90–100 /
  70–95 / 45–75 / 25–55. Three in band, crossroads 1pp under.

### M5.6 — Perk families and the offer rule — ✅ DONE 2026-08-03
- [x] `family` on `PerkSchema`, required, one of five.
- [x] `PerkSystem.deal` composes hero + tower/army + wildcard, degrading a starved slot
      to a wildcard rather than shrinking the offer.
- [x] Pool spread across all five families: 12 hero, 8 towers, 4 army, 2 economy, 2 keep.
- [x] Load-time check that `hero`, `towers` and `army` are all non-empty — a pool with
      no army cards would honour the rule by never applying it, and the guarantee would
      silently not exist.
- [x] The family is **on the card**. An offer whose balance you cannot see is three
      anonymous upgrades, which is the failure the pool was rebuilt to avoid.
- **Not done: the one-factor lint.** §B.5 rule 1 says a perk contributes to one factor
  only. Mechanically deciding whether `cost × 0.76` is an upgrade or a downgrade is
  ambiguous, and a strict "all effects in one family" rule would ban the tradeoff cards
  that make a pick cost something — the whole reason `effects` is an array. Left as a
  review rule rather than shipped as a bad check.
- **Result — the campaign is ON TARGET on all four maps for the first time:**

  | map | win | band |
  |---|---|---|
  | meadow-road | 100% | 90–100 ✓ |
  | the-ford | 78% | 70–95 ✓ |
  | crossroads | 64% | 45–75 ✓ |
  | warlords-march | 50% | 25–55 ✓ |

  Guaranteeing a tower-or-army card in every offer is worth more than any per-perk
  tuning was: boards come out supported instead of lopsided, without a single weight
  being touched. Pillar probe still OK, cadence still 29.5 / 28.1 / 31.8 / 34.8.

### M5.7 — Meta tree becomes unlocks
- [ ] Convert stat nodes to unlock nodes (abilities, perks, the barracks).
- [ ] Save migration — schema is versioned, this is the first real one.
- **Accept:** meta grants no raw stats; existing saves migrate without loss.

### M5.8 — Rebalance the campaign against the triangle
- [ ] Re-price wave budgets per B.8 on all four maps.
- [ ] Retire `soloCarry`; adopt the no-single-pillar invariant.
- **Accept:** every map in its win band; no pillar clears maps 3–4 alone; every tower
  and the barracks appear in winning runs; runs measurably diverge across seeds.

---

## Part E — Risks, named up front

- **The army is real engine work.** Friendly units are a new entity type, not a
  projectile behaviour. If M5.2 does not land, the triangle is a two-legged stool and
  we are back to substitutes. It is sequenced right after the economy fix for exactly this reason.
- **Cooldown-gating the hero can read as "weak".** Mitigation: abilities must be
  frequent and loud. If the hero stops being fun, the pivot has failed on its most
  important axis, and that judgement is a phone-and-thumbs call, not a harness one.
- **Three pillars multiply the balance surface.** The bots are the answer, and they now
  run 12 seeds because five was measurably noise.
- **Soldier counts cost frames.** Instancing from the start, and the 60fps-on-2021-Android
  budget still governs.
- **Everything here is unvalidated on a phone.** The whole art and feel layer is still
  measured only under SwiftShader. That debt is unrelated to M5 but it is still open.
