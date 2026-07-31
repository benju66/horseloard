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
