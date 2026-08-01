# Horse Lord — Design & Technical Plan

**Version 0.3 — resolves hero damage (stagger), starting kit, selling, loss payout; co-op hedge**
A mobile-first tower defense PWA where you are the commander on the field: riding, shooting, looting, and building in real time.

---

## 1. Vision & Pillars

One sentence: *Kingdom Rush strategy meets survivor-game presence — you don't watch the defense, you ride through it.*

Three pillars. Every feature must serve at least one, and anything that fights them gets cut.

1. **You are on the field.** The hero isn't a cursor; positioning is the skill. Coins drop where enemies die, so greed pulls you toward danger. Every second is a routing decision: collect, reinforce, or intercept.
2. **Decisions over reflexes.** Auto-fire means the thumb steers and the brain plays. Difficulty comes from economy pressure and wave composition, never from twitch aiming. A broad audience can play; a strategist can optimize.
3. **Lean content, deep substrate.** Ship few towers, maps, and enemies, but build every one as data against shared engines so expansion is content authoring, not engineering.

Target audience: broad/publishable. That commits us to a real difficulty curve (gentle map 1, honest challenge by map 4), onboarding without a tutorial wall, juice (screen feel, audio, particles), and 60fps on mid-range Android.

---

## 2. Core Loop

**Second-to-second:** steer → auto-fire thins the wave → enemies drop coins → ride the loot line → coins magnet in.

**Minute-to-minute:** between waves, spend: build a tower, upgrade a tower, upgrade your bow at the forge, or bank for the next tier. Wave preview tells you what's coming so spending is a read, not a guess.

**Run-to-run:** finish a map → earn stars (1–3 by keep HP remaining) → stars and milestones pay **tokens** → spend tokens in the meta tree → replay for 3 stars or push the next map / endless mode.

The tension that makes it work: your body can only be in one place. The economy (loot on the ground) and the defense (leaks on the far lane) constantly want you in different places. Towers are how you buy the right to be elsewhere.

---

## 3. Game Structure

**Campaign** is the spine: discrete maps, authored wave sets, 1–3 stars per map. Stars score on **total gate damage taken**, not HP remaining (3★ = untouched, 2★ = light damage, 1★ = survived) — this matters because the gate is repairable (§ The Gate), and repairs must help you survive without letting you buy stars. Maps unlock linearly; some meta-tree nodes gate on total stars.

**Endless mode** unlocks per map after first clear. Reuses the map, procedurally escalates waves (composition weights + HP/speed multipliers), pays tokens at milestone waves (10/20/30…). This is the replay engine and costs almost nothing beyond the wave generator.

> ⚠ **Unresolved as of 2026-07-31.** Ben has confirmed the goal is *publishable* and
> wants distinct biomes/worlds with multiple levels each. That is in direct tension with
> the v1 commitment below, which exists for a reason worth re-reading before overriding:
> four maps took a full tuning pass to get into their difficulty bands, and the curve
> collapses 100%→27% between hp ×1.0 and ×1.4. Adding maps is cheap; making them good is
> not. Settle this explicitly — either revise the commitment with eyes open, or keep it
> and treat extra worlds as post-v1 content drops.

**v1 content commitment: 4 maps, single biome (grasslands), one boss.** Lean enough to ship, structured so maps 5–8 and a second biome are pure content drops. Rationale: better to tune 4 maps to publishable quality than spread across 8.

---

## 4. The Hero

**Movement.** Dynamic thumb joystick (spawns under the touch, anywhere on screen). Speed is a stat (meta-upgradable). The horse matters: hero is fast enough to cross the map in ~3.5s, making "ride to the problem" a real verb.

**Stagger, not death.** The hero can't die, but heavy enemies (brutes, wolf riders, shieldbearers, boss) shove and briefly stagger on contact — a short knockback with ~0.4s of lost control, per-enemy internal cooldown. Swarms, grunts, and runners can't stagger. Enemies get physical presence and can contest space — push you off a loot line, crowd you away from the gate — without death spirals, respawn timers, or an HP tuning surface. Positioning stays the entire skill; Charge doubles as the escape tool when heavies crowd you.

