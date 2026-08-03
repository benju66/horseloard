# SKILLTREE.md — the career tree (M6)

**Status: design, not built.** Authoritative for M6 once approved. Supersedes TRIANGLE.md
§B.4–§B.6 where they disagree: **the in-run draft is retired.**

---

## Part A — The decision

> *"I don't think there should be in-run options and I think it should be like a full
> skill tree build where there are different paths to go down as you level."*

Everything a run's power depends on is decided **before** the run, in one persistent tree.
No cards, no offers, no pop-ups, no mid-fight decisions. What you built is what you take.

### A.1 What this costs, stated plainly

This is a real loss and it should be named before it is paid.

The in-run draft gave every run an **arc** — you started weak, and by wave 10 the build had
come together in a way that run alone produced. That is the Vampire Survivors feeling, and
deleting the draft deletes it. Runs will now start and end at the same hero power.

Two things make that survivable, and they are the reason this is worth doing:

1. **The run still has an arc — it is just made of gold.** Towers, upgrades, branch
   choices and the barracks all still build across a run. That arc is *tower defence*
   rather than *survivor*, and it is the arc this game's spine was always built around.
2. **The build decision moves somewhere it can be thought about.** A pick-1-of-3 offered
   mid-fight is not a decision, it is a reflex — which is exactly what the pop-up
   feedback was really saying. A tree you study between runs is where "true character
   build" actually lives.

The honest summary: **this trades run-to-run variety for run-to-run identity.** Fewer
surprises, more intent.

### A.2 What it replaces

| retired | replaced by |
|---|---|
| `perks.json` — the 29-card draft pool | tree nodes |
| `PerkSystem` — offers, weights, the offer rule | `SkillTree` — points, prerequisites, exclusivity |
| in-run levels dealing cards | **career** levels granting points |
| `DraftOverlay` | the tree screen |
| meta-tree tokens (`economy.tokens`) | skill points; **one currency, not two** |

Retiring tokens is not tidying. Tokens and XP were two currencies buying the same kind of
thing through two different screens, which is the confusion DESIGN §15 warns about under
"gold buys commitment, XP buys identity". Now: **gold buys commitment (in a run), skill
points buy identity (between runs).** Two currencies, two jobs, no overlap.

Stars keep mattering because they pay XP — replaying a map for 3★ is how you fund the
tree.

---

## Part B — What the research says

Four rules, and each one is a constraint on the design below.

**1. Scarcity is what makes a tree a tree.** *"If every skill in a skill tree can be
unlocked eventually, the tree is not living up to its full potential."* A tree you finish
is a checklist. **Design rule: total points must be far below total node cost.**

**2. Keystones are trade-offs, not upgrades.** Path of Exile's keystones pair a large
advantage with a real downside and sit at the end of a long path, so taking one is a
commitment that defines the build. **Design rule: every path ends in a choice of two
keystones, each with a genuine cost, and you may take only one.**

**3. Branches exist for replay.** Multiple paths are what make a second campaign a
different game rather than the same one faster.

**4. Balance breadth against choice paralysis.** A tree too large is noise on a phone.

And one from Thronefall specifically, which is the closest shipped comparison: **54 levels,
each unlocking a perk, and you equip up to 5 before a run** — the equip cap rising at
levels 8 and 24. Unlocking is separate from equipping. Horse Lord already has that seam:
`equipSlots`.

---

## Part C — Structure

### C.1 Five paths

Aligned to the pillars, because the pillars are the architecture (TRIANGLE.md §B.1) and a
tree that cut across them would fight it.

| path | pillar | fantasy | what it buys |
|---|---|---|---|
| **The Hunt** | hero (rate) | the archer | bow, crit, ranged abilities |
| **The Ride** | hero (presence) | the horseman | speed, trample, close-in abilities, staying upright |
| **The Wall** | towers (rate) | the engineer | tower stats, tower mechanics, cheaper building |
| **The Host** | army (exposure) | the commander | barracks, garrisons, the Muster |
| **The Crown** | support | the sovereign | gold, coins, the gate |

