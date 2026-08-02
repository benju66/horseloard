# ART-BRIEF.md — making assets for Horse Lord

Paste the relevant block into your image LLM or image→3D tool. Everything here is
measured against this codebase, not general advice — the conventions are enforced by
`src/render/entityViews.ts` and `src/data/models.json`, and getting them wrong produces
models that load but sit sideways, underground, or cost six times the draw calls.

> **Re-aimed at Thronefall, 2026-08-02.** This document previously briefed against
> *Kingshot* (via `MIGRATION-3D.md` A.1) and asked for chibi 2–2.5-heads-tall
> characters with oversized weapons. That is the wrong target and, more
> importantly, an unreachable one: Kingshot's units are painted 2D sprites with
> baked outlines and baked lighting, not 3D models. Thronefall is flat-shaded 3D
> whose polish comes from lighting and composition, which this renderer can
> actually do — see `DESIGN.md` §10.
>
> **What changed for asset production:** simpler and more solid, not cuter. No
> faces, no fine detail, no oversized props. Silhouette and flat colour carry the
> read. One mesh and one material per unit is now the headline constraint, ahead
> of triangle count.

---

## 0. First, the honest split — what AI can and cannot do here

| Asset | AI pipeline? | Why |
|---|---|---|
| Towers, gate, forge, walls | ✅ **Yes, ideal** | Static. No rig, no animation. Image→3D handles these well. |
| Rocks, trees, barrels, props | ✅ **Yes, ideal** | Same. |
| **Swarm creature** | ✅ **Yes** | Deliberately rigid and instanced — no skeleton wanted. |
| **Horse, wolf, humanoid enemies, the rider** | ✅ **Yes, with Meshy** | Superseded 2026-07-31. Generic image→3D tools output unrigged meshes, but **Meshy auto-rigs bipeds AND quadrupeds** and applies preset motion clips — which covers the horse and wolf. See §10. |

**Practical plan (revised):** Meshy can do the whole roster including rigged characters.
See §10 for its exact settings. Keep the CC0 packs as a fallback and as the proportion
reference — whatever Meshy produces has to sit beside the existing KayKit skeletons
without clashing.

---

## 1. Hard technical constraints (non-negotiable — the code assumes these)

- **Format:** `.glb` (binary glTF). Not `.fbx`, not `.obj`, not `.blend`.
- **Up axis: Y-up.** glTF is Y-up by convention; if your tool exports Z-up, convert.
- **Facing: the model must face +Z at rest.** The renderer rotates by
  `atan2(headingX, headingY)`, so a model authored facing +X or −Z will walk sideways
  or backwards forever.
- **Origin at the feet**, centred on X/Z. The model sits on the ground plane at y=0.
- **Scale does not matter.** Height is auto-normalised from the bounding box to a
  common unit, so author at whatever size is convenient. Relative proportions between
  parts *do* matter.

## 2. The budget — where AI output usually goes wrong

- **ONE mesh per model. This is the headline constraint**, ahead of triangle
  count. Every separate mesh is a draw call. Measured on this project on
  2026-08-02, sampling `renderer.info` as waves grew: the modular KayKit
  characters (arm, leg, head, jaw, eyes, cloak — 11 meshes) cost **19.5 draw
  calls and ~10,500 triangles per enemy**, which extrapolates to ~846 draws at 40
  enemies. A single-mesh unit is ~1. If your tool offers "merge/join meshes", use
  it.
- **≤3,000 triangles**, and for this art direction far fewer is usually better —
  a solid, faceted shape wants tens of faces, not thousands. AI image→3D tools
  routinely emit 100k+ triangles; that must be decimated.
- **ONE material.** Two materials on one mesh is two draw calls. Prefer per-face
  colour from `baseColorFactor` over a texture; if the model declares a `tint` in
  `models.json` the renderer replaces its materials anyway, so a texture is dead
  weight.
- **No texture at all is the target.** If one is unavoidable, ≤512×512.
- **Skinned characters carry a hidden per-instance cost.** `SkeletonUtils.clone`
  mints a fresh `Skeleton` per unit, and each carries its own bone matrix texture
  — measured at ~9 texture allocations per enemy, 207 live at 23 enemies. That is
  inherent to cloned skinned meshes, not a bug, and it is the strongest argument
  for keeping rigs minimal or avoiding them entirely on high-count units.
