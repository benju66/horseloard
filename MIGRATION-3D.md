# MIGRATION-3D.md — Horse Lord render layer: Phaser 2D → Three.js low-poly 3D

**Decision:** Adopt stylized low-poly 3D (Kingshot-class mobile look) as the game's visual identity. Render layer swaps from Phaser to Three.js. **The simulation, data schemas, economy, gate system, wave runner, and save layer do not change** — this migration is only possible cheaply because of the substrate rule, and it must not violate that rule on the way through.

**Engine choice:** Three.js (not Unity). Unity WebGL is incompatible with the PWA goals: 20MB+ bundles, poor mobile-browser performance, opaque builds. Three.js is web-native, tree-shakeable, and delivers the target aesthetic — low-poly + ortho camera + one shadow-casting light is its bread and butter.

---

## Part A — Visual target specification

- **Camera:** fixed `OrthographicCamera`, high angle (~55° elevation, slight yaw for depth), portrait framing. No player camera control in v1. Map JSON gains a `camera` block (frustum size, angle) so per-map framing is data.
- **World mapping:** the sim stays 2D. Sim `(x, y)` maps to world `(x, 0, z)`; ground is the XZ plane. Path math, targeting ranges, magnet radii — all unchanged, interpreted as planar distances.
- **Lighting:** one `DirectionalLight` with a tuned shadow map (single cascade, tight frustum fitted to the play area) + hemisphere light for fill. Crisp shadows on the ground plane are half the look — budget for them, cap `renderer.setPixelRatio` at 2.
- **Materials:** flat palette texturing — the standard low-poly workflow where one small gradient-palette texture serves every model and UVs point at color patches. `MeshLambertMaterial` or a light toon shader; no PBR, no normal maps.
- **Palette:** bright, saturated medieval fantasy (inherit the prototype's grass/path/gold reads — they were already correct). Enemy faction colors must survive the style transfer: colorblind-safe, readable at gameplay zoom.
- **Ground decals:** projected circles for tower ranges and ability targeting — blue ally / red enemy. Implement as flat ring meshes floating 1cm above ground (cheap) rather than true decal projection.
- **UI:** DOM overlay (HTML/CSS absolutely positioned over the canvas) — joystick, ability bar, HUD, wave banner. World-anchored elements (build bubbles, damage numbers, HP bars) use world→screen projection each frame. This *replaces* Phaser's in-canvas UI and is simpler; style per DESIGN.md UX rules.
- **Assets:** CC0 low-poly glTF. Primary sources: **Kenney** (castle/medieval kits, nature), **Quaternius** (animated characters, animals incl. horses, medieval), **KayKit** (animated adventurers, skeletons, dungeon props). Pick one pack family per category for proportion consistency; recolor via the palette texture, not per-model textures. **The hero is a composite: rider mesh parented to horse mesh** — mount/dismount comes free later. ASSETS.md ledger continues unchanged.
- **Animation:** glTF skeletal clips via `AnimationMixer` (walk/attack/death where packs provide them) + procedural motion (bob, lean-into-turn, stagger shove) layered in code — the prototype's animation philosophy, now in 3D.
- **Performance:** 60fps on ~2021 mid-range Android with 40+ animated enemies, shadows on. Tools: `InstancedMesh` for coins/projectiles/swarm enemies, merged static geometry for terrain props, draw-call budget ~100, object pools as before. Test on device from the first render task.

## Part A.1 — Reference frame breakdown (Kingshot combat screenshot)

Concrete refinements from the reference, overriding Part A where they conflict:

- **Dusk lighting model:** cool desaturated blue-teal ambient over terrain; warm light pooled on the path corridor. The playfield is the brightest, warmest region on screen — lighting *is* the readability system. Implement: cool hemisphere ambient + warm directional, plus a subtle warm tint baked into the path material. Map JSON gains a `lighting` block (ambient color, sun color/angle, path tint) so mood is per-map data — biome 2 is a lighting preset before it's new models.
- **Per-unit team rings:** soft glowing ground rings under every unit — red enemies, blue hero (and future allied soldiers). Persistent faction indicator, separate from range/targeting decals. At chibi scale, rings are the faction read; elite crown glow layers on top of this.
- **Character proportions:** chibi, ~2–2.5 heads tall, chunky silhouettes, oversized weapons. Constrains asset selection — prefer chunky-proportioned CC0 packs; do not mix realistic-proportioned humans into the roster. If free packs can't hit the proportion, this is the Phase B commission target (hero + 3 enemy archetypes as a matched set).
- **Environment dressing rules:** sparse props clustered at path edges (trees, stumps, rocks, fences, barrels), large negative space elsewhere, ~15–25 props per map. Path is an irregular organic shape (blob-edged mesh or alpha-edged texture), never a uniform stroke.
- **Shadows: soft and subtle,** low-opacity, PCF-soft or blob shadows under units — not crisp shadow maps. Cheaper and matches the reference. (Overrides Part A's "crisp shadows.")
- **UI reference:** chunky rounded translucent-teal buttons, minimal in-combat HUD, hero portrait bottom-center with HP-style bar (ours shows gate HP + bow level), wave banner top-center.

**New feature adopted from reference: game speed toggle (x1/x2).** Nearly free with the fixed-timestep sim (tick multiplier); TD players expect it. Add to M1 HUD; persist preference in settings. Explicitly rejected from the same UI: "Auto" battle — that's idle-game DNA and violates pillar 1.

## Part A.2 — Character & model pipeline

**Roster strategy: ~6 base models + variants.** Composition (props parented on), scale, and palette tint stretch a small CC0 set across the full roster. Never source a unique model when a variant works:

| Unit | Build |
|---|---|
| Hero | horse model + rider parented at saddle + bow at hand — the flagship composite |
| Grunt | base monster/minion model |
| Runner | grunt base, ~0.9x slim, speed tint |
| Brute | large base model, ~1.4x |
| Shieldbearer | character base + shield mesh attached |
| Swarm | 0.6x rigid mini-mesh, procedural hop, InstancedMesh — deliberately NOT skinned/animated |
| Wolf Rider | animal model + small rider composite (hero technique reused) |
| Looter | grunt variant + sack prop |
| Warlord | brute base ~1.8x + crown/cape props + dark tint |
| Elites | any unit + tint shift + ring glow |

Towers, gate, forge, props: Kenney castle/medieval/nature kits — static meshes, no pipeline complexity.

**Per-asset pipeline** (Ben picks; Claude Code processes): search Poly Pizza / Quaternius / KayKit / Kenney (CC0 only) → download glTF/GLB → inspect clips + rig → normalize to standard unit height → `gltf-transform` optimize (prune, weld, texture resize; no Blender unless something is broken) → `/public/models/` → manifest entry → ASSETS.md line. All processing steps scriptable; add an `npm run asset:add` helper in MG.4.

**Animation manifest (schema rule):** data maps *logical states* (walk, attack, death, siege, stagger, idle) → per-model clip names, with `procedural` as a valid value (bob/lean/shove/hop in code). A model shipping only a walk cycle is usable day one; richer clips upgrade it later without engine changes. Engine plays logical states only and never knows clip names.

**Proportion gate:** all characters must read as one family (chibi-chunky per A.1). When evaluating a pack, drop one model next to the hero at gameplay zoom on-device — if proportions clash, reject the pack, don't mix. If no CC0 family hits the proportion target across the roster, that discovery is the Phase B commission trigger (matched set: hero + 3 enemy archetypes), and pack models remain placeholders until then.

**Budgets:** ≤40 concurrent SkinnedMesh enemies (swarms excluded via instancing), shared materials across the roster (one palette texture), per-model ≤3k tris. The hero composite gets one dedicated session for seat/bow/gallop tuning — it's on screen 100% of the time.

## Part B — DESIGN.md amendments (apply these edits)

1. **§10 Art Plan** — replace the 2D sprite-pack strategy with Part A + A.1 above (condensed). The "one hard asset" paragraph is deleted with prejudice: the mounted archer is no longer hard. Phase B (paid/commissioned upgrade) survives but now means paid model packs or a commissioned matched chibi set (hero + core enemy archetypes).
2. **§11 stack line** — becomes: *Three.js + TypeScript + Vite, deployed on Vercel as an installable PWA.* Directory layout: `/src/render` (scene, camera, lights, entity views, decals, fx) replaces `/scenes`; `/src/ui` becomes the DOM overlay; `/src/engine` and `/src/data` are explicitly untouched. Model refs replace sprite refs in data schemas (`model`, `clip` fields).
3. **§9 Controls** — unchanged in behavior; note UI is DOM overlay. Fixed camera per map remains.
4. **§12 Audio, §13 Difficulty, all game-rule sections** — no changes. If a migration edit wants to touch a game rule, that's scope creep; stop.
5. **CLAUDE.md** — update stack + directory references; add invariant: *"/src/render never contains game logic; /src/engine never imports three."*

## Part C — Migration backlog (insert before remaining M1 tasks; M1 art/juice tasks rebase onto 3D)

### MG.1 — Boundary audit (GO/NO-GO GATE)
[x] Verify `/src/engine` has zero Phaser imports and zero rendering concerns; list every violation. Verify sim tick runs headless (Vitest can drive a full wave without a canvas).
**Accept:** written audit report in this file. If clean → proceed. If entangled → fix the boundary *first* as its own task, still in Phaser, before any Three.js work. Do not port a leaky boundary.

---

#### MG.1 AUDIT REPORT — 2026-07-30 · verdict: **GO**

**1. Phaser coupling.** Zero Phaser imports outside the render layer. The only
occurrence of the string "Phaser" anywhere in `/src/engine` is a prose comment in
`simulation.ts:49`. `/src/data` has none at all. Phaser is confined to `main.ts`,
`/src/scenes` (5 files), and `/src/ui` (3 files).

**2. Layering.** Zero imports from `/src/engine` or `/src/data` into `/src/scenes`
or `/src/ui`. The dependency arrow points one way only, as designed.

**3. Rendering concerns in the engine.** None. No colours, textures, tweens,
depths, alphas, or camera references in any engine file. The engine does not read
`spriteRef` — it doesn't know the field exists.

**4. Browser/DOM/wall-clock dependencies in the engine.** One finding, non-blocking:
`progression.ts` calls `new Date().toISOString()` in `newSave()` and on save
mutation (lines 16, 64). That is deliberate — CLAUDE.md #4 requires timestamps on
writes — but it means the progression layer is not purely deterministic, unlike the
simulation. Irrelevant to rendering and therefore not a migration blocker. Worth
injecting a clock if save-layer tests ever need determinism.

**5. Headless proof.** Stronger than the acceptance criterion asks for. `npm run
balance` and `npm run bots` both play complete campaigns — all four maps, multiple
strategies, five seeds each — with no canvas, no Phaser, and no wall clock, behind
a seeded RNG threaded through every system from `new Simulation(data, rng)`. The
sim is not merely canvas-free in principle; it is exercised that way on demand.

**6. Migration surface.** 1,612 lines of render layer to port: `GameScene.ts` (914),
`BootScene.ts` (141), `MetaTreeScene.ts` (126), `MapSelectScene.ts` (104),
`ResultsScene.ts` (98), `abilityBar.ts` (82), `joystick.ts` (75), `bubble.ts` (72),
plus `main.ts`. The 2,951-line engine and the whole of `/src/data` do not move.

**7. The one coupling to plan for.** Render references live in the *data schemas*,
not the engine: `SpriteRefSchema` / `SfxRefSchema` are used across 5 schema files
(`common`, `tower`, `enemy`, `hero`, `ability`) covering `spriteRef`, `iconRef`,
`hitSfxRef`, `fireSfxRef`, `castSfxRef` — 34 occurrences in the shipped JSON. They
are consumed by exactly two files, `BootScene.ts` and `GameScene.ts` (9 references).
This is the seam Part B §2 already calls out (`model`, `clip` fields replace sprite
refs). It is a clean data↔renderer seam, not a leak into the engine, and the
substrate guard needs no changes to survive it.

**Verdict: GO.** The boundary is not merely adequate — it is the reason this
migration is affordable. Nothing needs fixing before MG.2.

**Caveat on this gate.** Because the boundary was already clean, MG.1 was close to
a formality. The decision with real consequences is **MG.2**, where the timebox and
the kill criterion get set. That number is Ben's to choose and is still unset.

### MG.2 — Branch + scaffold
[ ] Branch `3d-migration`. Add three + types; remove nothing yet. Render smoke test: ortho camera, lights, palette-textured cube on a ground plane, on-device via LAN.
**Accept:** 60fps spinning cube with shadow on your phone. (Trivial on purpose — proves toolchain + device loop.)

### MG.3 — World render
[ ] Ground plane with organic-edged path, plot markers, gate + forge placeholder meshes — all driven from map JSON. Camera block and lighting block (dusk model per Part A.1) added to map schema. Prop placement from map data (sparse, path-edge clusters).
**Accept:** the M0 map is recognizable in 3D with the dusk lighting mood; sim entities (headless) walk the path as debug markers.

### MG.4 — Entity views + assets
[ ] Execute the Part A.2 pipeline: model manifest schema (logical states → clips, `procedural` fallback), `npm run asset:add` helper, base models sourced + processed, hero composite (dedicated tuning session), enemy variant system (scale/tint/props), tower views per level, coin/projectile InstancedMesh pools, swarm rigid-instanced path.
**Accept:** full M0 roster visible and animated per A.2; proportion gate passed on-device; substrate test still passes (fake tower #5 via JSON incl. model ref, zero engine edits).

### MG.5 — DOM UI overlay
[ ] Joystick, HUD, start-wave, speed toggle (x1/x2 via sim tick multiplier, persisted in settings), results → DOM. World-anchored bubbles/HP bars/damage numbers via projection helper.
**Accept:** on-device: full interaction parity with the Phaser build plus working 2x speed; bubbles track entities under camera projection correctly.

### MG.6 — FX + decals
[ ] Per-unit team rings (red enemies / blue hero), range/targeting ring decals, soft unit shadows, pooled particle bursts (kill, coin, ability), stagger shove feedback, gate siege visual state.
**Accept:** the gate-siege moment (brutes battering, ride back, Charge, repair) reads clearly in 3D; factions readable at a glance from rings alone.

### MG.7 — Parity + performance gate
[ ] Full run parity with the Phaser build. Profile on-device: 40+ enemies, shadows, 60fps. Remove Phaser dependency; merge to main.
**Accept — MIGRATION EXIT:** M0 exit criteria re-met in 3D. Then resume M1 (The Ford vertical slice) with art/audio/juice tasks interpreted for 3D.
**Kill criterion:** the Phaser branch is kept intact until MG.7 passes. If the migration stalls badly against the timebox Ben sets at MG.2 kickoff, fall back to the Phaser branch and ship 2D — a finished 2D game beats an unfinished 3D one. A migration that can't fail cleanly is the kind that kills solo projects.

## Part D — Kickoff prompt (paste into Claude Code)

> Read MIGRATION-3D.md in full, then re-read CLAUDE.md and DESIGN.md.
> Execute MG.1 (boundary audit) only, and write the audit report into
> MIGRATION-3D.md under MG.1. Stop there and show me the report — the
> go/no-go is my call. Do not install three or write any render code yet.
> While auditing, also apply the Part B documentation amendments to
> DESIGN.md and CLAUDE.md in the same commit, so the docs match the
> decision even before the code does.
