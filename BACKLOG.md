# BACKLOG.md — Horse Lord

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
[ ] Sprite art pass: Kenney/CC0 base, composite horse+rider hero (see DESIGN.md §10), ASSETS.md current
[ ] Audio pass: SFX set + two music states with crossfade
[ ] Juice pass: hit flash, screen shake, particles, coin pitch streaks, haptics (partial: hit flash, stagger/banner shakes, blast rings exist)
[x] Star scoring on damage taken
**learned (mechanical slice, 2026-07-30):** all four towers + branches are pure data — Frost's Deep Freeze/Brittle are just different aura defs, Bombard's Cluster/Concussion different aoe defs; engine grew slows/stuns+vulnerability, facing+frontal block, elite rolls, auras, bomblets, mill income, beacon towerAura, crits, rate buff, AbilitySystem (charge = stagger-immune escape). The Ford: 3 banner waves (raid/horde/war-party), ford-island premium plot; ?map= param picks maps until MapSelect (M2). Lazy baseline dies w6 of 10 — one unanswered leak grinds the gate over minutes, the map's core lesson. 24 new tests (96).
**Accept — M1 EXIT:** an outside playtester finishes Map 2 unprompted and can articulate the loot-vs-defend tension. Ben's call: does one map sing?

---

## M2 — Campaign
Maps 1, 3, 4 · full enemy roster · Warlord boss (war-cry, tower-break, sieges on leak) · supply drops · Looter · map select + linear unlocks · results/stars persistence.

## M3 — Meta
Token economy + loss payout · meta tree UI + effects (free respec) · endless mode generator + milestones · save versioning proven with one real migration · telemetry (Supabase table: map, wave reached, gold curve, tower comp, death cause) · balance pass.

## M4 — Publish polish
Map 1 as diegetic tutorial · settings (audio, haptics, left-hand mode) · colorblind-safe enemy palette check · icons/splash/store-listing draft · performance pass on real devices · soft launch to friends · TWA wrapper decision for Play Store.

---

## First session prompt

> Read CLAUDE.md and DESIGN.md. Execute M0.1 and M0.2 from BACKLOG.md. Stop after M0.2 and show me the schemas before building any engine code against them.
