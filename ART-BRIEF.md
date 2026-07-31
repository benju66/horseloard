# ART-BRIEF.md — making assets for Horse Lord with AI tools

Paste the relevant block into your image LLM or image→3D tool. Everything here is
measured against this codebase, not general advice — the conventions are enforced by
`src/render/entityViews.ts` and `src/data/models.json`, and getting them wrong produces
models that load but sit sideways, underground, or cost six times the draw calls.

---

## 0. First, the honest split — what AI can and cannot do here

| Asset | AI pipeline? | Why |
|---|---|---|
| Towers, gate, forge, walls | ✅ **Yes, ideal** | Static. No rig, no animation. Image→3D handles these well. |
| Rocks, trees, barrels, props | ✅ **Yes, ideal** | Same. |
| **Swarm creature** | ✅ **Yes** | Deliberately rigid and instanced — no skeleton wanted. |
| **Horse, wolf, humanoid enemies, the rider** | ⚠️ **Usually not** | These need a **skeleton and animation clips**. Most image→3D tools output an unrigged single mesh. A horse with no walk cycle is useless — the hero is on screen 100% of the time. |

**Practical plan:** use AI for everything static, keep CC0 packs (KayKit, Quaternius) or
a commission for anything that walks. If your image→3D tool *does* auto-rig with named
clips, great — check the clip names against §4 before committing to it.

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

- **≤3,000 triangles.** Reference: a KayKit skeleton is ~4,800 vertices and looks fine.
  AI image→3D tools routinely emit 100k+ triangles; that must be decimated.
- **ONE mesh per model. This is the big one.** Every separate mesh is a draw call, and
  every shadow-caster costs two. Measured on this project: KayKit characters are modular
  (arm, leg, head, jaw, eyes, cloak — 11 meshes), which produced **822 draw calls at 40
  enemies**. A single-mesh model would have been closer to 160. If your tool offers
  "merge/join meshes", use it.
- **ONE material, ONE texture** per model. Multiple materials split the draw call again.
- **Texture ≤512×512**, and 256 is usually plenty — see §3.
- Run `npm run asset:optimize <file.glb>` afterwards regardless. It quantises meshes and
  converts textures to webp; it took the CC0 character pack from 40 MB to 2.7 MB.

## 3. Style — flat palette, lit by the game

- **Stylised low-poly, flat colour.** No PBR, no normal maps, no roughness/metalness
  maps, no baked ambient occlusion.
- **No baked lighting or shadows in the texture.** The scene lights everything with a
  warm directional sun plus cool hemisphere fill. A texture with painted-in shading will
  fight the lighting and look wrong from the fixed camera angle.
- **Flat albedo only.** Ideally colour comes from large flat patches, which is why a
  256px texture suffices.
- The game's palette — match or stay adjacent to these:

  | | hex | | hex |
  |---|---|---|---|
  | grass | `#4a7c3a` | gold / elite | `#f6c945` |
  | path | `#c9a86a` | hero blue | `#3b5dc9` |
  | stone | `#8f8f96` | enemy red | `#c4452e` |
  | wood | `#6b4a2b` | skin | `#e8b88a` |

- **Faction colour must dominate the silhouette.** Enemies read red, hero reads blue, at
  a glance, at phone size. A colourblind-safe pass is an M4 requirement, so do not rely
  on red-vs-green to distinguish anything.

## 4. Characters — proportions and clips

- **Chibi: 2–2.5 heads tall.** Chunky limbs, oversized weapons, simplified hands/feet.
- **The proportion gate is the rule that matters:** every character must read as one
  family. Drop a new model beside an existing one at gameplay zoom on a phone. If they
  clash, reject it rather than mixing — mixed proportions are the single most obvious
  tell of assembled-from-packs art.
- **The camera looks down at ~55°.** Silhouette from *above* matters more than from the
  front: shoulders, head, and weapon shape carry the read. Feet are nearly invisible.
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

> A single [SUBJECT], stylised low-poly game asset, chibi proportions roughly 2.5 heads
> tall, chunky simplified forms, oversized weapon. Flat solid colours only — no gradients,
> no textures, no painted highlights or shadows. Dominant colour [HEX]. Isolated on a plain
> neutral grey background, no scenery, no ground shadow. Three-quarter view from slightly
> above, as if seen from a camera 55 degrees above the horizon. Even neutral lighting.
> Clean readable silhouette, no thin protruding details.

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