The hero takes two of five because the hero is the thing you play. That is deliberate and
it is what Vampire Survivors does — most of the tree is your character.

**The pillar invariant survives.** The tree changes *which* pillar you lean on, not whether
you need the others. A full Hunt build still cannot clear crossroads without towers,
because the wave budget is priced against all three (TRIANGLE §B.8). Leaning 70/30 stays
viable; leaning 100/0 still loses. That is a testable claim and Part F makes it a probe.

### C.2 Node types

| type | cost | what it is |
|---|---|---|
| **Minor** | 1 | a real but small stat step. Connective tissue — never pure filler. |
| **Notable** | 2 | a mechanic you did not have, or a step big enough to feel |
| **Ability** | 2 | puts an ability into your loadout pool |
| **Keystone** | 3 | build-defining, with a downside. One per path, ever. |

### C.3 Budget — the scarcity rule, in numbers

- **40 career levels**, 1 skill point each.
- **+4 points**, one per map 3-starred.
- **44 points total, ever.**
- The tree holds **~92 nodes costing ~163 points.**

**You will ever allocate about 27% of the tree.** A second campaign down a different path
is a genuinely different game, which is rule 3 doing its job.

### C.4 Levels and XP

Career XP, accumulated across every run, not reset. Same `xpValue` per enemy the sim
already has, plus a star bonus at run end.

```
level n costs   35 × 1.10^(n-2)      (level 2 costs 35; level 40 costs ~1,270)
total to 40     ≈ 15,500 XP
```

Sized against measured runs: a first campaign clear is ~800 kills ≈ 2,000 XP ≈ **level
20**. Reaching 40 takes roughly eight campaigns' worth of play — replays for stars, and
endless. The curve is geometric rather than a table so endless never runs out of levels.

**Star bonus:** 1★ ×1.0, 2★ ×1.35, 3★ ×1.8 on the run's XP. This is what makes replaying
a cleared map for 3★ worth doing, and it is the only reward stars pay now.

### C.5 Equipping

The tree unlocks; a loadout equips. Unchanged from today and unchanged from Thronefall:

- **Abilities: 3 slots** (`equipSlots`). Unlocking a fourth ability makes it a choice of
  three, never a fourth simultaneous one — this is the structural cap on hero
  damage-per-minute and TRIANGLE §B.3 explains why it cannot be relaxed.
- **Slots grow with the campaign, not the tree**: 2 at start, 3 after map 2, 4 after map 4.
  Growth is a *campaign* reward so it cannot be rushed by grinding.
- **Passive nodes are always on.** Only abilities are equipped.

### C.6 Respec

**Free, always, from the tree screen.** Non-negotiable: a tree where 27% is reachable and
mistakes are permanent is a tree nobody experiments with, which forfeits rule 3. This is
already the project's stated stance (`metatree.json` header).

---

## Part D — The nodes

Costs in brackets. Nodes are listed in path order; a node requires the one above it unless
noted. **Keystones are mutually exclusive within their path.**

### The Hunt — bow, crit, ranged abilities

| node | cost | effect |
|---|---|---|
| Steady Hand | 1 | +12% bow damage |
| Long Draw | 1 | +12% bow range |
| Fletching | 1 | +10% bow fire rate |
| **Volley** | 2 | unlock ability |
| Keen Eye | 2 | bow crits 15% for ×2 |
| Bodkin Points | 2 | bow damage ignores armour entirely |
| **Heavy Shaft** | 2 | unlock ability |
| Practised Hands | 2 | −12% cooldown, all abilities |
| **Rapid Fire** | 2 | unlock ability |
| Killing Ground | 2 | +25% bow damage to slowed or blocked enemies |
| **Aerostorm** | 2 | unlock ability |
| Storm Warning | 1 | Aerostorm triggers at 25% less damage dealt |
| *Keystone* **Deadeye** | 3 | **+90% bow damage, −35% bow range.** Ride into the teeth of it. |
| *Keystone* **Skirmisher** | 3 | **+35% fire rate and +15% move speed, −30% bow damage.** Volume over weight. |

