# BACKLOG.md — Horse Lord

Status legend: [ ] todo · [~] in progress · [x] done. Add a one-line "learned:" note under each completed task — this file is the project memory across sessions.

---

## M0 — Foundation (engine port)

Goal: prototype parity plus the gate siege, running as an installable PWA on a real phone, on a data-driven substrate.

### M0.1 — Scaffold
[~] Vite + Phaser 3 + TS strict project; vite-plugin-pwa (portrait manifest, icons placeholder); Vitest + Zod wired; Vercel deploy from main; `/reference/prototype.html` committed.
**Accept:** `npm run dev` shows a Phaser scene on desktop and on phone via LAN; Vercel URL installs as a PWA.
**learned:** Vite 7 + zod 4 + vite-plugin-pwa 1.x need no shims on Node 24; splitting Phaser into a manualChunk keeps app JS at ~88KB (Phaser ~332KB gz, precached by SW). Remaining: Ben connects repo to Vercel (creds) + on-phone LAN check — code side done, verified on desktop Chrome.

### M0.2 — Data schemas + seed content
[ ] Zod schemas: tower, enemy, ability, wave, map (path waypoints, plots, gate/forge positions), meta-node. Seed JSON transcribed from the prototype's constants (4 towers stubbed as archer-only ok, 3 enemies, map = prototype layout). Boot-time validation, loud failures.
**Accept:** invalid seed data fails boot with path+field; `npm test` runs schema tests green.
Schema requirements (design, don't over-build): towers need per-level stats + Lv4 branch pair + projectile ref + targeting mode enum; enemies need siege DPS + stagger flag + elite-eligible flag; waves are lists of (enemy, count, spacing, lane, delay) + optional archetype banner id; maps declare lanes as waypoint arrays.

### M0.3 — Simulation core
[ ] Fixed-timestep sim loop decoupled from Phaser render; entity registry with stable IDs; path-follower (distance-along-lane, multi-lane capable); WaveRunner consuming wave JSON.
**Accept:** Vitest covers path position math and wave spawn timing; enemies visibly walk the prototype path at correct speeds.

### M0.4 — Hero
[ ] Dynamic thumb joystick (port prototype feel exactly — it tested well); movement clamps; auto-fire nearest-target within range; forge interaction (in-run bow levels); trample contact damage; stagger *received* from heavy enemies (shove + 0.4s control loss, per-enemy cooldown).
**Accept:** on-device: joystick feels identical to prototype; brute contact shoves the hero; grunt contact doesn't.

### M0.5 — Towers, projectiles, economy
[ ] TowerEngine (build/upgrade/sell 70%/branch at Lv4) + ProjectileSystem (pooled) driven entirely by JSON; contextual world-space bubbles; coin drops, magnet, expiry, wave-clear sweep; EconomySystem with Vitest on costs/refunds.
**Accept:** adding a fake 5th tower via JSON alone makes it buildable in-game with zero engine edits (then delete it — this is the substrate test).

### M0.6 — Gate siege
[ ] GateSystem: walker→besieger state change at path end, ~5 attack slots + overflow queue, per-type siege DPS, gate HP, repair interaction (coin sink), damage-taken tracking for stars, loss at 0 HP.
**Accept:** Vitest covers the state machine and slot allocation; on-device: let three brutes through, watch them batter the gate, ride back, kill them, repair.

### M0.7 — Run loop + HUD
[ ] Start wave / early-start bonus; wave counter, gold, gate HP HUD; results screen (waves, kills, damage taken); restart.
**Accept — M0 EXIT:** full run start-to-finish on phone, installable, 60fps with 40+ enemies and pooled projectiles (verify with Phaser's FPS overlay on-device). Feels at least as good as the prototype.

---

## M1 — Vertical slice (Map 2: The Ford)

Goal: one map at publishable quality — the go/no-go gate for art spend.

[ ] Map 2 layout (split-and-rejoin lanes), authored 10-wave set incl. one special archetype with banner
[ ] All 4 towers real, with Lv4 branches
[ ] 5 enemy types + elite modifier
[ ] All 3 abilities + ability bar (Charge free; others unlocked-by-flag for now)
[ ] Sprite art pass: Kenney/CC0 base, composite horse+rider hero (see DESIGN.md §10), ASSETS.md current
[ ] Audio pass: SFX set + two music states with crossfade
[ ] Juice pass: hit flash, screen shake, particles, coin pitch streaks, haptics
[ ] Star scoring on damage taken
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
