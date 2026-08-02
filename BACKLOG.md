# BACKLOG.md — Horse Lord

## ▶ START HERE (updated 2026-08-01)

**MIGRATION COMPLETE.** `main` is the Three.js build. Phaser is gone from the tree and
the branch is merged. `MIGRATION-3D.md` is now history, not instructions — read it for
context on why things are shaped the way they are.

**SCOPE: PUBLISHABLE, not personal-only.** Audio is mandatory, art must read as one
family, M4 polish items are real, outside playtesting matters again. DESIGN §3's "4 maps,
single biome" v1 commitment still conflicts with wanting worlds and multiple levels —
unresolved, settle it before large content work.

**SOLO-CARRY IS SOLVED (2026-08-01).** `npm run bots` reports ON TARGET for the first
time: `solo-carriers 0` on crossroads and warlords-march, all four win-rate bands green,
and tower balance improved on the way (forced-composition 100/100/55/10 → 60/85/80/5).
All three counters were needed — C's frontal block and A's armor for archer, B's flyers
for bombard — and none sufficed alone. **Read DESIGN §6's "RESOLVED" block before
touching enemy or tower data**; it records why the hero's arrows must ignore armor, and
three traps that cost real time.

**AUDIO: SFX DONE (2026-08-01), music still missing.** 16 sounds, all synthesised in
code (`src/audio/voices.ts`) rather than sampled — nothing to download, nothing to
licence, no bundle weight, and every sound tunable by editing a number. The manifest seam
means CC0 samples remain a drop-in replacement later if wanted.

Wired to eleven sim events; sound choice keys off mechanics (blast radius, damage size),
never off content ids, so a new tower or enemy sounds reasonable the day its JSON lands.
Mute toggle in the HUD, persisted to localStorage — deliberately not the save file, since
device preferences should not need a schema migration or sync between devices.

**Music: DONE 2026-08-01.** Generative, layered over one shared clock rather than
separate loops — a crossfade between two loops has to cut mid-phrase or wait for a bar
boundary, and phase changes here happen whenever the player taps Start. Layers
(pad/pulse/lead/boss) ramp their gains instead, so harmony never lurches and a transition
can land anywhere. Boss layer keys off "something with a war cry is alive", a mechanic
rather than a content id.

**AUDIO IS COMPLETE against DESIGN §12** — but Ben reported **no sound on device**
(2026-08-01). Cause not established. The mute button now has three states so it is
diagnosable from a phone: speaker = running, crossed speaker = muted, low speaker on a
RED background = wants sound but the context is not running. No icon at all means a
stale service-worker cache, which is the prime suspect since the audio shipped after
Ben had already installed the PWA.

**SCALE, from on-device play (2026-08-01).** Ben: the hero was "too small to tell any
detail". Measured on 390x844: he was 34px against ART-BRIEF's stated 60px target, and
the whole roster was undersized with him — a grunt at 23px. `UNIT_HEIGHT` 30 → 40 and
the hero's multiplier dropped 2.0 → 1.5 to hold him exactly where he is being judged.
Now hero 51px, grunt 32px, brute 65px, warlord 84px, on a path 58px wide.

Both are dial-able from a phone without a deploy, which is how the final numbers should
be chosen: `?heroScale=N` (absolute) and `?unitScale=N` (multiplies UNIT_HEIGHT).
Purely cosmetic — `npm run bots` still reports ON TARGET, which is the proof.

**The raven is still a placeholder** (procedural `flyer` silhouette, no model). It is
the one asset genuinely missing under any plan — see ART-BRIEF §10 for Meshy settings.

**And nobody has heard any of it.** Every check so far is a measurement — rendered
waveforms, event counts, throttle behaviour. Whether it sounds *good* is unanswered.

**Superseded — the intermediate states:**

**Options C and B were DONE (2026-08-01); one map still failed at that point.** crossroads now reports
`solo-carriers 0` ✓ and all four maps are in band. warlords-march is at 40% with archer
still carrying it. Archer solo went 100% → 95% (damage taken 1 → 27), bombard 100% → 90%
(14 → 50). **Next lever is option A (damage types vs armor)** — read DESIGN §6's two
"Result of" blocks first; they record three traps, including that adding more of a
counter can make a map worse on both axes at once.

**Superseded note kept for context — option C alone:**

**Option C is DONE (2026-08-01) and did not finish the job — read DESIGN §6's "Result of
option C" before continuing.** Archer solo-carry 100% → 95%, crossroads carriers 2 → 1,
all four maps still in band. Bombard is untouched at 100% and is now the blocker.
Remaining order is **A (finish Archer) + B's flyers (counter Bombard)** — §5 already
specifies Bombard as "ground only", so the hook exists and was never built. B is engine
work, not data, so it is a decision rather than a task.

