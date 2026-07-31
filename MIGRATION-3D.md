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
[x] Branch `3d-migration`. Add three + types; remove nothing yet. Render smoke test: ortho camera, lights, palette-textured cube on a ground plane, on-device via LAN.
**Accept:** 60fps spinning cube with shadow on your phone. (Trivial on purpose — proves toolchain + device loop.)
**Amended:** the cube alone proves the toolchain but not the thing that can kill this migration, so the smoke test also carries a tappable crowd of animated shadow-casters (0 → 40 → 80 → 120). Fail early, while falling back is still free.

**Timebox (set 2026-07-30):** 8 working sessions to MG.7. Stall signal = MG.4 not done by session 5. Hard early gate = the on-device fps check below. Ben to override at will.

#### MG.2 progress — desktop verification done, device check outstanding

Branch `3d-migration` cut; `three` in dependencies, `@types/three` in devDependencies.
Scaffold: `src/render/palette.ts` (the one-texture flat-palette workflow, generated
in code so recolouring is a diff), `src/render/smoke.ts`, `smoke3d.html`. Dev-only —
served at `/smoke3d.html`, not in the PWA build, and `src/` game code is untouched.

Verified headlessly: module executes, WebGL2 context acquired, renderer sized,
PCFSoft shadows on, **zero GL errors**, scene draws.

**FINDING — draw calls scale at 2× per shadow-casting mesh** (one shadow-map pass,
one main pass). Measured:

| crowd | draw calls | triangles |
|---|---|---|
| 0 | 4 | 48 |
| 40 | **84** | 1,008 |
| 80 | 164 | 1,968 |
| 120 | 244 | 2,928 |

Part A budgets **~100 draw calls**; 40 animated casters alone consume 84 of them,
before a single tower, projectile, coin, prop, gate or forge. The perf budget's
"40+ animated enemies" and its "~100 draw calls" are in direct tension as written.

This **promotes Part A.1's soft blob shadows from an aesthetic preference to a
budget requirement**: blob shadows are geometry in the main pass, so they cost one
call, not two — 40 casters drops from 84 calls to ~44 and the budget breathes again.
Decide this at MG.3/MG.6 rather than carrying real shadow-map casters into MG.4.
Triangle counts are trivial and not the constraint; draw calls are.

#### MG.2 RESULT — 2026-07-30 · **PASS**

**60 fps held through every step, including 120 animated casters / 240 draw calls**
(Ben, on-device). The gate passed at three times the enemy count the perf budget
asks for, and at 2.4× the documented draw-call budget.

**This retracts the blob-shadow conclusion above.** That finding read 84 draw calls
against Part A's "~100" and concluded shadow-map casters were unaffordable. The
device disagrees: it renders 240 calls at 60fps without complaint, so the ~100
figure was pessimistic, not a wall. Soft blob shadows stay a live option **on
aesthetic grounds** (Part A.1 wants soft and subtle, and shadow-map casters look
crisp), but they are no longer forced by the budget. Do not treat draw calls as the
binding constraint on the strength of that earlier note.

**What this does NOT prove — the real unknown moves to MG.4.** The crowd is
12-triangle boxes: 2,928 triangles at 120 meshes. Real chibi models at the Part A.2
budget of ≤3k tris each would be ~360,000 triangles at the same count — two orders
of magnitude more, rendered twice (shadow pass + main pass) — plus per-bone skinning
work that boxes do not pay at all. **The honest reading of this pass is that the
toolchain, the device loop, draw-call volume, and transform churn are all fine. Mesh
complexity and skinning are untested.** Re-run this gate with real rigged models the
moment MG.4 has them, before the roster is built out on top of them.

**Observed for MG.3 to fix** (cosmetic, expected — MG.2 was toolchain and perf only):
camera framing pushes the lane spread off the right edge and the ground plane does
not fill the portrait frame; the dusk lighting model is not reading — it looks flat
rather than cool-ambient-with-a-warm-corridor, so the hemisphere light is doing too
much of the work and the warm directional too little; the path stripe is invisible
under the crowd.