### The Ride — the horse, presence, close-in abilities

| node | cost | effect |
|---|---|---|
| Sure Footing | 1 | +10% move speed |
| Barding | 1 | +40% stagger grace window |
| Iron Shoes | 1 | +30% trample damage |
| **Whirling Blades** | 2 | unlock ability |
| Honed Edges | 2 | +30% blade damage |
| Wide Arc | 2 | +20% blade radius, +1 blade |
| **Caltrops** | 2 | unlock ability |
| Broken Ground | 2 | caltrops slow 20% harder and last 40% longer |
| Second Wind | 2 | after a shove, +30% move speed for 3s |
| Warhorse | 2 | trample damage also applies a brief slow |
| *Keystone* **Cataphract** | 3 | **Cannot be staggered at all. −25% bow damage.** You are the wall. |
| *Keystone* **Outrider** | 3 | **+40% move speed; coins magnet from anywhere on the map. Trample deals no damage.** Pure logistics. |

### The Wall — towers

| node | cost | effect |
|---|---|---|
| Masonry | 1 | −8% tower build cost |
| Fletchers | 1 | +8% tower damage |
| Wide Patrol | 1 | +8% tower range |
| Marksman's Oath | 2 | archer towers crit 20% for ×2.2 |
| Powder Cache | 2 | +25% bombard damage |
| Deep Winter | 2 | +20% frost range, frost slows 15% harder |
| Beacon Lore | 2 | towers give neighbours within 95u +12% damage |
| Foundations | 2 | −18% tower **upgrade** cost |
| Overwatch | 2 | +15% tower damage to enemies at full health |
| Rapid Reload | 2 | +12% tower fire rate |
| *Keystone* **Siege Doctrine** | 3 | **+45% tower damage, −25% tower range.** Few, deadly, close. |
| *Keystone* **Curtain Wall** | 3 | **+35% tower range, −20% tower damage, +1 buildable plot per map.** Cover everything, lightly. |

### The Host — the army

| node | cost | effect |
|---|---|---|
| **The Barracks** | 2 | unlock the barracks tower |
| Levy Writ | 1 | +1 soldier per garrison |
| Mail and Shield | 2 | +35% soldier hp |
| Standing Orders | 2 | −28% soldier respawn |
| Drill Yard | 2 | +40% soldier damage |
| Wide Picket | 2 | +18% garrison engage radius |
| **The Muster** | 2 | unlock ability |
| War Banner | 2 | +3 soldiers in a Muster, +30% duration |
| Veterans | 2 | mustered soldiers keep 50% of their hp when the host disperses, and hold the road until killed |
| *Keystone* **Shieldwall** | 3 | **+120% soldier hp, −40% soldier damage, −1 soldier.** They do not break. |
| *Keystone* **The Levy** | 3 | **+3 soldiers, −45% soldier hp, respawn halved.** Bodies are cheap. |

### The Crown — economy and the keep

| node | cost | effect |
|---|---|---|
| Lodestone | 1 | +25% coin magnet radius |
| Full Coffers | 1 | +15 starting gold |
| Stone Gate | 1 | +25 gate hp |
| Tithe | 2 | every tower drops 2 coins every 9s |
| Standing Stones | 2 | −25% gate repair cost |
| Wide Roads | 2 | +30% coin lifetime; wave clear pays +20% |
| Watchfire | 2 | see the next two waves in the preview, not one |
| Ransom | 2 | +50% coins from elites |
| *Keystone* **War Chest** | 3 | **+90 starting gold, wave-clear pay −50%.** Front-load everything. |
| *Keystone* **The Long Siege** | 3 | **Wave-clear pay +80%, starting gold −30, gate hp −40.** Survive to get rich. |