- Run `npm run asset:optimize <file.glb>` afterwards regardless. It quantises meshes and
  converts textures to webp; it took the CC0 character pack from 40 MB to 2.7 MB.
  **Note:** quantisation stores positions as normalised int16, so any code that
  bakes a world matrix into that geometry must widen it to float first — see
  `bakeGeometry` in `src/render/world.ts` for the bug this caused.

## 3. Style — flat colour, lit by the game

- **Flat-shaded low-poly, solid colour.** No PBR, no normal maps, no
  roughness/metalness maps, no baked ambient occlusion. Ideally **no texture at
  all** — per-face solid colour is the target, and a model whose colour comes
  entirely from `baseColorFactor` is the ideal case, not a compromise.
- **No baked lighting or shadows.** The scene lights everything with a low raking
  sun plus a hemisphere fill, and it does it twice — once for day, once for
  night. Painted-in shading is baked to *one* time of day and will fight the
  other.
- **Faceted, not smooth.** Flat-shaded normals along hard edges are what make the
  key light readable. Smoothed normals on a low-poly mesh read as soft plastic.
- The game's palette — match or stay adjacent to these
  (`src/render/palette.ts` is the source of truth):

  | | hex | | hex |
  |---|---|---|---|
  | grass | `#4a7c3a` | gold / elite | `#f6c945` |
  | path | `#c9a86a` | hero blue | `#3b5dc9` |
  | stone | `#8f8f96` | enemy red | `#c4452e` |
  | wood | `#6b4a2b` | skin | `#e8b88a` |
  | enemy red dark | `#8e2f20` | enemy red light | `#e0673f` |
  | blackened | `#3d3646` | | |

- **A declared `tint` in `models.json` overrides the model's own materials.** The
  unit renders flat in that palette slot whatever it shipped with. Opt out with
  `"keepMaterials": true` when a model's colours were chosen deliberately — the
  hero is the only current case.
- **Faction colour must dominate the silhouette.** Enemies read red, hero reads
  blue, at a glance, at phone size. Weight reads through value: heavier and more
  dangerous is darker, faster and more fragile is lighter. A colourblind-safe
  pass is an M4 requirement, so do not rely on red-vs-green to distinguish
  anything.

## 4. Characters — proportions and clips

- **Simple and solid.** Compact, sturdy proportions — roughly 3–3.5 heads,
  closer to a chess piece than a doll. **Not chibi:** the previous 2–2.5-heads
  brief came from Kingshot, and it implies faces, oversized weapons and painted
  detail that a flat-shaded model under one key light cannot carry.
- **No facial detail.** At the size these render, a face is noise. Head shape,
  helmet profile and shoulder line carry the identity.
- **The family gate is the rule that matters:** every character must read as one
  family. Drop a new model beside an existing one at gameplay zoom on a phone. If
  they clash, reject it rather than mixing — mixed proportions are the single most
  obvious tell of assembled-from-packs art.
- **The camera looks down at ~55°.** Silhouette from *above* matters more than
  from the front: shoulders, head, and weapon shape carry the read. Feet are
  nearly invisible.
- **Shadows are part of the design.** The key light rakes at ~20–26°, so every
  model lays a long shadow. Shapes that read well from above also need a
  *shadow* that reads — a distinctive head or shoulder profile earns its keep
  twice.
- **Animation clips.** The manifest maps logical states → clip names, so any names work
  as long as `src/data/models.json` matches. If your tool lets you name them, use:

  | logical state | when it plays |
  |---|---|
  | `idle` | standing still |
  | `walk` | moving along the lane |
  | `attack` | striking |
  | `death` | on kill |
  | `siege` | battering the gate |
  | `stagger` | knocked back |

  A model shipping **only a walk cycle is usable day one** — unmapped states fall back to
  `procedural` (code-driven motion). Do not block on a full animation set.

- **Attachment sockets** exist for composited variants (`head`, `hand`, `back`, `mount`,
  `root`) — that is how one base model becomes six enemies via props, scale and tint.
  Keep the chest/back/head area unobstructed so props can hang there.

## 5. What is actually still needed

| Asset | Priority | Notes |
|---|---|---|
| **Horse** (hero mount) | 🔴 highest | Needs a walk cycle. Hero is on screen constantly. Rider parents to the `mount` socket. |
| **Wolf** | 🟠 | Wolf Rider's mount, same composite technique. |
| **Swarm creature** | 🟡 | Small, rigid, no rig — instanced. Good AI candidate. |
| Gate / forge | 🟡 | Kenney models downloaded but not yet wired; AI could replace them. |
| Tower per-level variants | 🟢 | Level currently reads as height only. |