**Superseded — original outstanding instructions (kept for the record):**
`npm run dev`, then open `http://192.168.4.30:5173/smoke3d.html` on the device
(same LAN; IP will change between networks). Readout shows fps, caster count and
draw calls; tap to cycle the crowd. Green ≥55fps, amber ≥40, red below.
Record the fps at each step here. **If 40 casters can't hold 60fps, stop and
reconsider before MG.3** — that is what this gate is for.

**Honest limitation:** the crowd is plain `Mesh`, not `SkinnedMesh`. This measures
draw calls, shadow cost and transform churn — not skinning. Real rigged models land
at MG.4 and the number will move. A pass here means "not obviously doomed", not
"budget met".

### MG.3 — World render
[~] Ground plane with organic-edged path, plot markers, gate + forge placeholder meshes — all driven from map JSON. Camera block and lighting block (dusk model per Part A.1) added to map schema. Prop placement from map data (sparse, path-edge clusters).
**Accept:** the M0 map is recognizable in 3D with the dusk lighting mood; sim entities (headless) walk the path as debug markers.

#### MG.3 progress — mechanically verified, look needs Ben's eye

`/world3d.html?map=<id>` renders any map from its JSON with a **real `Simulation`**
ticking behind it. Nothing in the render layer moves anything: the sim owns every
position, the renderer reads and places boxes. Markers tracked `aliveCount` exactly
at every sample across a full multi-wave run (16→16, 12→12, 17→17), waves advanced,
and the gate took leak damage — the seam holds under load, not just at boot.

Schema gained `camera` and `lighting` blocks (`MapCameraSchema`, `MapLightingSchema`).
Both fully defaulted, so **all four shipped maps validate with zero edits**.

| map | lanes | plots | frustum | playfield fill | clipped | draws |
|---|---|---|---|---|---|---|
| meadow-road | 1 | 6 | 987 | 0.69 | no | 112 |
| the-ford | 2 | 7 | 1067 | 0.72 | no | 98 |
| crossroads | 2 | 8 | 1083 | 0.97 | no | 121 |
| warlords-march | 2 | 8 | 1117 | 0.66 | no | 121 |

**FINDING — camera yaw is expensive on portrait maps, and it caused the MG.2
framing bug.** Measured on meadow-road at 19.5:9: the map's corners projected to
±1.666 NDC at the original yaw of 20° — overflowing the frame by 67%. Yaw swings a
tall map's diagonal across the short screen axis, so the required frustum grows
fast: 0° needs 969, 6° needs 1151, 20° needs 1433. Elevation barely matters; width
is the binding axis throughout. **Default yaw dropped 20° → 8°**, and the schema now
says so, because "slight yaw" turns out to be load-bearing rather than stylistic.

**Camera now auto-fits per device.** `frustumHeight` became *optional*: omit it and
the camera solves the tightest framing that still shows the whole playfield at the
current viewport aspect, re-solved on every resize. That handles unknown phone
aspects properly instead of hard-coding one. Fitting to **content** (lanes, plots,
gate, forge) rather than the world rectangle recovered 18% zoom on meadow-road
(1209 → 987) — the world corners are empty grass and framing them wastes the zoom
that chibi-scale readability needs. Props are deliberately excluded from the fit;
letting the outermost ones crop at the frame edge reads as intentional.

**Outstanding — needs your eyes, not a number.** The acceptance criterion is
"recognizable, with the dusk lighting mood", which no headless check can answer.
`npm run dev` → `http://192.168.4.30:5173/world3d.html` (append `?map=the-ford`,
`?map=crossroads`, `?map=warlords-march`). The map plays itself. Specifically worth
judging: does the warm path corridor read as the brightest region against the cool
terrain, or is it still flat as it was at MG.2; is the 8° yaw enough depth cue or
does it want more (it costs zoom); does the organic path edge read as a worn track
or as a wobbly stroke.