**Totals: 92 nodes worth 163 points, against a 44-point budget.**

---

## Part E — Screen

Five vertical columns, **one path per phone screen, swipe sideways.** A path reads top to
bottom as a single line of commitment, which is the shape a phone actually wants — no
pan-and-zoom, no minimap, no 2D graph.

- Header: level, XP bar to next level, **points unspent** (the number that pulls you back).
- Each node: name, effect, cost, and one of `locked / affordable / taken`.
- Keystones sit at the bottom of a column, visibly larger, with the downside in the same
  size type as the upside. A trade-off written in small print is a lie.
- **Respec** is a header button, always live.
- Reachable from the main menu **and** from pause — but pause is out-of-run only. Opening
  the tree mid-wave is exactly the interruption this whole redesign deletes.

---

## Part F — How this gets measured

The harness loses drafting and gains builds. The pillar probe (TRIANGLE MG5.1) still runs
unchanged; three new ones:

1. **Path probe.** Spend all 44 points down each path in turn. **Accept:** no single path
   clears maps 3–4 alone — the pillar invariant restated as a build question. This is the
   one that could invalidate the design, so it runs first.
2. **Budget probe.** Report allocated fraction at level 40. **Accept:** ≤ 35%. Rule 1 as a
   number.
3. **Keystone probe.** Force each keystone, then each in-path pair against each other.
   **Accept:** no keystone is strictly dominant; every one appears in some winning build.
   A keystone nobody takes is a dead node, and a keystone everybody takes is not a choice.

Plus the existing curve: all four maps stay in band at **a mid-tree build (~22 points)**,
which is the new reference — not an empty tree and not a maxed one.

---

## Part G — Build order

| step | work |
|---|---|
| **M6.1** | `skilltree.json` + schema; `SkillTree` engine (points, prereqs, exclusivity, respec). Reuses `MetaEffect` — no new effect vocabulary. |
| **M6.2** | Career XP + levels + star bonus. Save migration v2 → v3: convert spent tokens to points, retire `economy.tokens`. |
| **M6.3** | Delete the draft: `PerkSystem`, `perks.json`, `DraftOverlay`, the in-run level hook. Harness loses `forcedPerk`, gains `forcedPath`. |
| **M6.4** | The tree screen. |
| **M6.5** | Loadout screen; campaign-gated equip slots (2/3/4). |
| **M6.6** | Measure Part F, tune. |

M6.1 and M6.3 are the risky pair — M6.3 deletes three milestones of shipped work, so M6.1
lands and is measured first.

---

## Part H — Open questions

1. **Is the run arc actually enough?** Part A.1 argues gold carries it. That is an
   argument, not evidence, and only playing it answers it. **If runs feel flat after
   M6.4, the cheapest fix is a small in-run element that is not a pop-up** — e.g. the
   forge offering one ability upgrade per map at a fixed price. Worth holding in reserve.
2. **44 points across 5 paths may be too thin to feel any of them.** ~9 points per path
   if spread evenly is nothing; the design assumes you *won't* spread. If measurement
   shows even spreads winning, the keystones are too weak.
3. **Do minors earn their place?** Fourteen 1-point stat nodes is where filler hides.
   First thing to cut if the tree reads as padding.

---

**Sources:** [Keys to Meaningful Skill Trees — GDKeys](https://gdkeys.com/keys-to-meaningful-skill-trees/) ·
[Mastering Skill Trees in Game Design](https://www.numberanalytics.com/blog/ultimate-guide-to-skill-trees-in-game-design) ·
[A Guide to Designing Skill Trees (Orava, 2019)](https://www.theseus.fi/bitstream/handle/10024/192256/Orava_Santeri.pdf?sequence=1&isAllowed=y) ·
[Thronefall Wiki — Leveling](https://game.wiki/thronefall/leveling) ·
[PoE 2 Keystone Passives](https://www.rpgstash.com/blog/path-of-exile-2-best-keystone-passives-guide)