---

## 6. Copy-paste prompt blocks

### For an image LLM (concept art to feed an image→3D tool)

> A single [SUBJECT], flat-shaded low-poly game asset, compact sturdy proportions
> roughly 3 heads tall, simplified geometric forms, faceted surfaces with visible
> flat planes. No facial features. Flat solid colours only — no gradients, no
> textures, no painted highlights or shadows, no outlines. Dominant colour [HEX].
> Isolated on a plain neutral grey background, no scenery, no ground shadow.
> Three-quarter view from slightly above, as if seen from a camera 55 degrees
> above the horizon. Even neutral lighting. Bold readable silhouette, no thin
> protruding details. Minimalist — the kind of shape that reads at 40 pixels tall.

Swap `[SUBJECT]` and `[HEX]`. For enemies use `#c4452e`, for the hero `#3b5dc9`.

### For an image→3D / text→3D tool

> Output: single merged mesh, under 3000 triangles, one material, one texture at 512x512
> or smaller. Flat unlit-style albedo texture with no baked lighting or ambient occlusion.
> Y-up orientation, model facing +Z, origin at the base of the feet and centred on X and Z.
> Export as .glb. No PBR maps, no normal map, no metalness or roughness map.

### After it lands

```bash
npm run asset:optimize public/models/<yours>.glb
```

Then add a `file` entry in `src/data/models.json`, plus a line in `ASSETS.md` recording
source and licence **in the same commit** — CLAUDE.md requires it, and retrofitting
attribution before publishing is misery.

---

## 7. Licence warning — this one actually matters now

The project is aiming at **release**, so provenance is no longer cosmetic. Everything
currently in the repo is CC0. Before using any AI-generated asset commercially, check
that tool's terms — some grant full rights, some claim a licence over outputs, and some
are trained on data with contested provenance. Record whatever you learn in `ASSETS.md`
alongside the asset, exactly as the CC0 packs are recorded. A ledger that is honest about
uncertainty is worth far more later than one that quietly says "AI generated".

---

# 8. Per-asset prompt pack

**How to use:** paste **SHARED SPEC** first, then one **SUBJECT** block. The shared spec
carries every technical constraint; the subject block carries design intent. Each subject
description encodes what the thing *does* in the game, because art that reads its function
beats art that is merely pretty — a player must identify a shieldbearer at phone size in
half a second.

## SHARED SPEC — prepend to every prompt

> A single isolated game asset for a minimalist flat-shaded low-poly mobile
> tower-defence game. Compact sturdy proportions, roughly 3 heads tall, simplified
> geometric forms with faceted flat planes, no facial features, no thin protruding
> geometry. Flat solid colours only - no gradients, no surface texture, no painted
> highlights, no outlines, no baked shadows or ambient occlusion; the game lights
> the model itself with a low raking sun. Plain neutral grey background, no
> scenery, no ground shadow, no props other than the subject. Three-quarter view
> from clearly above, as though from a camera 55 degrees above the horizon - the
> silhouette seen from above is what matters most. Even neutral lighting. Bold
> simple silhouette that stays readable at roughly 40 pixels tall on a phone
> screen. Think elegant and understated rather than detailed or cute.

## SUBJECT blocks

### Hero - the pieces of the composite

| Asset | Subject block |
|---|---|
| **Horse** | A stocky flat-shaded warhorse, side-on stance, short powerful legs, thick neck, no rider. Deep blue barding cloth `#3b5dc9` over a warm brown coat `#6b4a2b`. Broad flat back with a visible saddle, since a rider attaches there. Must read as a horse from directly above - emphasise the length of the back and the shape of head and neck. |
| **Rider** | A simplified mounted archer, seated with legs apart as if astride a horse. Deep blue tunic `#3b5dc9`, simple leather straps. Empty hands - the bow is a separate asset. Confident upright posture, a commander rather than a soldier. |
| **Bow (L1)** | A simple short wooden hunting bow, pale wood `#e8dcc0`, plain string, no ornament. Chunky and readable, not thin. |
| **Bow (L3+)** | An ornate recurve war bow, double-curved limbs, dark wood with gold binding `#f6c945`. Clearly more powerful than a plain shortbow at a glance. |
| **Quiver** | A leather quiver of arrows worn on the back, warm brown `#6b4a2b`, fletching visible above the rim. |
| **Helm** | A simple knight helm with a tall crest, steel grey `#8f8f96`, deep blue plume `#3b5dc9`. The crest is the whole silhouette from above - keep it a single bold shape, not a detailed plume. |
| **Cape** | A flowing short cape seen from behind, deep blue `#3b5dc9` with gold trim `#f6c945`, swept as if moving. |

