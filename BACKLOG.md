# BACKLOG.md — Horse Lord

## ▶ START HERE (updated 2026-08-01)

**MIGRATION COMPLETE.** `main` is the Three.js build. Phaser is gone from the tree and
the branch is merged. `MIGRATION-3D.md` is now history, not instructions — read it for
context on why things are shaped the way they are.

**SCOPE: PUBLISHABLE, not personal-only.** Audio is mandatory, art must read as one
family, M4 polish items are real, outside playtesting matters again. DESIGN §3's "4 maps,
single biome" v1 commitment still conflicts with wanting worlds and multiple levels —
unresolved, settle it before large content work.

**M5 IS THE CURRENT MILESTONE — read TRIANGLE.md first.** The game is becoming a
roguelite build game on a tower-defence spine (Vampire Survivors progression, Thronefall
hero and day/night, TD structure). TRIANGLE.md is authoritative for M5 and outranks
DESIGN.md where they disagree.

**"Solo-carry is solved" (2026-08-01) is SUPERSEDED and was answering the wrong
question.** It was true and it did not survive in-run drafting, because towers and the
hero both produce damage and two systems producing the same resource are substitutes
forever. The invariant is now **no single *pillar* clears a map alone** — towers supply
rate, the army supplies exposure, the hero supplies burst.

**MG5.1 measured it and found the towers are not a pillar at all** (2026-08-02): towers
alone clear **0-8%** of maps while the hero alone clears **100/83/8/42%**, matching or
beating the full reference on maps 1-2. And towers cannot bootstrap — on two maps the
towers-only arm builds 1 tower and gets 0 kills, because coins come from kills and the
hero does the killing.

**MG5.2 tested the implied fix and it failed** (2026-08-02): income is *not* the
constraint. Towers-only wins 0% at every starting-gold setting. It also exposed a real
blind spot in the bots — they had no notion of covering *new* road, so a richer bot
built **fewer** towers and stacked a corner. Fixing that moved the reference +14pp on
crossroads and +19pp on warlords-march, which means every tower measurement taken before
2026-08-02 is suspect. **Tower strength versus hero strength is the actual work**, so
MG5.3 is now "hero becomes burst" and the barracks follows it.

**MG5.3 shipped and the hero is no longer a pillar on its own** (2026-08-02): hero-only
now clears **42/0/0/0%** where it cleared 100/83/8/42%. The cap that did it is not the
cooldown — it is the **equip limit** of three abilities, because damage-per-minute sums
over the whole loadout and a cooldown only bounds one term. Fixing the bot to respect it
(no more force-unlocking the roster) put the reference **in band on all four maps for
the first time** — 97/75/53/28 against 90-100/70-95/45-75/25-55 — so the MG5.2 note
above predicting a wave-budget re-tune at MG5.8 was reading an instrument error as a
design problem. **Towers are still not a pillar (0-8%); that is MG5.4's job.**

**MG5.4 built the third pillar and it works** (2026-08-03): army-only clears **0%** of
every map, and towers+army on an equal budget takes the-ford from 17% to **92%**. Towers
still cannot hold a map alone and are not meant to — the claim was never "towers are a
pillar by themselves", it is "towers supply rate and rate alone clears nothing". The
Outrider and Halberdier ship in `enemies.json` but are **held out of the campaign wave
sets**: adding them cost warlords-march 22% → 3%, and putting enemies into waves is
wave-budget work, which belongs to MG5.8.

**FIRST ON-DEVICE PLAYTEST (2026-08-03) — two findings, both structural.**

**1. The draft pop-up was "totally garbage", and it was worse than annoying.** The panel is `pointer-events: auto` across the bottom of the screen, which is exactly where the joystick spawns — so **every draft froze steering until dismissed**. MG5.5 tripled draft frequency (12/run at wave clear → ~30/run at level-up, mid-combat) and never revisited a UI built for the old cadence; TRIANGLE.md even asserted "the existing overlay is already the right behaviour" and that claim was never re-checked. The panel is now strictly opt-in: a level badges, and nothing covers the field until the player taps.

**2. Abilities should not be buttons.** Ben: skills should trigger "off of a timer or after a certain amount of damage is inflicted... don't need a button to be pushed". This is DESIGN pillar 2 finishing its own sentence — "auto-fire means the thumb steers and the brain plays" was applied to the bow and then contradicted by a three-button bar on the other thumb. Every ability now carries a `trigger` and fires itself; the bar is a readout with pointer-events off. **Charge is cut** (second time asked — §15 recorded it on 2026-07-30 and parked it pending FX, which it now has). **Whirling Blades** replaces it and answers what Charge was for: nothing defended the space *around* the hero. **Aerostorm** is the first `damage-dealt` ability.
**auto-fire is a large power increase and had to be paid for.** Firing optimally every time beat a bot heuristic by a lot: the campaign went to 100/100/89/64 against 90-100/70-95/45-75/25-55. Raising cooldowns ~45% (Volley 14→21, Muster 55→72) brought it back **ON TARGET at 100/83/72/39** with the pillar probe still OK. Enemy HP was not touched.
**learned:** the bot's `castReady` heuristic *was* the auto-fire logic, sitting in the harness since M1. When the instrument has been playing the game a way the game does not support, that is worth reading as a design note rather than as harness detail.

The armor / flyer / frontal-block counters all stay as texture. DESIGN §6's "RESOLVED"
block is still worth reading for *why* counter-tuning cannot hold against a progression
system, and for three traps that cost real time.

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

