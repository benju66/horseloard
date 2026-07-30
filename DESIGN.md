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

Portrait orientation, one-handed playable if abilities are ignored. Safe-area insets respected (notches). Haptics via Vibration API on kills of brutes/bosses and keep damage (subtle, toggleable). Pause on visibility change. No pinch-zoom; camera is fixed per map in v1 (maps sized to a 9:19.5 worst case, letterboxed elsewhere) — a scrolling camera is a v2 question only if map 5+ wants bigger spaces.

---

## 10. Art Plan

**Phase A (build everything on free CC0).** Kenney packs are the backbone — his top-down tower defense, medieval, and particle packs are CC0, stylistically consistent, and cover towers, enemies, tiles, projectiles, and UI. Fill gaps from itch.io CC0/CC-BY packs.

**The one hard asset: the mounted archer.** Directional horse-and-rider animation is the rarest thing in free packs. Strategy, in order: (1) hunt itch.io for a top-down or ¾-view mounted character pack; (2) composite — separate horse sprite + rider sprite layered, which also lets us do mount/dismount later; (3) if the game proves out, **commission exactly this one asset** (~$100–250 for a directional sheet) while keeping everything else pack-based. The hero is the face of the game; it's the single highest-leverage art dollar.

**License ledger from day one:** an `ASSETS.md` in the repo recording source, license, and attribution requirement for every sprite and sound as it's added. Retrofitting attribution before publishing is misery; maintaining it is one line per asset.

**Phase B (paid upgrade pass).** If the loop is great, replace wholesale with a purchased cohesive pack or commissioned set. Because all sprite refs live in the data configs, an art swap is a reskin, not a refactor. Consistent pixel density and palette discipline (pick one pack family, don't mix pixel scales) matter more than raw asset quality.

---

## 11. Technical Architecture

**Stack: Phaser 3 + TypeScript + Vite, deployed on Vercel as an installable PWA.**

Why Phaser over growing the vanilla prototype: sprite atlases, animation state machines, tweens, particles, audio (Web Audio with unlock handling), scene management, input pointers, and camera effects are all solved. The prototype's logic (path following, targeting, economy) ports directly into Phaser's update loop. Why not React/Next for the game itself: the game is a canvas, not a DOM; React only wraps the shell if at all. Vercel stays your deploy target either way.

```
/src
  /engine        # generic: TowerEngine, EnemyEngine, ProjectileSystem,
                 #   WaveRunner, EconomySystem, SaveManager
  /data          # towers.json, enemies.json, abilities.json,
                 #   waves/map01.json..., metatree.json, maps/*.json
  /scenes        # Boot, MainMenu, MapSelect, Game, MetaTree, Results
  /entities      # Hero, Tower, Enemy, Coin, Projectile (thin classes over configs)
  /ui            # joystick, ability bar, bubbles, wave preview, HUD
  /audio         # sfx/music manifest + manager
/public          # PWA manifest, icons, service worker (vite-plugin-pwa)
```

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