### Enemies - the design intent is the counter-play

| Asset | Subject block |
|---|---|
| **Grunt** | A basic foot soldier, blocky and solid, the baseline enemy. Dull red `#c4452e` tunic, crude short weapon, plain rounded helm. Deliberately unremarkable - every other enemy is read against this one. |
| **Runner** | A lean, lightly-armoured skirmisher built for speed. Light red `#e0673f`, minimal gear, forward-leaning posture, no shield, bare arms. Should look fragile and fast at a glance. |
| **Brute** | A massive heavy bruiser, roughly 1.4x the height of a basic soldier and far broader. Dark red `#8e2f20`, heavy shoulder plate, one heavy two-handed weapon read as a single slab. Reads as slow and dangerous; it physically shoves the hero aside. |
| **Shieldbearer** | A soldier behind an enormous rectangular tower shield held forward, covering most of its body from the front. Steel grey shield `#8f8f96` with a red device `#c4452e`. **The shield must dominate the silhouette from the front and from above** - it is the whole point of the unit, which blocks damage from ahead of it. |
| **Swarm** | A tiny scuttling creature, roughly a third the height of a soldier, appearing in packs. Simple rounded body, dark red `#c4452e`, minimal limbs, no weapon. Must read as a countable blob at very small size - this one renders rigid and is never animated, so pose it neutrally. |
| **Wolf** | A lean warg, low predatory stance, grey-brown fur with red harness `#c4452e`. Broad flat back for a small rider to attach. Should read as fast and unstoppable. |
| **Looter** | A furtive hooded thief carrying a bulging sack over one shoulder. Muted red `#c4452e`, hood, hunched posture, glancing back as if fleeing with something stolen. Gold `#f6c945` spilling from the sack. |
| **Warlord (boss)** | An enormous warlord, roughly twice the height of a basic soldier, dominating the frame. Blackened armour `#3d3646` with deep red `#c4452e` accents, tattered dark cape, heavy horned helm or crown, massive weapon. Should read instantly as the most dangerous thing on screen. |

### Towers - four roles, four distinct silhouettes

| Asset | Subject block |
|---|---|
| **Archer tower** | A slim wooden watchtower with an open railed platform and peaked roof, warm wood `#6b4a2b` on a grey stone base `#8f8f96`. Tall and narrow - the cheap reliable single-target tower. |
| **Bombard tower** | A squat heavy stone emplacement with a short wide-mouthed mortar angled upward, grey stone `#8f8f96` with dark iron `#44464e`. Wide and low, obviously slow and powerful. |
| **Frost spire** | A slender crystalline spire, pale blue-white ice over a stone base `#8f8f96`, faceted geometric crystal forms. Should read as magical and cold rather than mechanical - it slows rather than damages. |
| **Mill** | A small windmill with four broad sails, wooden body `#6b4a2b`, thatched roof. Peaceful and civilian - it generates gold and never attacks. Sails should be a separate flat piece so they can spin. |

### Structures and props

| Asset | Subject block |
|---|---|
| **Gate** | A fortified stone gatehouse with a heavy timber portcullis between two squat round towers, grey stone `#8f8f96` and dark wood `#4a3018`, banners in deep blue `#3b5dc9`. This is what the player defends - it must look worth defending and read clearly as the goal from above. |
| **Forge** | A small blacksmith's hut with a stone chimney and a glowing forge opening, wood `#6b4a2b` and stone `#8f8f96`, warm orange glow at the opening. Reads as somewhere you ride to and interact with. |
| **Tree** | A stylised low-poly tree, chunky conical or rounded canopy in deep green `#37592c` on a short brown trunk `#5b4126`. Roadside dressing seen from above, no fine branches. |
| **Rock** | A faceted low-poly boulder, angular flat planes, grey `#7c7c84`. Simple roadside dressing. |

## 9. Priority order

