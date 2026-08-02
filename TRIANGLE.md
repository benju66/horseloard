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
ability is simply a card you can draft.

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

### M5.3 — Hero becomes burst (PROMOTED — the real constraint)
- [ ] Re-shape the bow curve so base damage scales slowly.
- [ ] Move hero power into abilities; add Rapid Fire, Heavy Shaft, area denial.
- [ ] Ability upgrade perks ("Volley fires twice", "Charge burns the ground").
- **Accept:** `heroOnly` loses maps 3–4; the gap between `towersOnly` and `heroOnly`
  narrows from its current ~10:1.

### M5.4 — Barracks and soldiers
- [ ] `ArmySystem` in `/src/engine`: soldier entities, rally points, respawn timers.
- [ ] Enemies gain a `blocked` state — stopped and fighting, not walking.
- [ ] `barracks` tower in `towers.json`; soldiers are data-driven (count, hp, damage,
      respawn, rally offset).
- [ ] Instanced rendering for soldiers; they are the highest-count friendly entity.
- **Accept:** an enemy that meets a soldier stops advancing; killing the soldier
  resumes it; `armyOnly` loses every map; towers + army beats towers alone on the same
  wave budget.

### M5.5 — XP and levels
- [ ] `XpSystem`; enemies gain `xpValue`; curve in `economy.json`.
- [ ] Levels deal drafts; `everyNWaves` removed.
- [ ] HUD: XP bar and level.
- **Accept:** 25–35 levels on a full map-1 run; drafts never block the sim.

### M5.6 — Perk families and the offer rule
- [ ] `family` on `PerkSchema`; one-factor validation at load.
- [ ] `PerkSystem.deal` composes hero + tower/army + wildcard.
- [ ] Rebuild the pool across five families, including the Army line.
- **Accept:** no offer is ever all-hero; no offer is ever entirely dead cards for the
  current build.

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
