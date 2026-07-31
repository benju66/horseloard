# BACKLOG.md — Horse Lord

## ▶ START HERE (updated 2026-07-31)

**Branch: `3d-migration`, 17 commits ahead of `main`, unmerged.** `main` is still the
shipped Phaser 2D build. Read `MIGRATION-3D.md` too — it is authoritative for the
render swap while that is in progress.

**State:** the Phaser → Three.js migration is functionally complete (MG.1–MG.6 done,
MG.7 all but the merge). `/game3d.html` is the full playable game with real CC0 models.
The engine, data schemas and save layer were never touched — that is why it was cheap.

**Run it:** `npm run build && npm run preview -- --host` → `http://<lan-ip>:4173/game3d.html`
(use the production build for any fps judgement; dev understates it).

**Next task — the one open game problem:** archer and bombard each solo-carry maps 3–4.
Root cause found: **nothing hard-counters the Archer** — every entry in DESIGN §6's
Counters column is something an Archer can do, so no wave mixing will ever make you
want a second tower. Full analysis and four ranked options are written up in
**DESIGN §6 → "Open design problem"**. Recommended order: (C) make Shieldbearer's
frontal block genuinely punishing — data only, zero engine work — then (A) damage types
vs armor, which is how Kingdom Rush solves it. Success is measurable: `npm run bots`
reports `solo-carriers 0` on crossroads and warlords-march while win-rate bands stay
green and all four towers still appear in winning runs.

**Then:** audio (the largest missing feel element — the game is silent), then biomes and
more levels, which are cheap now that map lighting is schema data.

**Instruments — do not tune by feel:** `npm run bots` · `npm run balance` · `npm test`

---

Status legend: [ ] todo · [~] in progress · [x] done. Add a one-line "learned:" note under each completed task — this file is the project memory across sessions.

---

## M0 — Foundation (engine port)

Goal: prototype parity plus the gate siege, running as an installable PWA on a real phone, on a data-driven substrate.

### M0.1 — Scaffold
[x] Vite + Phaser 3 + TS strict project; vite-plugin-pwa (portrait manifest, icons placeholder); Vitest + Zod wired; Vercel deploy from main; `/reference/prototype.html` committed.
**Accept:** `npm run dev` shows a Phaser scene on desktop and on phone via LAN; Vercel URL installs as a PWA.
**learned:** Vite 7 + zod 4 + vite-plugin-pwa 1.x need no shims on Node 24; splitting Phaser into a manualChunk keeps app JS at ~88KB (Phaser ~332KB gz, precached by SW). Live at https://horse-lord.vercel.app (project `horse-lord`, auto-deploys from main; repo is benju66/horseloard — note the spelling). Manifest + SW verified 200. Ben: open the URL on your phone and Add to Home Screen to close the loop.

