# CLAUDE.md — Horse Lord

Mobile-first tower defense PWA. You are the commander on the field: riding, shooting, looting, building. Full spec in **DESIGN.md** — read §1 (pillars), §11 (architecture), and the section relevant to the current task before writing code. The design doc is the source of truth for game rules; this file is the source of truth for how we build.

**Currently pivoting (M6).** The game is a roguelite build game on a tower-defence spine —
Thronefall hero and day/night, TD structure, and a **career skill tree** in place of the
in-run draft.

Two docs outrank DESIGN.md while the pivot runs, in this order:

- **SKILLTREE.md is authoritative for M6.** The draft, `perks.json` and the meta tree are
  retired; one tree, one currency, five paths, and a run's power fully settled before the
  first wave. Read it before touching progression, abilities or the tree.
- **TRIANGLE.md remains authoritative for balance.** Its core rule supersedes the old "no
  single tower carries" invariant: **towers supply rate, the army supplies exposure, the
  hero supplies burst — no single pillar may clear a map alone, and any two together
  must.**

## Stack

- Three.js + TypeScript (strict) + Vite — render layer is stylized low-poly 3D
- `vite-plugin-pwa` for the installable shell (offline-capable, portrait)
- Deployed on Vercel
- Vitest for engine-logic tests
- Zod for runtime schema validation of all game data JSON

M0–M3 shipped on Phaser 3; the render layer moved to Three.js at MIGRATION EXIT
(2026-08-01) and Phaser is gone from the tree. **MIGRATION-3D.md** is now a record of
how that was done and what it cost — read it for context, not for instructions.

**Art north star: Thronefall.** Flat-shaded low-poly 3D; the polish is lighting,
palette and composition, not asset detail. Full direction in DESIGN.md §10, production
guidance in ART-BRIEF.md. Until 2026-08-02 the docs named *Kingshot* instead — a
painted-2D-sprite look that is close to the opposite — so treat any surviving reference
to chibi proportions, oversized weapons, team rings or soft blob shadows as withdrawn.
MIGRATION-3D.md Part A.1 is superseded in full.

## Architecture rules (non-negotiable)

1. **Substrate rule.** `/src/engine` never imports specific game content. Engines consume schemas; all balance and content lives in `/src/data/*.json`. If an engine file ever references "archer" or "brute" by name, that's a bug. Adding tower #5 must be a JSON entry + assets, zero engine changes. Enforced by `src/engine/substrate.test.ts` — it scans every engine source for content ids and fails with the file and line.
2. **Render/sim separation.** `/src/render` never contains game logic; `/src/engine` never imports `three`. The sim decides what is true, the renderer decides what it looks like. This is what made the Phaser → Three.js swap a render-layer job instead of a rewrite — do not spend it.
3. **Fixed-timestep simulation**, logic fully separated from rendering. The renderer draws; the sim ticks. Stable numeric IDs on every entity. (This is the entire co-op hedge — build nothing else for co-op.) It is also why the sim is driveable headlessly: `npm run bots` plays whole campaigns with no canvas.
4. **Data is validated at load.** Every JSON file passes its Zod schema at boot in dev; fail loud with the path and field.
5. **Save schema is versioned from the first write.** SaveManager owns all IndexedDB access, includes `schemaVersion`, and has a migration path even at v1. No derived state in saves; timestamps on writes. Designed as if Supabase sync will sit behind it later.
6. **No per-frame allocation in hot loops.** Object pools for projectiles, coins, particles, damage numbers. `InstancedMesh` for coins/projectiles/swarms; merged static geometry for terrain props.

## Directory layout