**Auto-fire bow.** Nearest-target priority within range. Damage, fire rate, and range upgrade in-run at the forge (coins) and persistently in the meta tree (tokens). In-run forge levels reset each run — the forge is a coin sink that competes with towers, which is the interesting choice.

**Active abilities** — the right-thumb layer. Three ability slots. **Charge is free from the start** — it's the identity verb (the horse as weapon), it makes the new player's instinct to ride into enemies correct, and it's the escape tool that pairs with stagger. Volley and Rally Horn are cheap early meta-tree nodes so the first token spends land immediately. One equipped loadout of up to 3 (v1 ships exactly 3 abilities; loadout choice becomes meaningful when the pool grows):

| Ability | Effect | Cooldown | Fantasy |
|---|---|---|---|
| Volley | AoE arrow rain at hero's position, big damage | 18s | Delete a clump you rode into |
| Rally Horn | All towers +50% fire rate, 6s | 30s | Commander buff, rewards tower investment |
| Charge | 1s gallop burst, tramples through enemies for damage + brief slow | 12s | Mobility + the horse as a weapon |

Design rule: abilities are position-dependent (cast at/from the hero), reinforcing pillar 1. No global "tap the screen anywhere" spells — that's the genre default we're deliberately not doing.

**Trample (passive).** Riding through enemies at speed deals small contact damage with an internal cooldown per enemy. Makes the horse feel physical; upgradable in the meta tree.

---

## 5. Towers — Small & Deep

Four launch towers, each with 4 levels, and levels 3→4 **branch** into a specialization choice (pick one, per tower instance). That's the "big upgrade tree" without UI sprawl: 4 towers × 2 branches = 8 endgame identities.

| Tower | Role | Branch A (Lv4) | Branch B (Lv4) |
|---|---|---|---|
| Archer | Single-target DPS, cheap, reliable | **Sniper** — huge range, crits | **Rapid** — fire rate, shreds swarms |
| Bombard | AoE, slow rate, ground only | **Cluster** — splits into bomblets | **Concussion** — adds stun |
| Frost Spire | Utility: slows in radius, low damage | **Deep Freeze** — periodic freeze | **Brittle** — slowed enemies take +25% dmg |
| Mill | Economy: generates coins over time, no attack | **Market** — more coins | **Beacon** — also auras nearby towers +dmg |

The Mill is the strategist's tower: it converts map safety into economy, and it's the first thing that dies if you let leaks wander — another reason hero positioning matters.

**Selling:** any tower can be sold for a 70% refund (ride to it, sell option in the bubble). Repositioning mid-map is legitimate strategy — tearing down an Archer to fund a Frost Spire where the Raid wave is coming is exactly the read the wave preview enables.

**Extensibility contract:** a tower is a JSON config (id, cost curve, stats per level, projectile def, targeting mode, branch defs, sprite refs, sfx refs) consumed by one TowerEngine. Targeting modes (nearest / first / strongest / none) and projectile behaviors (ballistic, instant, AoE, aura) are the small enum set the engine implements. Tower #5 (e.g., a Ballista with pierce, or a Tesla chain-lightning) is a config + assets, zero engine work, and slots straight into the meta tree as an unlock. First planned expansion tower: **Barracks** — rallies soldier blockers onto the path (Kingdom Rush lineage), deepening the fortress identity. Post-launch, not v1.

**Courtyard structure policy: exactly two — Gate and Forge.** Horse upgrades fold into the forge and meta tree rather than a separate Stable; every additional structure splits the same coin sink and dilutes the build decision instead of deepening it. Explicit non-goals inherited from the genre: town-building/resource chains, gacha or merge heroes, energy timers, tap-anywhere global spells, and free-form tower placement — fixed plots are load-bearing for authorable difficulty.

---

## 6. Enemies

Launch roster of 7 + 1 boss, all data-driven off one EnemyEngine (same contract philosophy as towers):