### M0.2 — Data schemas + seed content
[x] Zod schemas: tower, enemy, ability, wave, map (path waypoints, plots, gate/forge positions), meta-node. Seed JSON transcribed from the prototype's constants (4 towers stubbed as archer-only ok, 3 enemies, map = prototype layout). Boot-time validation, loud failures.
**Accept:** invalid seed data fails boot with path+field; `npm test` runs schema tests green.
**learned:** tower level cost modeled as "cost to ENTER the level" (levels[0].cost = build cost) keeps economy math uniform incl. 70% sell refund; per-file superRefine handles in-file refs, loader.ts owns cross-file refs (waves→enemies/lanes, meta→abilities/towers). Invented (not from prototype, need balance eyes): siegeDps, gate hp 100, branch stats, ability numbers, meta costs, per-wave hpMultiplier (1.17^(n-1) transcribed).
Schema requirements (design, don't over-build): towers need per-level stats + Lv4 branch pair + projectile ref + targeting mode enum; enemies need siege DPS + stagger flag + elite-eligible flag; waves are lists of (enemy, count, spacing, lane, delay) + optional archetype banner id; maps declare lanes as waypoint arrays.

### M0.3 — Simulation core
[x] Fixed-timestep sim loop decoupled from Phaser render; entity registry with stable IDs; path-follower (distance-along-lane, multi-lane capable); WaveRunner consuming wave JSON.
**Accept:** Vitest covers path position math and wave spawn timing; enemies visibly walk the prototype path at correct speeds.
**learned:** sim ticks at fixed 1/60 with a 0.25s frame clamp (advance() returns tick count — deterministic, testable); wave "clear" = spawning done && no *walking* enemies, so at-end leaks persist across phases (groundwork for M0.6 besiegers — "leaks never despawn" is already tested). Scene renders purely from sim state via onSpawn/onDeath callbacks; LanePath.positionAt writes into caller-owned vectors (zero per-tick allocation). 21 engine tests; verified visually — grunts walk the S-curve at 42 u/s with correct 0.86s spacing.

### M0.4 — Hero
[x] Dynamic thumb joystick (port prototype feel exactly — it tested well); movement clamps; auto-fire nearest-target within range; forge interaction (in-run bow levels); trample contact damage; stagger *received* from heavy enemies (shove + 0.4s control loss, per-enemy cooldown).
**Accept:** on-device: joystick feels identical to prototype; brute contact shoves the hero; grunt contact doesn't.
**learned:** hero balance lives in hero.json (bow track transcribed from prototype formulas: cost 30+28(l-1), dmg 8+5l, interval 0.52−0.045l, range 128+9l); economy.json seeded with startingGold only (M0.5 grows it). Invented, need feel-tuning on device: trample 6 dmg/1s per-enemy cd; stagger shove 45u over 0.4s, 1.2s per-enemy cd, no chain-staggers while already shoved (anti stun-lock). Kills pay gold directly as an M0.5 placeholder — coin drops/magnet/expiry replace it. Verified desktop: joystick drag, auto-fire clears wave 1, forge buy/disabled states. On-device check passed (Ben, 2026-07-30) — shove feel fixed in playtest-1 tuning (shove 70u + camera kick + red flash).

### M0.5 — Towers, projectiles, economy
[x] TowerEngine (build/upgrade/sell 70%/branch at Lv4) + ProjectileSystem (pooled) driven entirely by JSON; contextual world-space bubbles; coin drops, magnet, expiry, wave-clear sweep; EconomySystem with Vitest on costs/refunds.
**Accept:** adding a fake 5th tower via JSON alone makes it buildable in-game with zero engine edits (then delete it — this is the substrate test).
**learned:** SUBSTRATE TEST PASSED — a fake Ballista added to towers.json alone showed up as a second build bubble, built, fired, sold at 70%, then was deleted; zero engine edits. Projectile behaviors implemented: ballistic/instant/aoe (aura fails loud at TowerSystem construction until M1 needs it). Coins + projectiles pooled; sell refunds floor(invested×0.7) where invested = build+upgrades+branch. Sweep-on-clear also suppresses expiry mid-flight. Wave-clear bonus = 10+3×wave (prototype).

### M0.6 — Gate siege
[x] GateSystem: walker→besieger state change at path end, ~5 attack slots + overflow queue, per-type siege DPS, gate HP, repair interaction (coin sink), damage-taken tracking for stars, loss at 0 HP.
**Accept:** Vitest covers the state machine and slot allocation; on-device: let three brutes through, watch them batter the gate, ride back, kill them, repair.
**learned:** enemy states became walking→to-slot→at-slot (besiegers WALK to their slot at own speed — reads as a mob forming, no teleports); only slot occupants deal siegeDps, queue looms behind and promotes on death. Victory now requires a clean field on the final wave (leaked besiegers block 'done' — ride back and break the siege, per the design's comeback fantasy). Repair is build-phase only, chunked (+20hp for ceil(20×0.5)=10g), and never reduces totalDamageTaken (stars). Defeat freezes the sim.

### M0.7 — Run loop + HUD
[x] Start wave / early-start bonus; wave counter, gold, gate HP HUD; results screen (waves, kills, damage taken); restart.
**Accept — M0 EXIT:** full run start-to-finish on phone, installable, 60fps with 40+ enemies and pooled projectiles (verify with Phaser's FPS overlay on-device). Feels at least as good as the prototype.
**learned:** early-start bonus = ceil(maxBonus × remaining/window), shown live on the Start button ("Start wave +15"), zero before wave 1; results screen shows waves/kills/damage-taken and restart rebuilds a fresh Simulation (scene fields all reset in create() — Phaser reuses scene instances). FPS overlay: always in dev, ?fps=1 in prod. Verified in-browser: full defeat run (parked hero, let wave 1 leak, siege mob chewed the gate 100→0), results, Ride again → pristine state. M0 EXIT CONFIRMED on-device (Ben, 2026-07-30): installed as PWA from horse-lord.vercel.app, full runs played, 60fps confirmed during busy waves. M0 closed — 5 commits, 81 tests, substrate rule proven.
**playtest 1 (Ben, 2026-07-30):** coins feel great (locked); shove felt like nothing → shoveDistance 45→70 (faster than gallop), harder camera kick, rider flashes red during control loss; cleared all 8 waves with ONE tower → built `npm run balance` (headless lazy-baseline: 1 tower, parked hero, greedy upgrades) and retuned waves 4–8 (runner floods, denser brute trains, hp tail 2→4.2×) until the lazy baseline DIES on wave 7 (4 leaked brutes take the gate). Peak alive count 40 = the perf budget. Verdict: "good very very early proof of concept".

---

## M1 — Vertical slice (Map 2: The Ford)

Goal: one map at publishable quality — the go/no-go gate for art spend.

[x] Map 2 layout (split-and-rejoin lanes), authored 10-wave set incl. one special archetype with banner
[x] All 4 towers real, with Lv4 branches
[x] 5 enemy types + elite modifier
[x] All 3 abilities + ability bar (Charge free; others unlocked-by-flag for now)
[x] Sprite art pass: Kenney/CC0 base, composite horse+rider hero (see DESIGN.md §10), ASSETS.md current
**learned:** Kenney Medieval RTS (CC0) is the style match — 12 sprites shipped (5 enemies, 4 towers + spinning mill blades, gate castle, forge smithy), keys = data spriteRefs so rendering stays data-driven; artless refs fall back to vector shapes (substrate holds). Ground/path stay vector (grid retiling not worth it; flat style matches). The mounted hero is now GENERATED art: scripts/generate-hero-sprites.py draws a 4-frame gallop strip (Pillow, 4x supersampled) — Claude is the commissioned artist; iterate by editing the script. Projectile/coin sprites stay vector (reads fine).
[ ] Audio pass: SFX set + two music states with crossfade (DEFERRED per Ben 2026-07-30 — not a current priority)
[x] Juice pass: hit flash, screen shake, particles, coin pitch streaks, haptics (coin PITCH streaks are audio-coupled — land with the deferred audio pass)
**learned:** one 4px generated texture + four tinted emitters covers all bursts (death puff, elite gold, coin pop, blast debris — Phaser pools internally, no per-frame alloc); frost aura pulses now render as faint expanding rings (doubles as gameplay info); haptics via navigator.vibrate — heavy-kill 18ms, leak-reaches-gate 35ms + small shake, stagger 45ms, defeat pattern — all try/catch no-ops on desktop.
[x] Star scoring on damage taken
**learned (mechanical slice, 2026-07-30):** all four towers + branches are pure data — Frost's Deep Freeze/Brittle are just different aura defs, Bombard's Cluster/Concussion different aoe defs; engine grew slows/stuns+vulnerability, facing+frontal block, elite rolls, auras, bomblets, mill income, beacon towerAura, crits, rate buff, AbilitySystem (charge = stagger-immune escape). The Ford: 3 banner waves (raid/horde/war-party), ford-island premium plot; ?map= param picks maps until MapSelect (M2). Lazy baseline dies w5-6 of 10 — one unanswered leak grinds the gate over minutes, the map's core lesson. 24 new tests (96). Plot-coverage audit (playtest 2, Ben questioned placement): scratchpad geometry script found upper-bank covered ZERO lane at frost range, shores were half-value, and the gate funnel had a 76u dead zone — repositioned all five inner plots; dead zones at archer range now only the spawn run-in + two <20u slivers. Coverage evaluation = pre-art (done); feel tuning = every playtest. Playtest 3 (Ben: some plots useless at L1 range): meadow-road audit found plot-5 covered ZERO lane at EVERY L1 reach (132u from path — inherited broken from the prototype layout) and plot-3 was frost-dead; both moved. Regression guard added: mapCoverage.test.ts asserts every plot on every map covers >=40u at the weakest L1 reach (computed from towers.json) — the dead-plot bug class is extinct.
**Accept — M1 EXIT:** an outside playtester finishes Map 2 unprompted and can articulate the loot-vs-defend tension. Ben's call: does one map sing?

---

## M2 — Campaign [x 2026-07-30]
Maps 1, 3, 4 · full enemy roster · Warlord boss (war-cry, tower-break, sieges on leak) · supply drops · Looter · map select + linear unlocks · results/stars persistence.
**learned:** all traits are generic config flags (ignoresSlows, lootsCoins, warCry, towerBreak) — the Warlord is pure data; LooterSystem drives a 'looting' state (seek coin → grab → flee up-lane; killed = drops the haul, escaped = your gold is gone); supply drops are per-wave authored chests (no magnet — ride onto them, shared timer bar). Crossroads (12w) + Warlord's March (14w, boss w14 ×1.6) authored; coverage guard validated all new plots automatically.

## M3 — Meta [x core 2026-07-30]
Token economy + loss payout · meta tree UI + effects (free respec) · endless mode generator + milestones · save versioning proven with one real migration · telemetry (Supabase table: map, wave reached, gold curve, tower comp, death cause) · balance pass.
**learned:** meta tree = pure data transform (applyMetaModifiers rewrites hero/economy/towers/map copies pre-sim — engine never knows the tree exists); abilities now genuinely gated by tree nodes (flag removed); SaveManager owns IndexedDB (schema v1, migration switch ready); settleRun is pure+tested-by-design (stars pay first-time delta, defeat pays per wave, endless pays per new milestone); endless generator = budget/weights on the wave schema. Remaining for M3: a real migration when v2 arrives, telemetry (parked — solo game), balance pass (ongoing via npm run balance + Ben).

## Dev tooling

[x] Headless bot players + substrate guard (2026-07-30)
**learned:** the sim was already bot-ready — `new Simulation(data, rng)` threads ONE injectable rng through every system, so seeded runs replay exactly. `src/engine/bots.ts` adds three content-agnostic policies (defender / rider / mixed) that rank towers by a value-per-coin model computed from schema stats — a new tower gets evaluated the day its JSON lands, zero bot edits. `npm run bots` = every bot × every map × 5 seeds; `npm run balance` now auto-covers all 4 maps via loadGameData() (hand-calibrated configs kept for meadow-road/the-ford so the tuning reference doesn't move — they still die w7/w5; crossroads + warlord's march get derived configs, parked at the gate). Coverage math extracted to `src/engine/coverage.ts`, shared by the bots and the plot guard. substrate.test.ts now enforces CLAUDE.md #1 by scanning engine sources for content ids (via import.meta.glob ?raw — no @types/node needed); known hole: ability id "charge" collides with effect type 'charge', so that literal can't be policed.
[x] Bot economics fix + forced-composition probe (2026-07-30)
**learned:** the first bot valuation scored income *instantaneously*, so a mill read as ~1 dps and no bot ever built one — a bug in the bot, not a verdict on the tower. Now split into combatValue / incomeValue / supportValue: income is scored as the fighting power its gold buys over the *remaining* run (horizon derived from the sim's own clock — avg wave duration × waves left, self-correcting), and towerAura counts the actual neighbours in radius. Mills went 0 → ~45-60 builds. Added `forcedComposition(towerId)` — a bot forbidden from building anything else — because free-choice preference only measures what the scoring function likes. THAT is the instrument for "is this tower dead weight"; a CONTROL_TO_DPS sweep (22/32/40/60) showed the greedy scorer flips between monocultures at every weight, so the preference column is not evidence about tower strength and is now labelled as such in the output.
**verdict (supersedes the first run's tower column):** all three combat towers solo-carry every map at 100% — archer 3.0★/0 dmg, bombard 2.8★/1, frost-spire 2.5★/3; mill 35% (correct — it's economy, it can't kill). Bombard is NOT dead weight. Frost is the WEAKEST carry, not dominant, so the Deep Freeze stacking mechanic — real in code — is not what's breaking balance and nerfing it would hit the weakest tower. Tower balance looks genuinely good. The actual problem is difficulty: any single combat tower plus an active hero (all abilities unlocked) beats all four maps. That's the number to tune, and it's a feel call.

**first run found (tower column later disproven — see above):** (1) 59/60 bot runs WIN — the campaign has no ceiling for competent play with all abilities unlocked. (2) Deep Freeze stacks toward a permanent lock: one spire is 1s freeze per 2.4s tick (42% uptime), but applySlow takes the strongest factor and max()es duration, so 3+ overlapping 95u auras ≈ 100% uptime; bots built 4–8 and took 0 damage. Real mechanic, not a scoring artifact. (3) crossroads' LAZY baseline clears all 12 waves — too soft. (4) bombard + mill built in 0 runs, but that is NOT yet evidence they're dead — the bot scores income instantaneously (undervalues the mill's compounding) and its splash model is a guess. Fix the bot's economics before trusting that column.

## M3.5 — 3D render migration [in progress]
Plan and per-task tracking live in **MIGRATION-3D.md** (Part C) — that file is authoritative while the swap is in progress.
[x] MG.1 boundary audit — **GO** (2026-07-30). Zero Phaser imports outside the render layer; zero engine/data imports from scenes or ui; no render concerns in the engine. Headless proof came free from the bot harness (full campaigns, no canvas). Render surface to port = 1,612 lines (GameScene 914). The one coupling to plan for is spriteRef/sfxRef in the *data schemas* (5 files, 34 JSON occurrences), read by exactly two scene files — a clean data↔renderer seam, and Part B §2 already scopes it.
[x] Part B documentation amendments — DESIGN.md §9 (DOM overlay + ×1/×2 speed toggle), §10 (art plan replaced with low-poly 3D; the "one hard asset" problem is gone), §11 (stack + `/src/render` layout + model refs); CLAUDE.md stack, layout, and a new invariant #2: `/src/render` never contains game logic, `/src/engine` never imports `three`.
[ ] MG.2 — branch + scaffold. **Blocked on Ben:** the timebox for the kill criterion is set at MG.2 kickoff and is still unchosen.
**learned:** the migration is affordable because the substrate rule held — the audit found nothing to fix, which means MG.1 was closer to a formality than a gate. The decision with real consequences is MG.2. Suggested amendment to Part C: MG.2's smoke test should include ~40 animated meshes, not just a spinning cube — a cube proves the toolchain, but the thing that can actually kill this migration is 40 SkinnedMeshes at 60fps on a 2021 Android, and that should fail early while falling back is still cheap.

## Open — abilities evaluation
[x] **Charge only ran left or right** (Ben, 2026-07-30) — a real bug, not a design question. `HeroSystem.move()` continued a released-stick charge along `dir`, which is a left/right *sprite-mirror flag* derived from horizontal input only, never a heading. Steering up and charging launched the hero sideways at full speed. Added a true `headingX/headingY` pair; `dir` still exists for 2D sprite mirroring. **This bug is in the Phaser build too** — a mirrored sprite just made it easy to miss. 3 regression tests.
[ ] **Charge doesn't make sense** (Ben, 2026-07-30, playing the 3D build). Parked deliberately: the 3D build has zero FX, so Charge currently changes sim state (speed burst, boosted trample, stagger immunity) with no visual whatsoever — it cannot be judged until MG.6 lands particles, camera kick and a speed read. If it still doesn't make sense with feedback, this is a DESIGN §4 pillar problem, not a tuning problem: Charge is the identity verb, and the three-ability loadout would want revisiting whole. See DESIGN §15.7.

## Difficulty pass [1 of n]
[x] Campaign difficulty curve (2026-07-31)
**learned:** put a measurable target on "hard enough" before touching anything — `DIFFICULTY_TARGETS` in bots.harness.test.ts now reports actual vs intended per map, so tuning has a scoreboard instead of a vibe. Result: meadow-road 100% (target 90-100), the-ford 100→87% (70-95), crossroads 93→60% (45-75), warlords-march 67→33% (25-55). All four in band; there is now a curve where there was none.
**economy hypothesis was WRONG, and worth remembering.** Bots were finishing runs with 337-978g spare, so gold plainly was not a constraint and DESIGN pillar 2 names economy pressure as *the* difficulty lever. Steepening the late cost curve (Lv3 +64%, branch +80%) made the campaign marginally EASIER — 93→100% on crossroads. Leftover gold is a symptom, not a cause: the bots simply do not need the towers the gold would buy. Reverted.
**the curve is on a knife edge.** A coarse sweep found win rate collapsing 100% → 27% between hp×1.0 and hp×1.4. Final scaling is therefore small and per-map: the-ford hp×1.12/count×1.05, crossroads ×1.20/×1.08, warlords-march ×1.26/×1.10. Worth knowing that any future content change can flip a map from trivial to impossible without much warning.
[ ] **Solo-carry still unsolved on maps 3-4.** Archer and bombard each still clear crossroads and warlords-march alone, so composition is still preference rather than decision. Frost dropped out of the carry list, consistent with it being the weakest carry all along. Wave composition is already varied (shieldbearers, swarms, wolf-riders all present and mixed), so more mixing is not obviously the answer — a maxed archer branch simply out-DPSes the counters. This may need a mechanical change rather than a data one, and that is a design conversation, not a tuning pass.

## M4 — Publish polish
Map 1 as diegetic tutorial · settings (audio, haptics, left-hand mode) · colorblind-safe enemy palette check · icons/splash/store-listing draft · performance pass on real devices · soft launch to friends · TWA wrapper decision for Play Store.

---

## First session prompt

> Read CLAUDE.md and DESIGN.md. Execute M0.1 and M0.2 from BACKLOG.md. Stop after M0.2 and show me the schemas before building any engine code against them.