> A single isolated game asset for a stylised low-poly mobile tower-defence game.
> Chibi proportions, roughly 2 to 2.5 heads tall, chunky simplified forms, oversized
> readable details, no thin protruding geometry. Flat solid colours only - no gradients,
> no surface texture, no painted highlights, no baked shadows or ambient occlusion; the
> game lights the model itself. Plain neutral grey background, no scenery, no ground
> shadow, no props other than the subject. Three-quarter view from clearly above, as
> though from a camera 55 degrees above the horizon - the silhouette seen from above is
> what matters most. Even neutral lighting. Clean bold silhouette that stays readable at
> roughly 60 pixels tall on a phone screen.

## SUBJECT blocks

### Hero - the pieces of the composite

| Asset | Subject block |
|---|---|
| **Horse** | A stocky chibi warhorse, side-on stance, short powerful legs, thick neck, no rider. Deep blue barding cloth `#3b5dc9` over a warm brown coat `#6b4a2b`. Broad flat back with a visible saddle, since a rider attaches there. Must read as a horse from directly above - emphasise the length of the back and the shape of head and neck. |
| **Rider** | A chibi mounted archer, seated with legs apart as if astride a horse. Deep blue tunic `#3b5dc9`, simple leather straps. Empty hands - the bow is a separate asset. Confident upright posture, a commander rather than a soldier. |
| **Bow (L1)** | A simple short wooden hunting bow, pale wood `#e8dcc0`, plain string, no ornament. Chunky and readable, not thin. |
| **Bow (L3+)** | An ornate recurve war bow, double-curved limbs, dark wood with gold binding `#f6c945`. Clearly more powerful than a plain shortbow at a glance. |
| **Quiver** | A leather quiver of arrows worn on the back, warm brown `#6b4a2b`, fletching visible above the rim. |
| **Helm** | A chibi knight helm with a tall crest, steel grey `#8f8f96`, deep blue plume `#3b5dc9`. Oversized crest so it reads from above. |
| **Cape** | A flowing short cape seen from behind, deep blue `#3b5dc9` with gold trim `#f6c945`, swept as if moving. |

### Enemies - the design intent is the counter-play

| Asset | Subject block |
|---|---|
| **Grunt** | A basic chibi foot soldier, the baseline enemy. Dull red `#c4452e` tunic, crude short weapon, plain rounded helm. Deliberately unremarkable - every other enemy is read against this one. |
| **Runner** | A lean, lightly-armoured chibi skirmisher built for speed. Red `#c4452e`, minimal gear, forward-leaning posture, no shield, bare arms. Should look fragile and fast at a glance. |
| **Brute** | A massive heavy chibi bruiser, roughly 1.4x the height of a basic soldier and far broader. Dark red `#c4452e`, heavy shoulder plate, huge two-handed club. Reads as slow and dangerous; it physically shoves the hero aside. |
| **Shieldbearer** | A chibi soldier behind an enormous rectangular tower shield held forward, covering most of its body from the front. Steel grey shield `#8f8f96` with a red device `#c4452e`. **The shield must dominate the silhouette from the front and from above** - it is the whole point of the unit, which blocks damage from ahead of it. |
| **Swarm** | A tiny scuttling creature, roughly a third the height of a soldier, appearing in packs. Simple rounded body, dark red `#c4452e`, minimal limbs, no weapon. Must read as a countable blob at very small size - this one renders rigid and is never animated, so pose it neutrally. |
| **Wolf** | A lean chibi warg, low predatory stance, grey-brown fur with red harness `#c4452e`. Broad flat back for a small rider to attach. Should read as fast and unstoppable. |
| **Looter** | A furtive chibi thief carrying a bulging sack over one shoulder. Muted red `#c4452e`, hood, hunched posture, glancing back as if fleeing with something stolen. Gold `#f6c945` spilling from the sack. |
| **Warlord (boss)** | An enormous chibi warlord, roughly twice the height of a basic soldier, dominating the frame. Blackened armour with deep red `#c4452e` accents, tattered dark cape, heavy horned helm or crown, massive weapon. Should read instantly as the most dangerous thing on screen. |

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