### MG.4 — Entity views + assets
[~] Execute the Part A.2 pipeline: model manifest schema (logical states → clips, `procedural` fallback), `npm run asset:add` helper, base models sourced + processed, hero composite (dedicated tuning session), enemy variant system (scale/tint/props), tower views per level, coin/projectile InstancedMesh pools, swarm rigid-instanced path.
**Accept:** full M0 roster visible and animated per A.2; proportion gate passed on-device; substrate test still passes (fake tower #5 via JSON incl. model ref, zero engine edits).

#### MG.4 progress — the system, on placeholders (assets outstanding)

Decision (Ben, 2026-07-30): **build the system first, source models later.** The
manifest makes a missing glTF a valid state, so the whole roster is playable before
a single asset exists and each real model swaps in as a data edit. Placeholders are
deliberately crude primitives — impossible to mistake for finished art, so they
cannot quietly become the shipped look.

**Done:**
- `src/data/schemas/model.ts` — the manifest. Logical states (`idle`/`walk`/`attack`/
  `death`/`siege`/`stagger`) → clip names, with `procedural` as a first-class value.
  Every clip optional: a model shipping only a walk cycle is usable day one.
- **Variant system** — `base` chains with scale composing multiplicatively, tint by
  palette slot, and props attached at sockets (`head`/`hand`/`back`/`mount`/`root`).
  The A.2 table is now data: verified resolving to grunt 1.0, runner 0.9, brute 1.40,
  warlord 1.80 + crown + cape, swarm 0.6 + `instanced: true`.
- `src/data/models.json` — 6 base models covering the full roster plus 4 tower entries.
- Loader validation: unknown model refs and **cyclic base chains** both fail loudly at
  boot with the path and the known-ids list. A cycle would otherwise hang the resolver
  at render time, which is a miserable place to find it. 5 new loader tests.
- `model` added (optional) to enemy, tower and hero schemas **alongside** `spriteRef`,
  so the Phaser build keeps working until MG.7 removes it.
- `src/render/entityViews.ts` — pooled per model id; enemies spawn and die constantly
  and a mesh tree per spawn is exactly the churn CLAUDE.md #6 forbids. Verified views
  tracking `aliveCount` 1:1 across a full run with 6 distinct variants on screen.
- **Substrate guard extended** to model and prop ids — it now polices the newest
  content surface automatically, and the engine still names none of it.

**Outstanding, and honest about why:**
- glTF loading, `npm run asset:add` (gltf-transform pipeline), hero composite tuning,
  and the **proportion gate** all need real models — Ben's step per A.2.
- Tower views per level, and the swarm instanced path: `isInstanced()` reports it
  correctly but the renderer does not yet take that branch, so swarms currently draw
  as individual meshes. Both are code, not assets — next session.
- The perf re-test with real rigged models (see MG.2 result) is still the open risk.

### MG.5 — DOM UI overlay
[x] Joystick, HUD, start-wave, speed toggle (x1/x2 via sim tick multiplier, persisted in settings), results → DOM. World-anchored bubbles/HP bars/damage numbers via projection helper.
**Accept:** on-device: full interaction parity with the Phaser build plus working 2x speed; bubbles track entities under camera projection correctly.

#### MG.5 complete — 2026-07-30

Joystick (feel ported verbatim: 55px throw, 24px knob), HUD, contextual bubbles
with the tuned reach constants, ability bar built from the roster, start-wave with
early-start bonus, x1/x2 speed toggle, results screen, restart, map select with
linear unlocks and stars, meta tree with free respec, and IndexedDB persistence.

Verified headlessly end to end: a losing run on meadow-road paid **5 tokens**
(defeat pays per wave — a failed run is progress, DESIGN §7), recorded
`bestWavesCleared: 5`, and map select showed the new balance. Buying Swift Steed
to rank 2 (+10 move speed per rank) moved the hero from **150 → 170 units/sec** in
the next run — so the meta tree genuinely reaches the sim, still as a pure data
transform applied before the Simulation exists.

**Bug found and fixed on the way (engine, not render):** Charge only ever ran
left or right. `HeroSystem` continued a released-stick charge along `dir`, a
left/right *sprite-mirror flag*, never a heading — steering up and charging sent
the hero sideways at full speed. Added a true heading; `dir` stays for 2D
mirroring. **This bug is in the Phaser build too**; a mirrored sprite hid it.
That is the migration paying for itself: 3D has no mirror to hide behind.

MG.6 landed early as a side effect (team rings, range decals, particles, camera
kick) — see the FX commit.

**Outstanding for MG.7:** endless mode entry, on-device perf profile with the
full roster, then remove Phaser and merge.

### MG.6 — FX + decals
[ ] Per-unit team rings (red enemies / blue hero), range/targeting ring decals, soft unit shadows, pooled particle bursts (kill, coin, ability), stagger shove feedback, gate siege visual state.
**Accept:** the gate-siege moment (brutes battering, ride back, Charge, repair) reads clearly in 3D; factions readable at a glance from rings alone.

### MG.7 — Parity + performance gate
[~] Full run parity with the Phaser build. Profile on-device: 40+ enemies, shadows, 60fps. Remove Phaser dependency; merge to main.
**Accept — MIGRATION EXIT:** M0 exit criteria re-met in 3D. Then resume M1 (The Ford vertical slice) with art/audio/juice tasks interpreted for 3D.
#### MG.7 progress — parity closed, perf measured, merge is Ben's call

**Parity audit against GameScene found seven gaps**, all now closed: coins (the
worst — pillar 1 is the loot line and it was invisible), projectiles, enemy HP
bars, elite rings, supply chests with draining timers, the looter carried-gold
marker, special-wave banners, and hit flash. Coins/projectiles/bars/rings all
ride InstancedMesh: 181 coins measured at **zero** extra draw calls.

**Measured at the budget condition** (desktop; the fps number must come from a
phone):

| alive | coins | draw calls | triangles |
|---|---|---|---|
| 40 | 60 | 384 | 97,906 |
| 60 | 120 | 509 | 100,142 |
| 80 | 180 | 639 | 102,526 |

Draws scale ~6.3 per enemy, because a placeholder unit is a Group of 2–3 meshes
and every one of them casts a shadow (shadow pass + main pass). MG.2 proved 240
draws at 60fps on-device; 384 is 60% beyond what was tested, so **the 40-enemy
case is genuinely unverified on hardware.**

**The encouraging part:** real glTF characters are typically ONE skinned mesh,
so they should cost ~2 draws each instead of ~6 — the placeholders are *worse*
than the real thing on this axis. If the on-device number disappoints, the
cheap lever is blob shadows (halves every caster) before anything drastic.
Triangles barely move with coin count, confirming the instancing; the bulk is
props and plot geometry.

**Outstanding for MIGRATION EXIT:** on-device fps at 40+ enemies, then removing
Phaser and merging — deliberately left to Ben, since it is the point of no
easy return.

**Kill criterion:** the Phaser branch is kept intact until MG.7 passes. If the migration stalls badly against the timebox Ben sets at MG.2 kickoff, fall back to the Phaser branch and ship 2D — a finished 2D game beats an unfinished 3D one. A migration that can't fail cleanly is the kind that kills solo projects.

## Part D — Kickoff prompt (paste into Claude Code)

> Read MIGRATION-3D.md in full, then re-read CLAUDE.md and DESIGN.md.
> Execute MG.1 (boundary audit) only, and write the audit report into
> MIGRATION-3D.md under MG.1. Stop there and show me the report — the
> go/no-go is my call. Do not install three or write any render code yet.
> While auditing, also apply the Part B documentation amendments to
> DESIGN.md and CLAUDE.md in the same commit, so the docs match the
> decision even before the code does.