**Do not "fix" the bot tower-preference numbers.** Bombard is picked in 0 of 265 runs
while forced-Bombard wins 100%, which looks like a bug and is not: `bots.ts` documents a
CONTROL_TO_DPS sweep showing the greedy scorer flips between monocultures because it
takes the best value-per-coin every time. Preference is not evidence about tower
strength — the `[solo carry]` table is. (Claude asserted this was a blind spot on
2026-08-01 and was wrong twice over: splash is on the tower, not the branches, and the
behaviour was already investigated.)

**NEXT — the one open game problem:** archer and bombard each solo-carry maps 3–4. Root
cause found: **nothing hard-counters the Archer** — every entry in DESIGN §6's Counters
column is something an Archer can do, so no wave mixing will ever make you want a second
tower. Full analysis and four ranked options are in **DESIGN §6 → "Open design problem"**.
Agreed order: **(C)** make Shieldbearer's frontal block genuinely punishing — data only,
zero engine work — then **(A)** damage types vs armor, which is how Kingdom Rush solves
it. Success is measurable: `npm run bots` reports `solo-carriers 0` on crossroads and
warlords-march while win-rate bands stay green and all four towers still appear in
winning runs.

**Then:** audio (the largest missing feel element — the game is silent; do not let it
slip to last), then biomes and more levels, which are cheap now that map lighting is
schema data.

**Run it:** `npm run build && npm run preview -- --host` → `http://<lan-ip>:4173/`
(production build for any fps judgement; dev understates it).

**Deploys.** Pushes to `main` auto-deploy to `horse-lord.vercel.app`. Branch pushes get
Vercel previews, but Deployment Protection is on so their URLs bounce to a login — turn
it off in the dashboard or sign in on the device. The Vercel MCP cannot help: `horse-lord`
is not under the team it can see (403 on everything).

**If a deploy looks stale, suspect the service worker before the build.** Every install
carries a workbox precache; `registerType: 'autoUpdate'` self-heals, but the first load
after a deploy can serve the previous app. This already caused one false alarm — see
MIGRATION-3D's exit note.

**Known cosmetic gaps, deliberately not fixed:**
- `build-frost` uses palette slot 4 (stone grey). The Frost Spire is the slow tower and
  should read cold; the palette has no ice colour. Adding one is a design call.
- The hero is ~6–7 heads tall against `ART-BRIEF.md`'s 2–2.5. Prompt-level, not fixable
  in post. Judge it beside a wave of skeletons on a phone before deciding it matters.
- Kenney kits render one flat palette colour each — their texture atlas was never
  downloaded. See ASSETS.md.

**Hero tier skins: PARKED** (Ben, 2026-07-31) — "not really important for the game right
now". The hero is one fused horse-and-rider mesh (`public/models/hero/horse-lord.glb`),
procedurally animated by `src/render/mountAnimator.ts`; no rig, no per-tier swap. This
forecloses `HERO-DESIGN.md`'s two-channel plan (rider tracks bow level, horse tracks
Swift Steed rank) unless the model is later split into pieces — fused, those channels
multiply into 18 models instead of 9 parts.

**Character design:** `HERO-DESIGN.md`. Naming unsettled: Ben has said "Horse King".

**Making art with AI?** Read `ART-BRIEF.md` — §10 has exact Meshy settings, plus the hard
conventions the renderer assumes (Y-up, facing +Z, origin at the feet, single merged
mesh, flat unlit albedo). New models go through `scripts/optimize-character.mjs`
(a raw Meshy export is ~435k triangles against a ~3k budget) and
`scripts/inspect-model.mjs` before being wired up.

**The hero's licence is UNCONFIRMED** and the project is aiming at release. Settle what
Meshy's plan grants for commercial use and record it in ASSETS.md.

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