| Enemy | Gimmick | Counters |
|---|---|---|
| Grunt | Baseline | Anything |
| Runner | Fast, low HP | Frost, Rapid archer, hero intercept |
| Brute | Tanky, 3 keep damage | Bombard, Brittle combo |
| Shieldbearer | Frontal block: reduced damage from towers ahead of it | Hero (you can shoot it from behind), Bombard |
| Swarm | Dies in one hit, comes in packs of 8 | AoE, trample |
| Wolf Rider | Fast AND ignores slows | Raw DPS, Charge intercept |
| Looter | Beelines for ground coins, flees with them | Forces hero to prioritize loot — anti-greed |
| **Boss: Warlord** (map 4) | Slow, massive HP, periodically war-cries (speed buff to others), breaks one tower to Lv-1 on contact | Everything + focus fire; hero must kite |

Shieldbearer and Looter are the two that make *hero position* a counter, not just damage math — they're the roster's pillar-1 enforcers.

### ⚠ Open design problem: nothing hard-counters the Archer (found 2026-07-31)

Measured with the bot harness: **Archer alone clears maps 3 and 4. So does Bombard.**
Composition is therefore preference, not decision, and every level poses the same
question — which is the thing that would make twenty levels feel like one.

This is a design gap, not a tuning failure. Read the Counters column above: every
entry is something an Archer can do. Rapid shreds Swarms and Runners; Sniper is the
"raw DPS" that answers Wolf Riders; a tower placed beside a Shieldbearer simply
bypasses its 150° arc. **No enemy in the roster is one an Archer cannot answer**, so
no amount of wave mixing or HP scaling will make you want a second tower type. It has
already been tried: composition on maps 3–4 is varied and Archer still carries.

Every tower-defense game that keeps its roster relevant solves this with a *hard*
counter — something a tower cannot do at all, rather than does slightly worse.