## In-run draft (DESIGN §15.1)
[x] Perk drafting: pick-1-of-3 on wave clear, engine + data + UI + harness (2026-08-02)
**the trigger had already fired, twice, from different directions.** §15.1 gated this on "if runs feel samey after M2 playtests"; the bot harness had independently concluded "composition is still preference rather than decision". Same finding, one felt and one measured. The harness note also said solo-carry "may need a mechanical change rather than a data one" — drafting is that mechanical change.
**a perk is a meta-tree node that applies mid-run.** `MetaEffectSchema` already had the whole vocabulary (hero/kingdom/tower stat, perRank, add/multiply), so perks reuse it outright rather than growing a parallel effect language, and `applyEffectInPlace` is now the single implementation both callers share. Applying one rank at a time is *exactly* equivalent to applying N at once for both modes, which is what lets the tree apply everything pre-sim while the draft hands out one stack at a time mid-run.
**why mutating live balance data works at all:** every system holds its config by reference and reads it each tick — `HeroSystem.config.moveSpeed` in the move loop, `TowerSystem` storing the very `Tower` objects in `towersById`, `EconomySystem.config` live. So a perk takes effect immediately with no rebuild. The single exception is the gate: `GateSystem` copies `hp` into `maxHp` at construction, so gate perks route through a new `reinforce()` instead of a field write (and grant the HP as well as the ceiling — a reinforcement that only raised the cap would read as nothing happening on the damaged gate you'd choose it for).
**the bug this exposed was worse than the feature.** `runBot` passed the shared `loadGameData()` result into every run, so once perks mutated it, a perk taken in run 1 was still in force in run 300 — the harness reported 100% win rates on maps tuned to 60% and 40%. The game escaped only because `applyMetaModifiers` happens to `structuredClone` first, which is incidental protection, not a guarantee. **The Simulation now clones its own balance data**, so the invariant holds for every caller. Worth remembering: this class of bug is invisible until something *writes* to config, and the codebase had been read-only there for its whole life.
**measured, not guessed** (`npm run bots`, two new probes). Draft impact: meadow-road 100→100, the-ford 73→87, crossroads 60→**93** (target 45-75, out of band), warlords-march 40→53. Per-perk forced-pick strength on maps 3-4 spans 63-83% — no runaway, tightest cluster around the bow perks. The forced-pick probe exists because BACKLOG already recorded that free-choice preference is *not* evidence of strength; that lesson transferred directly from towers to perks.
[x] Perk pool rewrite + curve re-tune + harness rebaseline (2026-08-02)
**the first pool rebuilt the very problem drafting was meant to solve.** All 15 perks were pure upgrades — a pick-1-of-3 of three free gifts is a preference, not a decision, which is word-for-word the critique the harness had already made of towers. Two structural fixes: a perk now carries a **list** of effects, so a card can cost something (`Heavy Draw` = +45% bow damage, −22% fire rate); and a new `tower-grant` effect exposes `crit` / `towerAura` / `income`, all of which are optional on TowerStats and read per-plot by TowerSystem, so granting one changes what a tower *does* with **zero engine work**. Worth remembering as a technique: the mechanics were already there, unused, and finding them was cheaper than building new ones.
**`Heavy Draw` had shipped describing a downside it did not implement** ("slower to loose, but each shaft bites deeper" — effect was damage only). `Hoarder's Bargain` nearly repeated it, which is what prompted adding `waveClearBonus` as a kingdom stat rather than softening the copy. If a card's text names a cost, the cost has to be in the effects list.
**one perk was carrying the entire pool.** Marksman's Oath granted 20%/×2.2 crit to *every* tower, stacking to 40% — roughly +44% dps on the whole board. Making it archer-only (plus a small Beacon Lore trim) moved crossroads from 93% to 60% win rate on its own. A global grant is worth far more than a global multiplier, because it compounds with everything else on the card.
**five seeds was never enough to tune against.** A sweep of rising enemy scaling on warlords-march returned 47% → 33% → 47% → 53% — non-monotonic, so the ordering was sampling noise worth ±13pp. Every tuning decision in this project has been made against that, including the "knife edge" from the difficulty pass, which may be partly noise. `SEEDS` is now 12. Runs are headless and cheap; the confidence is worth the seconds.
**final state, drafting on** (now the harness's reference config, because it is the shipped game): meadow-road 100%, the-ford 81%, crossroads 64%, warlords-march 47% (hp ×1.08) — all four inside their target bands. Draft contribution: the-ford +11pp, crossroads +22pp, warlords-march +28pp. Per-perk forced strength spans 50-68%, down from 63-83% and much flatter.
[ ] **Drafting regressed solo-carry, and scaling cannot fix it.** crossroads and warlords-march went 0 single-tower carriers → 2 and 1. The mechanism is plain: a tower perk that buffs everything buffs a monoculture exactly as well as a mix. Pushing enemy scaling hard enough to kill the carriers drops crossroads to 20% win rate, far below its 45-75% band — so this is not a knob. The lever is more **tower-specific** perks, so an all-archer build finds two-thirds of the tower cards dead and diversifying becomes the reason to take them. Making Marksman's Oath archer-only is one data point that this works.
[ ] **Does drafting make composition a decision?** Still the question the feature exists to answer, and still needs a human. The numbers say runs now diverge in *power* and cost something; whether they diverge in *play* is a phone-and-thumbs question.
[ ] **Perks are not saved.** They are run state and vanish on reload, which is correct today because runs are not resumable. If run-resume ever lands, `PerkSystem.takenPerks` is what has to persist — and per CLAUDE.md #5 it must go in the save as taken ids, never as the mutated balance numbers, which are derived.

## M5 — The three-pillar rebalance  ← CURRENT
Full plan in **TRIANGLE.md** (authoritative). Per-task acceptance criteria live there; this is the tracking view.

**The decision in one line:** towers supply *rate*, the army supplies *exposure*, the hero supplies *burst* — no single pillar may clear a map alone, and any two together must. Four measured attempts to hold "no single tower carries" all came undone because towers and the hero produce the same resource, and two systems producing the same resource are substitutes forever. Retired and replaced.

[x] **MG5.1 — Measure where we stand** (2026-08-02). `towersOnly` / `heroOnly` policies, `withoutHeroDamage`, a pillar probe, and `soloCarry` → `maxSinglePillarWinRate`.
**the problem was the other half of the game.** Towers alone clear 0-8% of maps; the hero alone clears 100/83/8/42%. Hero-only *matches or beats the full reference* on maps 1-2 (100 vs 100, 83 vs **81** — towers make the-ford marginally worse, because gold spent on them buys less than the bow does). Every hour spent counter-tuning towers against each other was spent on the half of the game that barely participates. It was never "one tower carries"; it is "the hero carries".
**the hero's only real limit is simultaneity.** The one map it cannot solo is crossroads (8%) — the two-lane map. Nothing else in the game imposes a "be in two places" constraint.
**and the deeper one: towers cannot bootstrap.** On the-ford and crossroads the towers-only arm builds **1.0 towers and gets 0 kills**. Starting gold buys one tower, that tower cannot kill wave 1 alone, no coins drop, nothing is ever built again. Coins come from kills and the hero does the killing, so *towers are funded by the hero* — a pillar funded by another pillar can never be independent of it. This invalidated the original M5 order: the barracks costs gold too, so building it next would have produced a third hero-funded system rather than a third pillar.
**learned:** "insufficient" and "starved" are different diagnoses with different fixes, and a win-rate column alone cannot tell them apart. Reporting towers-built and kills alongside the win rate is what made this visible — worth doing on every future probe.
[x] **MG5.2 — Kill-independent income** (2026-08-02) — **closed as a negative result. No economy change shipped.**
**the instrument was wrong before the economy was.** Sweeping starting gold produced an impossible result: on warlords-march, towers-only went from 3.8 towers / 2.4 waves at 45 gold to **2.0 towers / 1.0 waves at 110 gold**. More money, worse defence. The bot ranks *plots* by lane coverage but decides *build vs upgrade* on raw value-per-coin, which has no notion of covering new road — so once the obvious plots are taken an upgrade always out-scores a fourth tower, and a rich bot stacks a corner and leaves the map unwatched. Fixed by scoring a new build against the lane it watches that nothing already watches (`marginalCoverage` in coverage.ts, `OVERLAP_FLOOR` discount when it fully overlaps).
**the bots were meaningfully bad at the half of the game we were trying to measure.** At the unchanged economy the fix moved the reference **crossroads 64% → 78%** and **warlords-march 53% → 72%**. Every tower measurement taken before this is suspect, including some recorded above.
**and income still is not the constraint.** With the fixed bot, across 45/80/110 starting gold on all four maps, towers-only wins **0%** everywhere and clears 1-2 waves. Tower count barely moves, because a coverage-aware bot buys fewer, better-placed towers. So MG5.1's diagnosis was half right: the 1-tower-0-kills observation was real, but the implied fix would not have helped. **Towers are simply weak relative to the wave budget once hero damage is removed** — that is the whole finding.
**learned:** economy parameters change bot *behaviour*, which re-rolls the entire run trajectory, so cross-config win rates are not controlled comparisons. Trust within-config observations over across-config deltas. And when a sweep produces an impossible ordering, suspect the instrument before the game — that is twice now (five-seed noise, and this).
**consequence:** tower-strength-vs-hero-strength is the real work, so **MG5.3 becomes "hero becomes burst"** and the barracks moves to MG5.4. Also: with a competent bot the campaign now measures *easier* than intended (crossroads 78% vs a 45-75 band, warlords 72% vs 25-55). The bands are design intent and must not move to flatter the instrument — fold the re-tune into MG5.8.
[x] **MG5.3 — Hero becomes burst** (2026-08-02). Bow curve flattened (27.4 → 65.7 dps over six levels, was 27.4 → 152.0). Three new abilities — Rapid Fire (`hero-buff`), Heavy Shaft (`pierce-shot`), Caltrops (`ground-zone`, on a new `ZoneSystem`). New `ability-stat` effect type for upgrade perks; `unlock-ability` finally routed through to `AbilitySystem`. **Pillar probe: towers-only 8/0/0/0, hero-only 42/0/0/0, reference 97/75/53/28.** Accept criterion met.
**a cooldown caps one ability; nothing capped the sum of them.** Adding three draftable abilities put hero-only *back up* to 33% on crossroads and 58% on warlords — a pillar that had just been driven to 0% on both. Damage-per-minute is `Σ burst/cooldown` over everything equipped, so a growing roster is a sustain engine built out of burst parts. Fixed with an **equip cap** (`abilities.json` `equipSlots: 3`) — which DESIGN §4 had always specified and nothing had ever enforced. This is the structural cap, not the cooldown.
**the bot was measuring a loadout no player can assemble.** It force-unlocked the whole roster on wave 1, which the equip cap made impossible; it now starts with Charge and drafts the rest, like a real run. That change alone moved the reference from 100/100/97/100 to 97/75/53/28 — **in band on all four maps for the first time**, with no wave budget touched. The MG5.2 note above predicting a re-tune at MG5.8 was reading an instrument error as a design problem.
**learned:** that is three times now that a suspicious number was the harness, not the game (five-seed noise, the coverage-blind valuation, and this). A bot shortcut taken for convenience — "unlock everything, we're measuring the ceiling" — silently became a lie about the game the moment unlocks became a mechanic. Bot shortcuts need re-reading every time the thing they shortcut changes.
[x] **MG5.4 — Barracks + soldiers** (2026-08-03). `ArmySystem`, enemy `blocked` state, `barracks` tower with a data-driven `garrison` block and two branches, instanced soldier rendering, the Muster (`summon-host`), army perks, and two counter enemies (Outrider `blockImmune`, Halberdier `antiInfantry`). **Pillar probe: army-only 0% on all four maps.** Complement probe, funded equally: the-ford 17% → 92%, crossroads 0% → 17%, warlords +1.5 waves and kills 90 → 126.
**exposure is geometry, not numbers.** The first build let soldiers post up to 130 units from their own plot, and adding a barracks made a board *worse* — crossroads cleared 2.4 fewer waves with half the kills. Making soldiers tougher made it worse still (−1.6 → −2.4 waves), which is the tell: they were holding enemies where no tower could shoot them, so a longer hold was a longer nothing. Cutting rally range to 50 flipped every arm in one change. **A blocker is only worth what is shooting past it.**
**"more X made it worse" is now three-for-three a signal to stop tuning and look for a mechanism.** More gold → fewer towers was a coverage-blind bot. More abilities → stronger hero was a missing equip cap. More soldier HP → fewer kills was rally geometry. In each case the tuning knob was pointing at a bug.
**learned:** a probe that cannot survive to exercise the thing it measures is not a probe. `towers+army` was byte-identical to `towers only` for three measurement rounds because both arms died on wave 1 with one tower standing — the barracks was never built, so the pillar claim was untested while appearing tested. Funding both arms generously and excluding economy towers made it answerable. (That inflated arm also surfaced a real, still-open bot bug: a rich early bot values a mill at ~2.4× an archer and buys nothing else.)
[x] **MG5.5 — XP and levels drive the draft** (2026-08-03). `XpSystem`, `xpValue` on every enemy, geometric curve in economy.json, `PerkSystem.queue()` so a second level mid-charge banks a card instead of losing it, HUD bar + level + queued count. `everyNWaves` retired. **Levels on a full clear: 29.6 / 28.4 / 31.9 / 34.8 — all inside the 25-35 band.** Reference curve 92/72/44/25 against 90-100 / 70-95 / 45-75 / 25-55.
**where the curve is steep matters more than how many levels it produces.** Three curves all hit ~30 levels; only one kept the difficulty. `7.5 × 1.06` was right on count but cost the-ford 75% → 64% and warlords 22% → 14% — the levels arrived, just too late to be spent on staying alive. `6 × 1.05` fixed that and overshot to 36-44 levels. `6 × 1.075` — front-loaded head, steeper tail — held both. Level count is the visible number and the wrong one to tune against alone.
**learned:** kills → XP means the draft cadence is now downstream of *how well the player is doing*, so a curve change and a difficulty change are the same change. Any future XP edit has to be measured against the difficulty bands in the same run, not signed off on the level counter.
[x] **MG5.6 — Perk families + offer rule** (2026-08-03). Five families on `PerkSchema` (12 hero / 8 towers / 4 army / 2 economy / 2 keep); `deal` composes 1 hero + 1 tower-or-army + 1 wildcard; family shown on the card; load-time check that the three reserved families are non-empty. **The campaign is ON TARGET on all four maps for the first time: 100/78/64/50 against 90-100 / 70-95 / 45-75 / 25-55.**
**a structural guarantee beat every tuning pass that preceded it.** Not one weight changed — the offer rule alone moved crossroads 44% → 64% and warlords 25% → 50%, because a board that is guaranteed a tower-or-army card every draft comes out supported rather than lopsided. Four milestones of per-perk and per-tower tuning never got all four maps in band; one rule about *offer composition* did it immediately.
**the one-factor lint was NOT shipped, deliberately.** TRIANGLE §B.5 rule 1 wants one factor per perk. Deciding mechanically whether `cost × 0.76` is an upgrade or a downgrade is ambiguous, and the strict version ("all effects in one family") would ban exactly the tradeoff cards that make a pick cost something — the reason `effects` is an array at all. Left as a review rule rather than shipped as a check that would be wrong.
**learned:** when a guarantee is enforced by data shape rather than by code, add the check that the data can still satisfy it. A pool with zero army cards would have honoured the offer rule perfectly by never applying it.
[x] **MG5.7 — Meta tree becomes unlocks, not stats** (2026-08-03). Every stat node retired; 14 unlock nodes (abilities, `metaLocked` perks, the barracks). New `unlock-perk` effect, `metaLocked` on perks, `unlockedByDefault` on towers. Load-time checks both directions. **First real save migration, v1 → v2, with tests.** Campaign held: 100/78/64/50, pillar probe OK.
**"harmlessly ignored" was the trap, not the fix.** `applyMetaModifiers` iterates nodes, so rank keys pointing at deleted nodes would be skipped and the save would look perfectly fine — while the player's tokens stayed spent on things that no longer exist. Silent, permanent, and unreproducible. The migration refunds them, and `RETIRED_V1_NODES` freezes the old cost table in code because the JSON no longer has it: a migration has to know the world it is migrating *from*, and reading costs from the new tree is how a refund quietly becomes zero.
**learned:** the meta tree granting stats was a double-dip nobody had measured, because both halves were tuned separately and neither owned the total. Unlocks cannot double-dip — you either have the card or you don't.
[x] **MG5.8 — Rebalance the campaign against the triangle** (2026-08-03). Counter enemies into maps 2-4 at half the first attempt's density; `soloCarry` retired in favour of `maxSinglePillarWinRate`; invariants folded into CLAUDE.md. **Final: 100/89/69/50 on target, no pillar clears maps 3-4 alone, every tower including the barracks appears in winning runs, the-ford towers-only 0% → towers+army 67%, cadence 29.5/28.9/32.2/35.4.**
**no wave budget was re-priced, and that is the result.** TRIANGLE §B.8 assumed the campaign would need re-tuning against the triangle. It did not — the structural changes did it, and every attempt to tune numbers on top made things worse.
**learned, five milestones running: when more of something makes the game worse, stop tuning and find the mechanism.** More gold → fewer towers was a coverage-blind bot. More abilities → stronger hero was a missing equip cap. Tougher soldiers → fewer kills was rally geometry. A barracks making boards worse was a complement scored as a projection. Not one was fixed by a number; every real fix was a cap, a geometry rule, or a composition rule, and each held without further tuning.
**and: a probe that cannot survive to exercise its subject is not a probe.** `towers+army` read as byte-identical to `towers only` for three measurement rounds because both arms died on wave 1 — the pillar claim was untested while appearing tested.

**Exit:** every map in its win band ✅; no pillar clears maps 3-4 alone ✅; every tower *and* the barracks appear in winning runs ✅; runs measurably diverge across seeds ✅; **validated on a real phone — NOT DONE.**

**M5 is mechanically complete and has never been played by a human.** Every number above came from headless bots. They can tell you a map is solvable; they cannot tell you whether holding a line of soldiers feels good, whether the XP bar reads at arm's length, or whether the Muster lands as the moment it is meant to be. That is the whole remaining gate, and it is the one thing that cannot be done from here.

## M6 — The career skill tree  ← CURRENT
Full plan in **SKILLTREE.md** (authoritative). The in-run draft is retired; a run's power is
settled before the first wave.

**The decision in one line:** picking upgrades mid-fight is a reflex, not a decision — so the
draft, `perks.json` and the meta tree are all replaced by one career tree with five paths,
one currency, and a budget you can never spend more than a third of.

[x] **M6.1 — Schema, data, engine** (2026-08-03). `SkillNodeSchema` / `SkillTreeFileSchema`
reusing `MetaEffect` unchanged; 60 nodes across five paths; `SkillTree` with points,
prerequisites, exclusivity, cascading refunds, `reconcile` and free respec.
**the scarcity rule had to be a load-time check, not an intention.** `maxAllocatableFraction`
(0.35) is verified against the real node costs at boot, so adding nodes without adding budget
is a boot failure rather than a slow drift into "unlock everything eventually". The first
draft of the tree tripped it at 37% and the fix was to cut `maxLevel` 40 → 36, not to raise
the ceiling.
[x] **M6.2 — Career XP, save v3** (2026-08-03). `economy.tokens` → `economy.career`, XP-denominated;
`careerLevel` / `careerProgress` / `threeStarredMaps` / `equipSlots`; save v3 (`careerXp`,
`build`, `loadout`) with a tested v2 → v3 migration. The meta tree is gone entirely —
`metatree.json` deleted, `metaModifiers.ts` → `effects.ts`, `schemas/metatree.ts` →
`schemas/effects.ts`.
**a migration cannot invent an exchange rate it never had.** Tokens and XP never coexisted by
intent, so there is no honest conversion — what the save *does* hold that survives verbatim is
the campaign record, and the new economy already prices a star. Career XP is recomputed from
stars actually earned, and every token (banked *and* sunk into meta nodes) is added at 1:1 so
nothing held is taken away. Generous by construction: the worst outcome a migration can
produce is a returning player opening a fresh-looking tree while the numbers reconcile.
[x] **M6.3 — Delete the draft** (2026-08-03). `PerkSystem`, `perks.json`, `perk.ts`,
`DraftOverlay` and the in-run level hook all removed; harness loses `forcedPerk`, gains
`pathBuild` and `spreadBuild`.
**the loader caught two content holes the moment the draft stopped hiding them.** Rally Horn
was unlocked by nothing at all, and the Wall path — the tower path — had no ability node;
one node closed both. And `hunt-volley` "unlocked" the ability every career already starts
with, so it deepens Volley instead. A load-time check that every non-default ability is
reachable from the tree is what surfaced them.
[x] **M6.4 — The tree screen** (2026-08-03). Five columns, one path per phone screen, swiped
sideways with scroll-snap. Header carries level, XP bar and unspent points; refusals are
reported by reason (`locked` / `forgone` / `not enough points`), never as an unexplained grey
box. Keystones render larger with the downside in the same size type as the upside.
[x] **M6.5 — Loadout and campaign-gated slots** (2026-08-03). `equipSlots` 2, `equipSlotGrants`
[2, 4]; an explicit `loadout` on `SimData` that is authoritative when set and falls back to
roster order when not.
**the fallback is not a lesser path.** A player who unlocks their third ability and never
opens the loadout screen must still be carrying it, or the node they bought did nothing.
[ ] **M6.6 — Measure Part F and tune.** See SKILLTREE.md F.4 for what measuring changed.
**the reference build was wrong by a factor of two, and it was the reference that was wrong,
not the maps.** A full campaign at 3 stars pays ~7,400 XP → level 12, not the 22 the plan
assumed. Against 22 the harness reported three of four maps off target; the real first-run
curve is 100 / 97 / 72 / 28. A new `[RAMP]` report measures every map at 0 / 6 / 12 / 22 / 40
points, so the band and the budget it describes can never drift apart again silently.
**a probe without a control measures the budget, not the thing.** The path probe pitted a
maxed 40-point specialist against maps tuned for a 22-point generalist and called two paths
"dominant" — which proves only that 40 points beat 22. It now runs `none` and `spread` arms
at the same budget. The keystone probe gained a "no keystone" arm for the same reason.
**and the harness was ignoring tower unlocks entirely**, so every arm of every probe could
build the barracks. A tree node granting a tower was worth exactly nothing in the
measurement, and the no-build control was stronger than the build it was a control for.

**and the harness ran every map at the opening two equip slots** — the first-map condition
applied to the endgame. It understated every ability-carrying path by roughly one ability, and
it understated the *generalist* most of all. Deriving slots from the map's campaign position
flipped the path probe's verdict outright: Hunt +31pp → **+4pp**, Wall +29pp → **+3pp**.
There were never two dominant paths.

**a keystone that contradicts its own path is a trap, not a choice.** Three were shipped that
way and the probe found all three. Cataphract paid 25% bow damage for stagger immunity — nearly
worthless when the hero cannot die — so nobody could ever take it; it now triples trample and
the Ride path went **25% → 60%** on that one change. Outrider deleted trample damage at the
bottom of the *trample* path. Shieldwall's text said "one fewer soldier" while its effect
changed the squad by zero — the same dishonest-description class as `Heavy Draw` in M5.

**Part F result:** path probe **PASS** (max +4pp over the generalist), budget probe **PASS**
(32.2% ≤ 35%), keystone probe **PASS** on the stated criterion. Campaign at the 12pt reference:
**100 / 97 / 72 / 28** against 90-100 / 70-95 / 45-75 / 25-55 — the-ford 2pp over its band.

**Open, and honestly confounded:** Host (6%) and Crown (31%) sit far behind Hunt (100%) and
Wall (99%) on equal points, and the Ride keystone pair is one-sided (60 vs 29). Some of that is
real and some is the instrument: the bot rides for coins and shoots, so it converts *rate*
(Hunt, Wall) efficiently and *exposure* and *greed* (Host, Crown) badly. This is the
"preference is not evidence of strength" lesson one level up — forcing the path removes the
chooser but not the skill model. **Do not tune these on bot numbers alone.** The complement
probe has the same problem in sharper form: it reports the army adding nothing on 0/4 maps
while both its arms are saturated on maps 1-2 and dead on 3-4, so it is not answerable as
written. Fix the probe before reading it as a verdict on the barracks.

[x] **M6.7 — Two point pools** (2026-08-03). Hero paths and Kingdom paths spend separate
budgets; career levels grant one of each. Six paths now, three per pool.
**one budget made the pillar invariant a punishment instead of a guarantee.** With a single
purse a player could sink everything into the hero, arrive at map 4 structurally unable to
hold the road, and the game's only answer was to let them lose and hope they inferred why.
Two purses mean you always hold some of both while the choice *inside* each half stays
completely real — the same move as MG5.6's offer rule, which beat four milestones of tuning
by constraining shape rather than numbers.
**the split immediately exposed that the hero side was thin.** Two hero paths (48pt) against
three kingdom paths (73pt) cannot be equally scarce under any grant schedule: a budget big
enough to feel like progression put Hero over 45% reachable while Kingdom sat near 25%. No
rate fixes that — it is a content shortage, and the scarcity check is now **per pool** so a
fat pool can never hide a thin one again. Hence **The Storm**: caltrops and aerostorm left
The Hunt and The Ride, where they had always been slightly foreign, and became a third hero
verb that is neither *shoot harder* nor *ride harder*. Both pools now sit at 72/73 points
and 33% reachable.
**and two points per level is twice the power at the same level.** The first pooled build
measured 100/100/100/75 — the reference had silently doubled. Halving the grant rate
(`levelsPerPoint` 2 → 4, `maxLevel` 40 → 80) and restretching the XP curve put it back
without touching a single wave budget. **Final: 100 / 97 / 64 / 22** against 90-100 / 70-95 /
45-75 / 25-55, two maps within 3pp of band. Path probe max +6pp; budget probe 33.3% Hero /
32.9% Kingdom.
**the ramp was also lying about fresh careers**, because it assumed every map three-starred
at every level — so LV0 read as eight points. It now pairs each level with the stars a career
plausibly holds at it, which is the career as actually lived rather than a level sweep at a
fixed ceiling.

## M7 — The long game  ← NEXT
Direction set 2026-08-03: this is a **long game**. The tree, the maps and the XP curve are a
progression spine, not a difficulty knob, and the thing being designed is the *reward cadence*
— the psychology of unlocking and levelling — not just the balance.

[x] **M7.1 — Fix the reward cadence** (2026-08-03) — **solved by deleting the two pools, not by
staggering them.** Points are now one budget, one per level, every level, spent anywhere.
**the fence was buying less than it cost.** Two budgets guaranteed you always held some towers
and some hero. They also made three level-ups in every four hand out nothing, took away the
freedom to build what you want, and propped up Host and Crown by forcing you to spend in their
half. Free respec covers the case the fence was for: a starved build is a lesson, not a trap.
**scarcity never depended on it** — 48 points against 145 is 33% reachable, the same fraction
the two-budget version reached. The Hero/Kingdom split survives as tab grouping only.
**and it exposed the balance problem it had been hiding.** With free choice the path probe says
Hunt and Wall get taken and Host and Crown do not. Better visible than papered over, but it is
now real work rather than a note.
[x] **M7.2 — The in-run reward loop** (2026-08-03). Four beats, none of them a decision:
the HUD bar is now the **career** bar and levels live during a run; a wave clear floats the XP
it paid; crossing a career level fires a large, brief, non-interactive `LEVEL n · +1 SKILL
POINT`; the results screen states the payout and turns gold when points are waiting. Plus a
`?points=N` dev flag for reviewing the tree without grinding to it.
**the bar had to be segmented or a long career would read as nothing happening.** At this pace a
single run often moves the career bar less than one level, so an unsegmented fill looks static.
Two fills — what you walked in with, dim; what this run added, bright and glowing — make a 40%
run visibly a 40% run.
**and the line to hold is "tells you anything, asks you nothing".** The level banner sits exactly
where the draft pop-up used to, at the same moment, with the same weight — minus the menu. The
point it grants waits in the tree. `Simulation.onWaveClear` reports the payout and the renderer
decides how to show it; the sim never blocks on a UI decision, and there is still no 'draft'
phase for the day/night cycle to trip over.
[x] **M7.9 — The build diversity probe** (2026-08-03). Samples N legal builds at the reference
budget off a fixed seed, runs each, and reports the win spread plus **path share in the top third
against the bottom**.
**the pure-path probe had stopped asking a real question.** Once a node's value depends on what
else you built, a single-path build is *supposed* to fail — `wall 40%` reports the design working,
not Wall being weak. The question that survives is the one that was always meant: is one way of
*playing* superior? That can only be asked over builds a player would actually assemble.
**and it inverted the answer.** First reading: ride +15pp among winners (carries), host −15pp
(drags), wall +10, storm +3, crown −3, **hunt −10pp** — the path the solo arm scored at 100%.
Hunt's power is conditional on towers covering the target and a Hunt-heavy build has no towers,
so the solo arm was measuring a build nobody would ever make. Six probes in, the same lesson:
**an arm that cannot exercise its subject is not evidence about it.**
**spread 1-75%, median 26%** at a 10-point reference on the hard maps. Wide, which means build
choice matters — but a 1% build is a trap, not a choice, and the floor wants raising.
**Caveat recorded rather than tuned away:** 14 samples of ~9 nodes is a small sample, and at 10
points a build is two or three nodes' worth of difference. Read the direction, not the digits,
and re-run before acting on any single number.

[ ] **M7.3 — Retune the campaign against the curve.** State as of the single-budget change, at
a first-clear reference of LV8/2★ = 10 points: **100 / 100 / 81 / 11** against 90-100 / 70-95 /
45-75 / 25-55. Maps 2-3 too easy, map 4 too hard — the *spread* between them is too wide, which
is map tuning rather than tree tuning. The career ramp itself is now deliberately slow: ~4 runs
to LV8, ~23 to LV22, ~152 to LV44, which is the long-game shape.
Still deferred until M7.2 lands, for the original reason: the feedback layer changes what the
curve should be, so tuning first means tuning twice.
[ ] **M7.4 — More maps** → **superseded by M8, see BIOMES.md.** Four is not a campaign for a
long game, but "more maps" was the wrong frame: the problem is that all four ask the *same
question*, so the tree's six paths have nowhere to express themselves. Restructured as three
biomes of four levels, each with its own enemy pool and one terrain rule.
[x] **M7.6 — Rule effects: nodes that change what the game does** (2026-08-03). Eight of them,
replacing the eight flattest stat nodes: `crit-vs-hindered`, `pierce-on-kill`,
`zones-strip-armor`, `first-tower-free`, `soldiers-reform`, `bounty-on-blocked`,
`coins-never-expire`, `full-salvage`. New `rule` effect type, routed like an unlock; new
`rules.test.ts`.
**five of seven effect types could only ever change a number, and that is why two paths were
dead.** No quantity of "+18% soldier hp" is exciting, and ranking a boring node three times buys
three times the boredom — so ranks and tier-gating were the wrong thing to build first. Depth in
a tree comes from rules you build *around*, not multipliers you add up.
**every one was reachable through machinery the engine already had** — pierce, armour, slow,
the blocked state, coin spawning, sell refunds. Eight rules cost less than one new system, which
is the substrate rule paying out.
**and the tests immediately caught a node that did nothing.** `hero-ignores-armor` was in the
first draft; `hero.json` already sets `ignoresArmor: true`, so it would have cost a point and
changed no number in the game — invisible from inside, and indistinguishable from a weak node.
That is precisely the failure class rules have to be tested against, and why these get tests
where the stat nodes they replaced never did.
**open, deliberately left for M7.3:** the hero's bow ignoring armour by default means the
shieldbearer's armour is irrelevant to the hero pillar entirely. Flipping it would give armour
meaning against all three pillars and make an armour-piercing node worth having — but it is a
real nerf and belongs in the retune, not in a vocabulary change.

[x] **M7.8 — Conditional power: the `scaling` effect** (2026-08-03). A third effect shape —
value that grows with what else you built — plus `scaling.ts` and twelve rewritten nodes.
**stats and rules are both unconditional, and that is why the paths were unbalanceable.** "+20%
bow damage" is correct in every build that ever existed, so the paths supplying damage directly
measured at 100% while the paths supplying gold and exposure measured at 13%. A complement can
never win a contest scored on damage. This is the Slay the Spire lesson: you do not balance
cards against each other, you make a card's value depend on the deck.
**six relationships, each pointing at a different path**: towers +% per soldier standing (Wall
wants Host), towers +% per 100 gold held (Crown becomes a build), bow +% per tower covering the
target (Hunt wants Wall), zones +% per enemy caught (Storm wants crowds), soldiers +% per other
soldier (Host wants Host), bow +% per loose coin (Ride is greed, priced).
**measured, it did exactly what it was for.** Every pure path came down as its power moved onto
boards it does not build: wall 86→68, storm 100→89, ride 46→24. Hunt stayed at 100% until its
own nodes were converted too — it was the last unconditional path — and then landed at 97%,
Δ +0pp against the generalist. **Path probe now: hunt +0, storm −8, wall −29, ride −74, crown
−67, host −81.** No path beats a generalist, which is F.1's accept criterion, and the top three
are within 8pp of each other where they used to span 94.
**what is still open is the bottom, not the top.** Host, Crown and Ride sit far below a
generalist. Some of that is correct — a *pure* complement build should lose — and some is the
instrument, because the bot converts rate well and exposure and greed badly. Distinguishing
those two needs a probe that scores a build's *contribution* rather than its solo win rate.

[x] **M7.7 — Ranks, tier gating, and making conditional power legible** (2026-08-03).
**Ranks needed no save migration.** `build` was already `string[]`, so a node at rank 3 is its id
three times over — and a v3 save written before ranks reads as every node at rank 1, which is
exactly what it was. Minors rank ×3, notables ×2; abilities, synergies and keystones are one-offs
by nature; **rules cannot rank at all** and the schema refuses a data edit that tries, because a
rule applied 1.4 times is not a rule.
**Tier gating replaced the chains outright.** 63 of 72 per-node prerequisites are gone, swapped
for "spend N points in this path" (0/2/4/7/10/14 by row). A chain forces one order and makes
every node above the one you want a toll; a total keeps the commitment and gives back the freedom
to walk it your own way. The nine prerequisites left are real: a node that sharpens an ability
needs the node that unlocks it. Cross-path ones were dropped rather than kept — a Ride node that
sharpens a Storm ability should stay buyable and simply be worth nothing until you own it, which
is the same bargain every scaling node makes.
**and conditional power was invisible, which defeated the whole point of M7.8.** The tree said
"+6% per soldier standing" and nothing about the payoff, and a bonus you cannot picture is one
you cannot build toward. Two readouts now: the tree sheet shows worked values at three plausible
board sizes (a preview, deliberately — the tree is opened between runs when nothing is standing,
so "currently ×1.0" would be true and useless), and the HUD carries live `TWR ×1.34` chips during
a run, computed from the same reads `Scaling` makes at damage time so the bar and the shot can
never drift.
**the bot's tower valuation did not know scaling existed**, so it priced a barracks purely on
exposure while the build's own nodes made it partly a damage purchase — systematically
undervaluing the exact synergies M7.8 added. New `scalingValue`, read off the live specs. Fifth
time a harness shortcut silently became a lie about the game once a mechanic changed under it.
**and `totalCost` was counting each node once**, so the scarcity gauge read 33% when the tree
with ranks is 24% reachable. A rule reading its own gauge wrong is worse than no gauge.

**Measured after all of it:** path probe max **+0pp** — no path beats a generalist, which is
F.1's criterion. But the pure-path arms have stopped being the useful question: with power this
conditional a single-path build is *supposed* to fail, and Wall duly fell 68% → 40% because a
Wall build has no soldiers for its own scaling to count. What is needed instead is a probe over
*mixed* builds, scoring diversity rather than solo survival. Recorded, not built.

[ ] **M7.5 — More to unlock.** The tree is the only unlock surface today. A long game wants
more kinds of thing arriving over time — towers, enemies, abilities, maps, cosmetics — on a
cadence, so that levelling keeps producing news.

**Parked, explicitly:** node art. 72 icons is a real art task and emoji placeholders are enough
to judge structure. Revisit when the structure has stopped moving.

**Still true, and now three milestones old: none of this has been played by a human.** The tree
screen, the loadout and the whole "decide before you ride" premise are phone-and-thumbs
questions, and the bots cannot answer one of them.

## M9 — Counter-enemies  ← DONE, and it unblocked M8
Full design in **BIOMES.md Part K**. The prerequisite M8 is blocked on.

**The design constraint in one line:** a counter-enemy is not a hard enemy, it is **an enemy
towers cannot answer by being more numerous.** Every trait in the current roster fails that
test — armour makes towers work harder, speed makes them work sooner, `flying` and `blockImmune`
route around the army but stay in tower range the whole way.

[x] **M9.1 — The Sapper** (2026-08-03). `towerBreak`, low HP, must die before it arrives. **Zero engine
work** — `towerBreak` is fully implemented in `towerSystem.ts` and has been given to exactly one
enemy, the warlord, which appears once at the end of a campaign. The anti-tower mechanic was
built the whole time and never deployed as a regular threat.
[x] **M9.2 — The Juggernaut** (2026-08-03). 80% damage reduction *while moving freely*, normal while slowed
or blocked. One more read of the `hindered` test that `damageVsHindered` already uses. **The
direct answer to Part J:** the first enemy whose counter is a *pillar* rather than a quantity,
which is what should finally separate the pools.
[—] **M9.3 — Stalker and Warden: not needed.** 9.1 and 9.2 separated the pools on their own, so
these drop from prerequisites to content and their moderate engine work never has to happen.
[x] **M9.4 — The gate: PASSED** (2026-08-03). green → crown, iron → **host**, steppe → wall.
**the decisive line is Iron**, which read `wall +20` before the Juggernaut and reads `wall −18`,
`host +20` after. Same map, same builds, same wave shapes — towers went from the answer to a
liability and exposure became the thing that wins. Exactly what K.2 predicted, in a form
specific enough to have been wrong.
**two enemies, one of them free.** `towerBreak` was already implemented and given to a single
boss; the Juggernaut was one line in the damage path reusing the `hindered` test that
`damageVsHindered` and `crit-vs-hindered` already share.
**caveats, unresolved:** Green is still saturated at 89-100% so its reading is noise rather than
evidence; Iron at 0-42% may be too hard, which is a band question for M8.7 and not a reason to
soften the trait. Twelve builds is a small sample — the direction is decisive, the digits are
not.

**Cheapest first, re-measured after each.** If the Sapper and Juggernaut alone do it, the other
two are content rather than prerequisites and the moderate engine work never happens. None need
art to be tested — placeholder geometry is a valid state.

## M8 — Biomes  ← UNBLOCKED by M9, see BIOMES.md Part L
Full plan in **BIOMES.md**. Three biomes of four levels replacing four standalone maps.

**The decision in one line:** the tree has six paths and the campaign has four maps that all ask
the same question, so build diversity has nowhere to go — biomes are the payoff for the tree
rather than a feature beside it. A biome is a palette, an enemy pool, **one terrain rule** and a
difficulty band; a biome missing the terrain rule is a reskin, and that is the test.

**The roster already clusters three ways**, each punishing a different pillar: swarm/runner/looter
punish rate, brute/shieldbearer/halberdier punish the army (`antiInfantry` shreds soldiers), and
wolf-rider/raven/outrider punish the line (`flying` and `blockImmune` walk past a blocker). A Host
build that dominates biome 1 should be dismantled by biome 2 — which is impossible on today's
campaign and is the whole argument.

**Measurement comes before authoring** (M8.4 before M8.5): per-biome build diversity, and
pillar-by-biome. **Accept: no single path is in the top third of builds in all three biomes.** If
Ride carries everywhere, the biomes are palettes. Authoring eight maps before that probe exists is
authoring them blind — the lesson M7 taught twice.

[x] **M8.0 — The pool probe: test the thesis before authoring** (2026-08-03) — **returned a
negative, and that is the point.** Twelve shared builds on one map, reskinned per pool with wave
shapes untouched and counts HP-normalised so only the species differ.
**Iron and Steppe — the only two pools with enough spread to read — give the same verdict and
nearly the same signature:** wall +20/+28, storm −23 both. Build towers. Green looks different
but sits at 89-100%, where everything wins and top-versus-bottom is noise.
**the roster has no anti-tower pressure.** Armour, speed, `flying`, `blockImmune` — every trait
in the eleven is answered by *more towers*, so the pools differ in flavour but not in what beats
them, and no arrangement of them can make a non-Wall build correct. Same shape as the finding
that killed "no single tower carries": every enemy asks the same question, so every answer is
the same answer.
**prerequisite for M8:** enemies that punish specific *answers* — something that damages towers,
something immune to a damage shape rather than to a blocker, something that outranges a line,
something that punishes standing still. Two or three of those, then re-run this probe.
**an hour of work, spent before eight hand-authored maps rather than after.**

## Reconciliation of the parallel sessions (2026-08-04)

Two sessions built M8.1–M8.4 in parallel; main kept its renderer integration, army
rally-range fix and per-biome probes, and the evaluation branch's instrument work was
reconciled in on top: controlValue (slow needs a payer), responsive tower caps, the
budget-sweep complement probe, the per-pool-rule pool probe, the spawn-approach softlock
guard, and the designed Iron/Steppe palettes (the shipped ones were recycled per-map moods
— reported from device as "it looks the same").

**Full harness on the merged result:** curve ON TARGET (100/94/50/44), pillar probe OK,
triangle-by-biome 0 pillars sufficient. **The complement probe finally sings:** army helps
on 2/2 readable maps — crossroads +67pp, the-ford +8pp — and the rich-bot garrison
collapse recorded on the branch does not reproduce on main; the rally-range fix and the
valuation fix were two halves of one repair. Authored-biome probe: iron carries host,
steppe carries ride, two distinct paths.

**Crown repriced (2026-08-04), and the Part G verdict now reads PASS.** The genericity
lived in the deep nodes, not the cheap ones: the damage-per-gold-held caps came down
(tithe 2.5 → 1.5, ransom 2.5 → 1.4), quarry's universal discount 15% → 10%, granary
×1.35 → ×1.2 per rank. Iron now reads crown −3 (hunt/storm carry), steppe crown +12 with
ride second — greed keeps its home biome and stops being everyone's answer.
**Two instrument findings on the way.** A saturated pool row (green at 100–100%) was
voting on the verdict with sort-order noise — readable rows only now, with the
denominator shrinking to match, and the sample rose 12 → 18 builds because the verdict
was flapping on ±5pp deltas. And the first reprice attempt cut `crown-coffers`, which
the reference spread build holds — starting gold 65 → 55 flipped the bots' first
purchase and moved the whole curve +20pp on two maps. A nerf that raises win rates is a
threshold artifact, not balance: reverted, and the lesson recorded — **never tune a node
the reference build holds without re-running the curve in the same breath.**
Still open for the depth pass: the one-sided keystone pairs, and Wall's pure-path arm
(10%, −78pp — the known M7.9 artifact, a Wall build has no soldiers for its own scaling).

## M8.5 — Green Road complete (2026-08-04): The Market Road and Harvest Night

The Green Road is a four-level world: meadow-road (introduce) → the-ford (geometry) →
**market-road** (composition: greed under pressure — looters come up a thieves' alley
WITH the fights, so the coins you leave lying walk away mid-wave) → **harvest-night**
(setpiece: three HORDE banners, a two-sided pincer, the tide with the dark). Campaign
renumbered green 1–4, Iron Crossing 5, Warlord's March 6. Equip-slot grants moved to the
biome boundaries [4, 8] — "a slot per biome entered" (BIOMES.md Part E) — which keeps
every existing map's slots exactly as they were.

**Curve: ON TARGET on all six maps, monotonic in campaign order — 100 / 94 / 89 / 72 /
50 / 44.** Both new maps use the pure green pool; no legacy species.

**What authoring the first new levels taught, in three failed rounds:**
1. **HP alone cannot make green hard.** ×2.1 the budget: still 100%, zero leaks. The
   green pool has no weight class, so a mature single-lane board out-kills any body count.
2. **Compression alone cannot either.** Walls of swarms at 0.18s spacing feed splash;
   kill rate scales with density and the wall dies as one.
3. **Geometry is green's only difficulty dial.** The-ford loses 6% *because it splits*.
   Both new maps were redesigned around split pressure — the alley, the pincer — and the
   ford's own HP regime (×2 → ×8, the manufactured weight class) finally put them in band.
   The authoring rule for tankless pools: **lanes first, budgets second.**

The plot gold-trap guard caught one mis-placed plot before any human could buy it.
Cadence: harvest 25.2 in band; market 25.0 on the boundary (24.0 all-runs) — recorded,
not chased; crossroads already sits similarly at the other edge.

## M8.5 — Long Steppe complete (2026-08-04): three roads to the Warlord

**The Open Road** (L1, introduce: one species at a time under open-country — the first
lone sapper arrives at w8 so the "kill it early or not at all" lesson is taught with one
before The Broken Line asks it with many) → **The Flank Road** (L2, geometry: a lane that
enters from the side and runs the map's width behind everything you built) → **The Broken
Line** (L3, composition: everything ignores something — outriders past soldiers, ravens
over mortars, sappers unmaking the towers; what cannot be ignored is the hero) → The
Warlord's March (finale). New WILD HUNT banner — RAID's subtitle promises runners, and a
banner that lies teaches the wrong lesson.

**Curve ON TARGET on all nine maps**: 100/94 · 81/72 (green back half) · 50 (iron) ·
61/47/33 (steppe road) · 44 (finale). Cadence 30.7/31.7/33.4 in band. Pillar probe OK.
Steppe tuning converged in five iterations — the pool has real teeth (speed, flying,
towerBreak), so budgets carried difficulty where green needed geometry. Flank-road showed
the hair-trigger again (64%→25% on a 5% step); small moves found 47%.

**Remaining in M8.5: Iron Deeps L2–L4.** Then natives (M8.6) and the per-biome pass (M8.7).

## M8.5 COMPLETE (2026-08-04): twelve levels, three worlds, one curve

**The Iron Deeps descend**: The Iron Crossing → **The Pit Heads** (geometry: two pit
mouths, one trench, five plots — under narrow-cuts, which five matters more than anything
you buy; landed in band on the first authored budget) → **The Undercut** (composition: a
twice-doubled switchback where halberdiers punish the soldiers the juggernauts demand) →
**The Deep Gate** (setpiece: war-party columns, juggernaut pairs, the deepest gate in the
campaign at 130hp).

**Final campaign, ON TARGET on all twelve maps, per-world descents:**
Green 100 / 94 / 81 / 72 · Iron 50 / 67 / 42 / 53 · Steppe 61 / 47 / 33 / 44.
Pillar probe OK. 284 unit tests, production build green. Each biome restarts gentler than
the last one ended and descends to its setpiece — the per-biome band shape BIOMES.md
Part G.1 asked for, now measured rather than intended.

Deep-gate oscillated 25/36/33 across band-edge nudges before one decisive ease landed it
at 53 — the same lesson as flank-road and the warlords floor: **never park a map within
one run of its band edge; tune to mid-band or the next unrelated change re-opens the gate.**

**M8.5 is done. Remaining in M8: M8.6 (biome natives — one each for Iron and Steppe,
designed against real gaps now that all twelve levels exist) and M8.7 (the per-biome
tuning pass + draining green's legacyPool, which the M8.2 re-speciation may already have
emptied — verify).**

## M8.6 — The natives (2026-08-04): the Warden and the Stalker

**Warden** (Iron): the defensive twin of warCry — everything near the standard takes 60%
damage, except the bearer itself, because a ward that warded its carrier would make the
counter recursive. Punishes damage spread thin; the answer is focus. **Stalker** (Steppe):
leaves the road and comes for you — `huntsHero` via a StalkerSystem on the looter-driver
pattern, `staggersHero` on contact, never sieges, holds the wave open until killed. The one
pressure that makes mobility a requirement. Both tested (aura never self-applies, ward
expires, hunter leaves the lane and releases the wave on death); both in campaign waves at
accent density; all twelve maps re-measured ON TARGET after a stalker-tax ease on the
steppe.

**Instrument finding — natives do not belong in the reskin pools.** The pool probe's
round-robin casts a sparse accent as one body in five, and at that density both natives'
shared hero-shaped counter dragged every pool toward ride/hunt and failed Part G on a
composition the campaign never ships. The authored-biome probe measures them at real
density and is the gate that judges them. Rationale recorded in the probe itself.

**M8.7's opening target, measured and named: ride tops all three authored biomes**
(+43 green / +10 iron / +20 steppe, 10-build sample). Green is the anomaly and the cause
is legible — the split-pressure redesign that fixed green's difficulty also made mobility
its dominant answer. Iron reads nearly flat (weak signal). The per-biome pass owns this:
differentiate green's answer back toward rate, and re-read iron at a bigger sample.

## M4 — Publish polish
Map 1 as diegetic tutorial · settings (audio, haptics, left-hand mode) · colorblind-safe enemy palette check · icons/splash/store-listing draft · performance pass on real devices · soft launch to friends · TWA wrapper decision for Play Store.

---

## First session prompt

> Read CLAUDE.md and DESIGN.md. Execute M0.1 and M0.2 from BACKLOG.md. Stop after M0.2 and show me the schemas before building any engine code against them.