1. **Horse** - blocks the hero composite, and the hero is on screen constantly
2. **Gate** - permanently visible, currently a procedural box
3. **Wolf** - the Wolf Rider's mount
4. **Swarm** - the one character-shaped asset AI does well, since it is never rigged
5. Towers - currently generic Kenney pieces, functional but interchangeable-looking
6. Hero progression props (quiver, helm, cape, recurve bow) - see `HERO-DESIGN.md` section 4
7. Forge, trees, rocks - Kenney models already downloaded, just unwired

---

# 10. Meshy — exact settings for characters

Meshy auto-rigs **bipeds, quadrupeds and winged** body plans, ships 600+ preset motion
clips, exports GLB, and exposes a target-polycount slider. That covers everything this
project still needs, including the horse and wolf.

**One structural advantage over the CC0 packs:** Meshy outputs a *single merged mesh*.
KayKit characters are modular — 11 meshes each — which is why 40 enemies cost 822 draw
calls. A single-mesh character should cost roughly 2 draws instead of ~18. If Meshy
characters replace the KayKit ones, that problem largely solves itself.

## Prompt (paste SHARED SPEC from §8, then the SUBJECT block, then this)

> Full body, standing in a neutral A-pose, arms slightly away from the body, facing the
> viewer directly. Symmetrical. Feet flat and together on the ground. No base, no plinth,
> no ground plane.

A-pose matters — auto-rigging is far more reliable from a clean neutral pose than from a
dynamic one, and the game applies all motion itself.

## Generation settings

| Setting | Value | Why |
|---|---|---|
| Topology | **Quad** (remesh) | Edge loops at joints deform far better when animated. glTF triangulates on export anyway, so there is no cost. |
| Target polycount | **~3,000 tris** | Budget from Part A.2. Reference: a KayKit skeleton is ~4,800 verts and reads fine. |
| Symmetry | **On** | Characters are symmetrical; it produces cleaner topology and a better rig. |
| PBR / material maps | **Off if offered** | The game uses flat albedo under its own lighting. Normal, roughness and metalness maps are dead weight here and can fight the dusk lighting. If they come through anyway, strip them before shipping. |
| Texture style | Flat / stylised, **no baked lighting** | Painted-in highlights and shadows conflict with the scene's warm sun over cool fill. |

## Rigging and animation

- **Body plan:** biped for humanoids and the rider; **quadruped for the horse and wolf**.
- **Clips to apply** — the game maps logical states to clip names, so pick the nearest
  equivalents from Meshy's library:

  | Game state | Ask Meshy for | Priority |
  |---|---|---|
  | `walk` | walk or trot cycle, looping | **essential** |
  | `idle` | idle / breathing, looping | **essential** |
  | `attack` | short melee strike, one-shot | nice to have |
  | `death` | death / collapse, one-shot | nice to have |
  | `siege` | reuse the attack clip | optional |
  | `stagger` | hit reaction, short | optional |

  **A model shipping only `walk` and `idle` is usable day one.** Unmapped states fall back
  to `procedural` motion in code. Do not block on a full set.

- **Keep `attack` very short.** The bow fires as often as every 0.25s at level 6; a long
  draw animation will look frantic and desynced.
- **The rider needs no leg animation** — it is seated on the horse. Real saving.

## Export

- Format: **GLB**. Not FBX, not USDZ.
- Then verify three things the tool will not do for you, and fix in a DCC app if wrong:
  1. **Facing +Z.** The renderer rotates by `atan2(headingX, headingY)`; a model facing
     the wrong way walks backwards forever. This is the single most likely thing to be
     wrong out of the box.
  2. **Origin at the feet**, centred on X and Z.
  3. **Y-up.** GLB is Y-up by convention, so this is usually fine.
- Scale is irrelevant — height is auto-normalised from the bounding box.

## Then

```bash
npm run asset:optimize public/models/<yours>.glb
```

Add the `file` and `clips` mapping to `src/data/models.json`, and a line in `ASSETS.md`
recording Meshy as the source **with whatever its terms say about commercial rights** —
the project is aiming at release, so that field is no longer cosmetic.

## The check that actually decides it

Drop the first Meshy character beside an existing KayKit skeleton at gameplay zoom on a
phone. **If the proportions clash, the answer is not to keep the Meshy one and hope** —
it is to either re-prompt toward the existing family or commit to regenerating the whole
roster in Meshy so everything matches. Mixed proportions are the most obvious tell of
assembled-from-parts art, and the hero is the reference everything else is judged against.