**Option A — Damage types vs armor** (Kingdom Rush's solution, and the standard one).
Enemies gain `armor`; towers gain a damage type. Physical (Archer) is reduced by
armor; explosive (Bombard) and magic (Frost) ignore it. An armored enemy then hard-
counters Archer without being immune to it. *Cost: an enemy field, a tower field, and
one line where damage is applied.* Highest payoff per unit of work, and it maps
cleanly onto the four towers we already have.

**Option B — Binary immunities** (Bloons' solution). An enemy a tower literally cannot
damage or even target: flying units, or a shield that only breaks to AoE. Note §5
already describes Bombard as "ground only", which implies flyers were intended and
never built — that hook is sitting unused. *Strongest effect, but binary gates can
feel like gotchas and punish a player who cannot see why they lost.*

**Option C — Make the positional counter real** (our own idea, currently too soft).
Shieldbearer's frontal block is 0.25× over 150°. Widen the arc and deepen the
reduction so a front-facing single-target tower is genuinely useless against it, and
flanking or AoE becomes mandatory. *Cost: DATA ONLY, zero engine work* — the cheapest
possible test of whether hard counters fix solo-carry, and it reinforces pillar 1
because hero position becomes the answer.

**Option D — Barracks** (§5's planned expansion tower). Blockers are a non-DPS answer,
so they change the question rather than the numbers. *Cost: real engine work — friendly
units are a new entity type, not a projectile behaviour.*

**Recommended order: C, then A.** C is free and tests the hypothesis that hard counters
are what's missing. A is the industry-standard fix and cheap for what it buys. B and D
are bigger swings worth taking only once C and A are proven insufficient.

#### Result of option C (measured 2026-08-01)

C was implemented and **works on Archer, but cannot finish the job.** Block widened to
220° and deepened to 0.10×; Shieldbearer hp 55 → 38; twelve shieldbearers swapped to
grunts on warlords-march.

| | baseline | after C |
|---|---|---|
| archer solo-carry | 100%, damage taken 1 | **95%, damage taken 10** |
| crossroads carriers | 2 | **1** (archer defeated) |
| bombard solo-carry | 100% | **100% — unchanged** |

Three things the measurement established, none of them obvious beforehand:

1. **The engine already had the right asymmetry and needed no changes.** Projectile hits
   pass a source position and are blocked; blasts and auras omit it and bypass. A hard
   counter to single-target fire was already expressible in pure data.
2. **An uncounterable enemy punishes every composition, not the wrong one.** The first
   attempt kept hp at 55 and sent all four maps below their bands (warlords-march 33% →
   0%), because a Shieldbearer the Archer cannot kill does not merely absorb dps — it
   leaks and sieges the gate at 4 dps. Lowering hp is what makes the counter selective.
3. **Shieldbearer density controls the archer counter and general difficulty at once**,
   so on warlords-march the map is in-band *or* archer-free, not both: 32 shieldbearers
   → 7% win rate, 26 → 13%, 20 → 33% with archer carrying again.

**Option A will not finish it either.** A reduces physical damage by armor while
explosive and magic ignore it — that is another Archer counter. **Nothing in A, B or C as
written counters Bombard**, which solo-carries every map at 100% and is the more robust
carrier of the two.

**The designed answer to Bombard already exists and was never built.** §5's tower table
specifies Bombard as "AoE, slow rate, **ground only**" — the flyer hook option B refers
to. A flying enemy is the one thing an AoE ground mortar cannot answer at all. That makes
the remaining order **A (finish Archer) + B's flyers (counter Bombard)**, not A alone.

*Also noticed while measuring:* the bot valuation model picks Bombard in **0** runs out of
265 while forced-Bombard wins 100% of maps. **This is expected and already understood** —
`bots.ts` documents a 22/32/40/60 sweep of `CONTROL_TO_DPS` showing the greedy scorer
flips between monocultures rather than mixing (at 32 it builds only bombard, at 40 only
frost), because it takes the single best value-per-coin every time. The file already
says in as many words that the free-choice preference numbers are not evidence about
tower strength, and that the `[solo carry]` table is the instrument that answers that.
Nothing to fix; read the right table.

#### Result of option B — flyers (measured 2026-08-01)

Built: enemies gain `flying`, towers gain `targetsFlying` (default true). A ground-only
tower cannot see a flyer at all and holds fire. **War Raven** added; Bombard opts out, as
§5 always said it should. Ravens render ~16 units up with a wingbeat bob, because the
altitude *is* the explanation for why a tower will not fire — without it this reads as
the gotcha this section warned about.

| | baseline | after C + B |
|---|---|---|
| crossroads | carriers 2, win 60% | **carriers 0**, win 53% |
| warlords-march | carriers 2, win 33% | carriers 1, win 40% |
| archer solo | 100%, damage 1 | **95%, damage 27** |
| bombard solo | 100%, damage 14 | **90%, damage 50** |

**Crossroads meets the goal. Warlords-march does not** — archer still wins every seed
there.

Three findings worth keeping:

1. **Concentration beats sprinkling.** 24 ravens spread two-per-wave changed nothing; the
   hero picks off stragglers while holding the ground line. The same 24 in three flocks of
   eight broke both carriers. A counter must arrive faster than the hero can absorb it.
2. **The hero shoots flyers, so no tower-level immunity is a hard counter on its own.**
   Solo-carry always means "that tower *plus the hero*". Any future counter has to beat
   the pair, not the tower.
3. **More counter is not monotonically better.** Adding six shieldbearers to warlords made
   it worse on both axes at once (40% → 20% win, carriers 1 → 2), because enemies the
   archer cannot kill leak and siege, punishing every composition rather than the wrong
   one. The same trap as option C's first attempt.

**Still open:** archer on warlords-march. Option A (damage types vs armor) is the
untried lever and is the natural next step, since armor is another archer counter and
warlords has ~15 points of win-rate headroom to spend.

#### RESOLVED 2026-08-01 — option A closed it

`npm run bots` reports **ON TARGET**: `solo-carriers 0` on crossroads and
warlords-march, every win-rate band green.

| map | win | carriers |
|---|---|---|
| meadow-road | 100% ✓ | 3 (allowed) |
| the-ford | 73% ✓ | 2 (allowed) |
| crossroads | 60% ✓ | **0** ✓ |
| warlords-march | 40% ✓ | **0** ✓ |

Tower balance improved on the way rather than degrading, which was the clause worth
protecting: forced-composition win rates were 100/100/55/10 and are now 60/85/80/5 —
archer, bombard and frost within 25 points of each other.

**What A added:** enemies gain `armor`, projectiles gain `ignoresArmor`. Explosive and
magic bypass armor; physical does not. The Brute carries 0.45. Armor applies *before* the
facing block, so the two counters stack multiplicatively rather than one masking the
other.

**The decision that made it work:** the hero's own arrows must ignore armor
(`hero.bow.projectile.ignoresArmor`, in data). With them armor-affected, Brute armor at
0.6 sent three maps out of band while barely denting solo-carry, and 0.15 was *worse than
no armor at all*. The hero is the player's baseline damage, so armor on a common enemy is
a flat tax on every composition rather than a lever on tower choice. Bypassing it makes
armor a pure tower-composition question, which is the whole point of the mechanic.

**All three counters were needed, and none sufficed alone:**

| | counters | mechanism |
|---|---|---|
| C — frontal block | archer | positional; flank or use AoE |
| B — flyers | **bombard** | ground-only towers cannot fire at all |
| A — armor | archer | non-positional; explosive/magic bypass |

Warlords-march needed its wave budget re-priced around them: brutes 50 → 22, ravens 24,
shieldbearers 20 → 26, filler trimmed; 312 → 275 bodies. Proportionally more of what
demands an answer and less of what merely walks — a better wave list, not just an easier
one.

**Success is measurable, not a feeling:** `npm run bots` must report `solo-carriers 0`
on crossroads and warlords-march, while the win-rate bands in `DIFFICULTY_TARGETS`
stay green and all four towers keep appearing in winning runs. The last clause matters —
the towers are currently well balanced against each other, which is rare and worth not
breaking on the way to fixing this.

**Elite modifier:** any enemy can spawn crowned (~1 in 12, weighted up in later waves and endless): +150% HP, +100% coin drop, visible glow. One multiplier system on the existing roster — perceived variety doubles at near-zero cost.

### The Gate (leaks don't despawn — they siege)

An enemy that reaches the end of the path doesn't vanish and subtract HP; it stops at the gate and batters it (per-type siege DPS: swarm chip damage, brute heavy blows, boss devastating). Consequences, all deliberate:

- **A leak is a fixable problem.** Ride back, kill the besiegers, save the run. Comebacks exist; a single wolf rider slipping through is a fire alarm, not a paper cut.
- **Late waves become fortress defense naturally.** When multiple enemies pile on the gate, the map's climax is a courtyard battle — the fortress-defense fantasy earned through the TD skeleton, not bolted beside it.
- **Repair is a coin sink.** Ride to the gate between waves and spend coins to restore HP. It competes directly with tower and forge spending (patch defense vs. build offense) — but stars score on damage *taken*, so repair aids survival, never the score chase.

Engine note: "reached end" is an entity state change (walker → besieger, new position slot at the gate, attack loop), not a despawn. Gate slots cap simultaneous attackers (~5); overflow enemies queue behind — which visually reads as a siege mob. The rule has no exceptions: even the Warlord reaching the gate sieges (devastatingly) rather than ending the run instantly — the comeback door is never fully closed.

---

## 7. Economy

**Coins (in-run, reset).** Sources: kills (per-enemy value), wave-clear bonus, Mill towers, map completion. Sinks: tower build/upgrade/branch, forge bow levels, gate repair. Coins physically drop and magnet within ~80px — the loot line is gameplay. Uncollected coins expire after ~12s (soft pressure; Looters make it hard pressure).

**Tokens (meta, persist).** Sources: stars (first-time: 10/star), endless milestones, achievement one-offs. Deliberately no coin→token conversion — meta pace stays under design control.

**Meta tree** (~25 nodes at launch, three branches):

- **Hero:** move speed, bow damage/rate/range floor, trample damage, stagger resistance, ability unlocks (Volley, Rally Horn) + ability level-ups
- **Towers:** unlock Frost Spire and Mill (Archer + Bombard are free from map 1), per-tower stat nodes, build-cost reduction
- **Kingdom:** starting gold, gate max HP, repair cost reduction, coin magnet radius, coin expiry time, wave-preview detail

**Free respec, always.** No monetization means no reason to punish experimentation; respec friction is dark-pattern residue.

**Loss payout:** tokens are earned per wave cleared even on defeat. This is the rubber band that makes a hard endgame compatible with a broad audience — a failed run is progress, never wasted time.

**Wave-clear sweep:** any coins still on the ground when a wave ends auto-fly to the hero. No tedious sweeping between waves, and it's a free feel-good beat on every clear. (Coin expiry and Looters therefore only threaten coins *during* combat, which is when the pressure is interesting.)

Tuning target: a full campaign clear at mostly-2★ should fund roughly 40% of the tree; the rest comes from 3★ chases and endless — that's the replay motor.

---

## 8. Maps & Wave Design

Four grassland maps with escalating spatial complexity:

1. **The Meadow Road** — single lane, gentle S-curve. Teaches: build, loot, forge. 8 waves.
2. **The Ford** — lane splits and rejoins around a river crossing. Teaches: split attention, hero routing. 10 waves.
3. **Crossroads** — two spawn points, two lanes, shared keep. Teaches: you cannot cover both; towers must own a lane. 12 waves.
4. **The Warlord's March** — long dual-path gauntlet, boss on wave 14. Final exam.

Wave authoring is data: each wave is a list of (enemy, count, spacing, lane, delay) entries. Authored for campaign; the same schema is fed by a generator (budget-based, composition weights per wave number) for endless. Every wave shows a preview icon strip during build phase — informed spending is pillar 2.

**Special wave archetypes:** named waves announced with a warning banner — **Horde** (mass swarm), **Raid** (runners flood one lane), **War Party** (brutes fronted by shieldbearers). Pure data on the existing wave schema; the banner turns the wave preview from informational into dramatic. Each map features 1–2; endless rotates them on milestone waves.

**Supply drops:** occasionally mid-wave a chest lands *off-path* and despawns in ~10s. Free coins if you ride for it — one more force pulling the hero somewhere the defense doesn't want them, which is the core tension. Frequency is a data dial; Looters and supply drops must never overlap in the same wave (attention overload).

Between-wave flow: manual "Start wave" with an optional early-start coin bonus (scaling with time remaining). Rewards confident players, never punishes deliberate ones.

---

## 9. Controls & Mobile UX

Left thumb (anywhere): dynamic joystick. Right thumb: up to 3 ability buttons, bottom-right arc. Contextual world-space bubbles for build/upgrade/forge (ride close → bubble → tap), exactly as prototyped — it tested well because it needs zero UI literacy.

Behavior is unchanged by the 3D render swap; the controls layer becomes a **DOM overlay** above the canvas rather than in-canvas drawing, with world-anchored elements (build bubbles, damage numbers, HP bars) positioned by world→screen projection each frame. A **game speed toggle (×1/×2)** rides the fixed-timestep sim as a tick multiplier and is persisted in settings; "Auto" battle is explicitly rejected — that's idle-game DNA and violates pillar 1.

Portrait orientation, one-handed playable if abilities are ignored. Safe-area insets respected (notches). Haptics via Vibration API on kills of brutes/bosses and keep damage (subtle, toggleable). Pause on visibility change. No pinch-zoom; camera is fixed per map in v1 (maps sized to a 9:19.5 worst case, letterboxed elsewhere) — a scrolling camera is a v2 question only if map 5+ wants bigger spaces.

---

## 10. Art Plan

**Stylized low-poly 3D** (Kingshot-class mobile look), rendered with Three.js. Full specification in `MIGRATION-3D.md` Parts A and A.1; the essentials:

**Look.** Fixed orthographic camera, high angle, portrait framing — no player camera control in v1. Dusk lighting: cool desaturated ambient over the terrain, warm light pooled on the path corridor, so lighting *is* the readability system. Flat palette texturing (one small gradient texture serves every model), no PBR. Soft blob shadows, not crisp shadow maps. Per-unit team rings under every unit — red enemies, blue hero — as the faction read at chibi scale. Sparse props clustered at path edges, ~15–25 per map, large negative space elsewhere.

**Characters.** Chibi proportions, ~2–2.5 heads tall, chunky silhouettes, oversized weapons. ~6 base models stretched across the whole roster by composition, scale, and tint — a Runner is a Grunt at 0.9×, a Warlord is the large base at 1.8× with crown and cape props. Never source a unique model when a variant works.

**Phase A (build everything on free CC0).** Kenney, Quaternius, and KayKit glTF packs are the backbone; pick one pack family per category so proportions stay consistent. The mounted hero is a composite — rider mesh parented to horse mesh — which also gives mount/dismount for free later. The old "one hard asset" problem is gone with it: directional horse-and-rider animation was the rarest thing in free *sprite* packs and is a non-issue with a real rig.

**Proportion gate.** Every character must read as one family. When evaluating a pack, drop one model next to the hero at gameplay zoom on-device — if proportions clash, reject the pack, don't mix. If no CC0 family hits the target across the roster, that discovery is the Phase B trigger.

**License ledger from day one:** an `ASSETS.md` in the repo recording source, license, and attribution requirement for every model and sound as it's added. Retrofitting attribution before publishing is misery; maintaining it is one line per asset.

**Phase B (paid upgrade pass).** Paid model packs, or a commissioned matched chibi set (hero + core enemy archetypes). Because all model refs live in the data configs, an art swap is a reskin, not a refactor.

---

## 11. Technical Architecture

**Stack: Three.js + TypeScript + Vite, deployed on Vercel as an installable PWA.**

Why Three.js and not Unity: Unity WebGL is incompatible with the PWA goals — 20MB+ bundles, poor mobile-browser performance, opaque builds. Three.js is web-native, tree-shakeable, and low-poly + ortho camera + one shadow-casting light is its bread and butter. Why not React/Next for the game itself: the game is a canvas; React only wraps the shell if at all. Vercel stays the deploy target either way. (M0–M3 shipped on Phaser 3; the render layer swaps to Three.js per `MIGRATION-3D.md`, and only the render layer — the migration is affordable precisely because the substrate rule held.)

```
/src
  /engine        # generic: TowerEngine, EnemyEngine, ProjectileSystem,
                 #   WaveRunner, EconomySystem, SaveManager  — UNTOUCHED by the render swap
  /data          # towers.json, enemies.json, abilities.json,
                 #   waves/map01.json..., metatree.json, maps/*.json  — UNTOUCHED
  /render        # scene, camera, lights, entity views, decals, fx  (replaces /scenes)
  /entities      # Hero, Tower, Enemy, Coin, Projectile (thin classes over configs)
  /ui            # DOM overlay: joystick, ability bar, HUD, wave banner,
                 #   world→screen projection for bubbles/HP bars/damage numbers
  /audio         # sfx/music manifest + manager
/public
  /models        # CC0 glTF/GLB, palette-textured
                 # PWA manifest, icons, service worker (vite-plugin-pwa)
```

Data schemas carry **model refs** (`model`, `clip`) where they used to carry sprite refs. The engine never reads either — it doesn't know the fields exist; the renderer does.

**The substrate rule:** `/engine` never imports from `/data` specifics — it consumes schemas. All balance lives in JSON. This is what makes "start lean, expand forever" true, and it also means a future balance patch is a data deploy.

**Save state:** IndexedDB via a thin SaveManager (schema-versioned from day one — migrations are cheap now, painful later). Single profile in v1; the versioned schema makes multi-profile a cheap add if it's ever wanted. Stores: campaign stars, token balance, meta-tree state, settings, endless bests. **Supabase sync is a v2 add** — same SaveManager interface, cloud adapter behind it, anonymous auth → optional account link. Design the save schema now as if it will sync (no derived state, timestamps on writes).

**Co-op hedge (long-term, deliberately minimal):** fixed-timestep simulation, game logic fully separated from rendering, stable IDs on every entity. That keeps future co-op *possible*. Nothing more — no command queues, no determinism guarantees, no netcode-shaped abstractions until a co-op version actually exists.

**Performance budget:** 60fps on a ~2021 mid-range Android. Object pools for projectiles/coins/particles (the prototype already showed coin volume spikes), sprite atlases not loose files, capped particle counts, no per-frame allocation in hot loops. Test on real hardware early — your phone is the dev target, not desktop Chrome.

**Telemetry (pre-publish):** even a homemade endpoint logging (map, wave reached, gold curve, tower composition, death cause) transforms balance tuning from vibes to data. You've built exactly this kind of pipeline before; a Supabase table is enough.

---

## 12. Audio

SFX from CC0 (Kenney audio packs cover UI/impacts; freesound for the rest): bow release, hits per enemy weight class, coin pickup (satisfying, slight pitch-up on streaks), build/upgrade thunk, ability casts, keep damage alarm, wave horn. One music loop per phase (build-calm / wave-tension) with crossfade, plus boss layer. Mute toggles for music/sfx separately, persisted. Audio is disproportionately responsible for "feels like a real game" — it's in the v1 bar, not the polish bar.

---

## 13. Difficulty & Tuning

Broad audience means: map 1 is nearly unloseable, map 4 3★ is genuinely hard, and *the meta tree is the rubber band* — a stuck player earns tokens from partial runs and comes back stronger. That's how survivor-likes made hard games mass-market, and it's our model. Explicit tuning dials all in data: enemy HP/speed multipliers per map, coin drop rates, early-start bonus, token payouts, meta node costs. One difficulty setting at launch; the meta tree does the personalization.

---

## 14. Roadmap

**M0 — Foundation (engine port).** Phaser + Vite + TS scaffold, PWA shell, prototype logic ported, data schemas defined, placeholder art. Exit: prototype parity, installable on your phone.

**M1 — Vertical slice.** Map 2 (The Ford) fully real: 4 towers with branches, 5 enemy types, 3 abilities, sprite art, audio, juice pass, star scoring. Exit: *one* map that feels publishable. This is the go/no-go gate for art spend.

**M2 — Campaign.** Maps 1, 3, 4, full roster, boss, wave authoring for all, map select, results screen.

**M3 — Meta.** Token economy, meta tree UI + effects, endless mode, save versioning, balance pass with telemetry.

**M4 — Publish polish.** Onboarding (map 1 as diegetic tutorial), settings, haptics, icons/splash, performance pass on real devices, soft-launch to friends, iterate.

Sequencing logic: M1 before content breadth because "best game possible" is decided by whether one map sings — everything after is multiplication.

---

## 15. Open Questions (parked, decide later)

Resolved as of v0.3: hero damage (stagger, no death), tower selling (70%), starting kit (Charge + Archer + Bombard), loss payout, respec, profiles, boss leak rule.

Still parked, none blocking:

1. **In-run draft choices** (survivor-style pick-1-of-3 on wave clears): v2 candidate if runs feel samey after M2 playtests.
2. **Player-set tower targeting** (first/strong/near): v2 depth add for strategists.
3. **Monetization:** none assumed. If publishing broadly ever means monetizing, cosmetics-only; the meta tree must never be purchasable or the design collapses.
4. **Co-op design** (long-term): hedged in architecture (§11), otherwise out of scope until v1 ships.
5. **Second biome theme** for maps 5–8 (frost? desert?) — content drop, decide at M3.
6. **Name.** "Horse Lord" is a working title.
7. **Abilities need a real evaluation** (Ben, 2026-07-30, on the 3D build): *"charge doesn't make sense"*. This is not a small note — §4 makes Charge the **identity verb**: the horse as weapon, the thing that makes a new player's instinct to ride into enemies correct, and the escape that pairs with stagger. If it does not read as any of those, a pillar is wobbling and the whole three-ability loadout wants revisiting, not patching. Deliberately parked until the 3D build has FX (MG.6) — a Charge with no particles, camera kick or speed read is indistinguishable from a dead button, so it cannot be judged fairly yet. Re-evaluate on device once feedback exists, and treat the answer as a design decision rather than a tuning pass.
