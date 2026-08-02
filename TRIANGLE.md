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

### M5.1 — Measure where we actually stand (GO/NO-GO)
- [ ] Three new bot policies: `towersOnly` (hero never attacks), `heroOnly` (builds
      nothing), `armyOnly` (barracks only, once it exists).
- [ ] New harness probe reporting each pillar's solo win rate per map.
- [ ] Replace `DIFFICULTY_TARGETS.soloCarry` with `maxSinglePillarWinRate`.
- **Accept:** the report runs and tells us, for the first time, whether hero-only can
  clear map 3. Nobody has ever measured this. No content changes in this task.

### M5.2 — Barracks and soldiers
- [ ] `ArmySystem` in `/src/engine`: soldier entities, rally points, respawn timers.
- [ ] Enemies gain a `blocked` state — stopped and fighting, not walking.
- [ ] `barracks` tower in `towers.json`; soldiers are data-driven (count, hp, damage,
      respawn, rally offset).
- [ ] Instanced rendering for soldiers; they are the highest-count friendly entity.
- **Accept:** an enemy that meets a soldier stops advancing; killing the soldier
  resumes it; `armyOnly` loses every map; towers + army beats towers alone on the same
  wave budget.

### M5.3 — Hero becomes burst
- [ ] Re-shape the bow curve so base damage scales slowly.
- [ ] Move hero power into abilities; add Rapid Fire, Heavy Shaft, area denial.
- [ ] Ability upgrade perks ("Volley fires twice", "Charge burns the ground").
- **Accept:** `heroOnly` loses maps 3–4 at every draft outcome the bots can reach.

### M5.4 — XP and levels
- [ ] `XpSystem`; enemies gain `xpValue`; curve in `economy.json`.
- [ ] Levels deal drafts; `everyNWaves` removed.
- [ ] HUD: XP bar and level.
- **Accept:** 25–35 levels on a full map-1 run; drafts never block the sim.

### M5.5 — Perk families and the offer rule
- [ ] `family` on `PerkSchema`; one-factor validation at load.
- [ ] `PerkSystem.deal` composes hero + tower/army + wildcard.
- [ ] Rebuild the pool across five families, including the Army line.
- **Accept:** no offer is ever all-hero; no offer is ever entirely dead cards for the
  current build.

### M5.6 — Meta tree becomes unlocks
- [ ] Convert stat nodes to unlock nodes (abilities, perks, the barracks).
- [ ] Save migration — schema is versioned, this is the first real one.
- **Accept:** meta grants no raw stats; existing saves migrate without loss.

### M5.7 — Rebalance the campaign against the triangle
- [ ] Re-price wave budgets per B.8 on all four maps.
- [ ] Retire `soloCarry`; adopt the no-single-pillar invariant.
- **Accept:** every map in its win band; no pillar clears maps 3–4 alone; every tower
  and the barracks appear in winning runs; runs measurably diverge across seeds.

---

## Part E — Risks, named up front

- **The army is real engine work.** Friendly units are a new entity type, not a
  projectile behaviour. If M5.2 does not land, the triangle is a two-legged stool and
  we are back to substitutes. It is sequenced second for exactly this reason.
- **Cooldown-gating the hero can read as "weak".** Mitigation: abilities must be
  frequent and loud. If the hero stops being fun, the pivot has failed on its most
  important axis, and that judgement is a phone-and-thumbs call, not a harness one.
- **Three pillars multiply the balance surface.** The bots are the answer, and they now
  run 12 seeds because five was measurably noise.
- **Soldier counts cost frames.** Instancing from the start, and the 60fps-on-2021-Android
  budget still governs.
- **Everything here is unvalidated on a phone.** The whole art and feel layer is still
  measured only under SwiftShader. That debt is unrelated to M5 but it is still open.