## Art direction — re-aimed at Thronefall
[x] Visual identity corrected + three render bugs fixed + lighting/day-night pass (2026-08-02)
**the docs named the wrong game, and that was upstream of everything.** DESIGN §10 and MIGRATION-3D Part A.1 specified a "Kingshot-class mobile look" and derived a whole art spec from one Kingshot combat frame. The actual north star is **Thronefall**. Those are near-opposite directions: zooming into the Kingshot reference shows its units are *2D painted sprites billboarded over a 3D environment* — every copy of a unit is pixel-identical across the frame, with baked outlines, baked rim light and a painted ellipse for a shadow. Thronefall is flat-shaded 3D whose polish is lighting and composition. Building to A.1 produced rules that fight the real target (chibi 2–2.5 heads, oversized weapons, per-unit team rings, "soft blob shadows not crisp shadow maps"). A.1 is now marked superseded but kept — it explains why the map lighting schema, `fx.ts` rings and the manifest tint field exist.
**three bugs were hiding how the game actually looked, and all three were invisible-by-construction.** (1) `buildPathRibbon` wound its triangles backwards, so every normal pointed at the ground and the road was backface-culled — the corridor has never once been drawn, through a whole engine migration and four maps, because a missing road looks exactly like a map authored without one. Direction-independent: the perpendicular rotates with the tangent, so the cross product is −Y for every lane heading. (2) `npm run asset:optimize` runs gltf-transform `--compress quantize`, so the Nature kit ships int16-normalised positions; `geometry.clone().applyMatrix4()` wrote world coordinates into that attribute, they saturated, and all 21 props collapsed into a two-unit blob at the origin. The Castle kit is unquantised, which is why the gatehouse survived the same code path and hid it. (3) `repairUntextured` only replaced materials that were untextured **and** pure white, so KayKit characters silently dropped their manifest tint and the game had no faction colour at all — bone-white skeletons on both sides.
**a declared tint is now authoritative**, with `keepMaterials: true` as the opt-out (hero only). That is both the faction read and the art direction: flat solid units under a hard key light. Nature kit's `baseColorFactor` was junk left behind by the same texture-strip that whitened the other kits — `leafsGreen` was literally teal — fixed in the files via a new `scripts/retint-model.mjs`, recorded in ASSETS.md, which previously claimed that kit was "unaffected".
**lighting is the cheapest lever in the renderer and it was untouched.** No tone mapping at all (a 2.3-intensity key clipped lit faces to white), a deprecated shadow type silently downgrading, and `scene.background` a flat colour. Now: `NeutralToneMapping` (not ACES — it desaturates, and the palette is doing a texture's job), `PCFShadowMap`, sun dropped to 26° so shadows rake, depth fog, and **day/night crossfaded on `sim.phase`** — the sim already draws the build/wave line and already scores the music off it, so the cycle cost one call. Fog has to be ranged relative to *camera distance*: an ortho camera sits `reach × 1.5` back, so a range anchored at the origin puts the whole playfield deep in the gradient and washes the frame uniformly. Terrain albedo shifts with the preset too — not physically honest, but a blue key on green grass yields dark green, never blue, so a night built only from lights stops at "dusk".
**learned, for next time:** render bugs that produce *absence* rather than corruption are nearly unfindable by looking at the game — the road, the props and the faction colour were each missing for months. `renderer.info` plus a headless screenshot found all three in an hour. `src/render/world.test.ts` is the first render test in the repo and exists only for this class of bug; it asserts geometry facts (normals up, winding CCW from above, terrain repaints at night) with no canvas and no WebGL.
[ ] **Phase B roster — flat-shaded single-mesh units.** The remaining gap is assets, and it is now the whole gap. Measured 2026-08-02: modular KayKit characters cost **19.5 draw calls / ~10,500 tris per enemy** (~846 draws at 40), plus ~9 texture allocations each from per-instance bone textures that `SkeletonUtils.clone` cannot avoid. A single-mesh flat-shaded unit is ~1 draw. Art direction and performance budget therefore have the same fix. Current roster is placeholder that reads correctly, not a shipped look — the enemies are literally skeletons and the towers are Kenney's *construction scaffold* models.
[ ] **Terrain: elevation, water, an actual horizon.** The ground is one flat `PlaneGeometry`, now oversized 3× so its edge never enters frame. A sky dome was deliberately *not* added: with a full-bleed ground plane under a fixed ortho camera there is nothing for it to occupy. Cliffs, water and an island silhouette are what would make a sky worth having, and they are the biggest structural gap left against Thronefall.
[ ] **Bloom, deferred with reason.** Half-res bloom was scoped and dropped: with no emissive light sources at night there is nothing to bloom, so it would have been pure cost. Revisit together with tower torches / forge glow — at which point it pays for itself. EffectComposer also costs the free MSAA the direct render path currently gets, so it needs `samples` set and on-device validation.
[ ] **On-device validation outstanding.** Everything above was verified headlessly under SwiftShader, where fps is meaningless. Draw calls, triangle counts and geometry are real; frame time is not. The lighting changes add a second shadow-relevant cost only via a wider shadow camera (0.6 → 0.78 × reach), and fog is per-fragment — both want a real phone before M4.

## M4 — Publish polish
Map 1 as diegetic tutorial · settings (audio, haptics, left-hand mode) · colorblind-safe enemy palette check · icons/splash/store-listing draft · performance pass on real devices · soft launch to friends · TWA wrapper decision for Play Store.

---

## First session prompt

> Read CLAUDE.md and DESIGN.md. Execute M0.1 and M0.2 from BACKLOG.md. Stop after M0.2 and show me the schemas before building any engine code against them.
