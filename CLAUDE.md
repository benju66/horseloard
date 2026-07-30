# CLAUDE.md — Horse Lord

Mobile-first tower defense PWA. You are the commander on the field: riding, shooting, looting, building. Full spec in **DESIGN.md** — read §1 (pillars), §11 (architecture), and the section relevant to the current task before writing code. The design doc is the source of truth for game rules; this file is the source of truth for how we build.

## Stack

- Phaser 3 + TypeScript (strict) + Vite
- `vite-plugin-pwa` for the installable shell (offline-capable, portrait)
- Deployed on Vercel
- Vitest for engine-logic tests
- Zod for runtime schema validation of all game data JSON

## Architecture rules (non-negotiable)

1. **Substrate rule.** `/src/engine` never imports specific game content. Engines consume schemas; all balance and content lives in `/src/data/*.json`. If an engine file ever references "archer" or "brute" by name, that's a bug. Adding tower #5 must be a JSON entry + assets, zero engine changes.
2. **Fixed-timestep simulation**, logic fully separated from rendering. Phaser scenes render; the sim ticks. Stable numeric IDs on every entity. (This is the entire co-op hedge — build nothing else for co-op.)
3. **Data is validated at load.** Every JSON file passes its Zod schema at boot in dev; fail loud with the path and field.
4. **Save schema is versioned from the first write.** SaveManager owns all IndexedDB access, includes `schemaVersion`, and has a migration path even at v1. No derived state in saves; timestamps on writes. Designed as if Supabase sync will sit behind it later.
5. **No per-frame allocation in hot loops.** Object pools for projectiles, coins, particles, damage numbers. Sprite atlases, not loose files.

## Directory layout

```
/src/engine     TowerEngine, EnemyEngine, ProjectileSystem, WaveRunner,
                EconomySystem, GateSystem, SaveManager  (generic, tested)
/src/data       towers.json, enemies.json, abilities.json, metatree.json,
                maps/*.json, waves/*.json  (+ /src/data/schemas/*.ts — Zod)
/src/scenes     Boot, MainMenu, MapSelect, Game, MetaTree, Results
/src/entities   thin classes binding configs to sprites
/src/ui         joystick, ability bar, world-space bubbles, wave preview, HUD
/reference      prototype.html — the validated vanilla-canvas prototype;
                port its logic (path follow, targeting, economy, joystick feel),
                do not extend it
ASSETS.md       license ledger — one line per sprite/sound: source, license,
                attribution. Update in the same commit that adds the asset.
DESIGN.md       the spec
BACKLOG.md      milestones and tasks with acceptance criteria
```

## Game-rule invariants (from DESIGN.md, enforced in code review)

- Leaks never despawn: walker → besieger state change at path end, gate slots cap ~5, overflow queues. No exceptions, including the boss.
- Stars score on damage *taken*, never HP remaining (repair must not buy stars).
- Hero cannot die; only heavy enemies stagger (shove + ~0.4s control loss, per-enemy cooldown).
- Coins expire only during combat; wave clear sweeps all ground coins to the hero.
- Abilities are cast at/from the hero position — no global tap-anywhere targeting.
- Fixed tower plots. No free placement.

## Performance budget

60fps on ~2021 mid-range Android. Test on a real phone early and often: `vite --host`, open on device over LAN. Desktop Chrome is not the target; WASD exists only for dev convenience.

## Workflow

- Work in BACKLOG.md order. One task per session where possible; update task status + a one-line "learned" note in BACKLOG.md at session end (this is the project memory).
- Schemas before implementations: when a task touches new data, define/extend the Zod schema first, seed minimal data, then build the engine against it.
- Engine logic gets Vitest coverage (targeting, wave budgets, economy math, gate state machine, save migrations). Scenes and rendering do not need tests.
- Milestone exits in BACKLOG.md are gates: do not start the next milestone's tasks until exit criteria are demonstrably met on-device.
- Never add: monetization scaffolding, netcode, town-building systems, difficulty modes. See DESIGN.md §15 for what's deliberately parked.