```
/src/engine     TowerEngine, EnemyEngine, ProjectileSystem, WaveRunner,
                EconomySystem, GateSystem, SkillTree, ArmySystem, XpSystem,
                SaveManager  (generic, tested)
/src/data       towers.json, enemies.json, abilities.json, skilltree.json,
                maps/*.json, waves/*.json  (+ /src/data/schemas/*.ts — Zod)
/src/render     scene, camera, lights, entity views, decals, fx (never game logic)
/src/entities   thin classes binding configs to models
/src/ui         DOM overlay: joystick, ability bar, HUD, wave banner; world→screen
                projection for bubbles, HP bars, damage numbers
/reference      prototype.html — the validated vanilla-canvas prototype;
                port its logic (path follow, targeting, economy, joystick feel),
                do not extend it
/public/models  CC0 glTF/GLB, palette-textured
ASSETS.md       license ledger — one line per model/sound: source, license,
                attribution. Update in the same commit that adds the asset.
DESIGN.md       the spec
SKILLTREE.md    the M6 career tree — authoritative while in progress
TRIANGLE.md     the M5 three-pillar rebalance — authoritative for balance
MIGRATION-3D.md the Phaser → Three.js render swap; authoritative while in progress
BACKLOG.md      milestones and tasks with acceptance criteria
```

## Game-rule invariants (from DESIGN.md, enforced in code review)

- **No single pillar clears a map alone; any two together must.** Towers = rate (sustained, position-locked), army = exposure (blocks the road, barely damages), hero = burst (cooldown-gated, mobile). This replaces the retired "no single tower carries" rule — see TRIANGLE.md Part A for why counter-tuning could never hold it.
- Leaks never despawn: walker → besieger state change at path end, gate slots cap ~5, overflow queues. No exceptions, including the boss.
- Stars score on damage *taken*, never HP remaining (repair must not buy stars).
- Hero cannot die; only heavy enemies stagger (shove + ~0.4s control loss, per-enemy cooldown).
- Coins expire only during combat; wave clear sweeps all ground coins to the hero.
- Abilities are cast at/from the hero position — no global tap-anywhere targeting.
- **The hero carries at most `equipSlots` abilities (3).** A cooldown bounds one ability; damage-per-minute is the sum over the loadout, so only the equip cap bounds the total. This is what makes the ability roster safe to grow.
- **Soldiers hold the road in front of the tower line, not in front of the barracks.** Exposure is worth only what is shooting past it; a garrison whose rally point sits outside tower cover makes a board *worse*. This is enforced by the sim — a garrison posts on the road **deepest inside tower cover** within `rallyRange`, not merely the nearest road, because a post on the boundary walks back out of cover the moment a soldier steps to engage. The old mitigation ("keep `rallyRange` short") was exactly backwards and is withdrawn: measured against the real maps, 23 of 29 plots had **no road at all** within a 50-unit rally, so most garrisons never reached the lane and the pillar was inert. `rallyRange` must comfortably exceed the plot-to-road distances the maps actually have.
- **A run's power is settled before the first wave.** Nothing mid-run changes what you can do — no cards, no pop-ups, no pausing to choose. The tree is where decisions happen; the run is where they are tested.
- **You can never finish the tree.** The reachable budget stays under 35% of its total cost, enforced at load. A tree you can complete is a checklist, and every build converges on the same one.
- **Equip slots grow with the campaign, never with the tree.** Unlocking a fourth ability makes it a choice of three. The cap cannot be purchasable or it stops being a cap.
- Gold buys commitment (towers, barracks) *inside* a run; career XP buys identity *between* runs. Two currencies, two jobs, no overlap — never merge them, and never add a third.
- Fixed tower plots. No free placement.

## Performance budget

60fps on ~2021 mid-range Android. Test on a real phone early and often: `vite --host`, open on device over LAN. Desktop Chrome is not the target; WASD exists only for dev convenience.

## Workflow

- Work in BACKLOG.md order. One task per session where possible; update task status + a one-line "learned" note in BACKLOG.md at session end (this is the project memory).
- Schemas before implementations: when a task touches new data, define/extend the Zod schema first, seed minimal data, then build the engine against it.
- Engine logic gets Vitest coverage (targeting, wave budgets, economy math, gate state machine, save migrations). Scenes and rendering do not need tests.
- Milestone exits in BACKLOG.md are gates: do not start the next milestone's tasks until exit criteria are demonstrably met on-device.
- Never add: monetization scaffolding, netcode, town-building systems, difficulty modes. See DESIGN.md §15 for what's deliberately parked.
