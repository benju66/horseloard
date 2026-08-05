# ASSETS.md — license ledger

One line per sprite/sound: source, license, attribution. Update in the same
commit that adds the asset.

| Asset | Source | License | Attribution required |
|---|---|---|---|
| `public/icons/icon-192.png`, `public/icons/icon-512.png` | Generated placeholder (`scripts/generate-icons.mjs`, this repo) | CC0 / project-owned | No |
| `public/assets/sprites/enemy-grunt.png` (medievalUnit_09) | Kenney "Medieval RTS" 1.1, kenney.nl/assets/medieval-rts | CC0 | No |
| `public/assets/sprites/enemy-runner.png` (medievalUnit_06) | Kenney "Medieval RTS" 1.1 | CC0 | No |
| `public/assets/sprites/enemy-brute.png` (medievalUnit_20) | Kenney "Medieval RTS" 1.1 | CC0 | No |
| `public/assets/sprites/enemy-shieldbearer.png` (medievalUnit_10) | Kenney "Medieval RTS" 1.1 | CC0 | No |
| `public/assets/sprites/enemy-swarm.png` (medievalUnit_13) | Kenney "Medieval RTS" 1.1 | CC0 | No |
| `public/assets/sprites/tower-archer.png` (medievalStructure_05) | Kenney "Medieval RTS" 1.1 | CC0 | No |
| `public/assets/sprites/tower-bombard.png` (medievalStructure_07) | Kenney "Medieval RTS" 1.1 | CC0 | No |
| `public/assets/sprites/tower-frost.png` (medievalStructure_12) | Kenney "Medieval RTS" 1.1 | CC0 | No |
| `public/assets/sprites/tower-mill.png` (medievalStructure_09) | Kenney "Medieval RTS" 1.1 | CC0 | No |
| `public/assets/sprites/mill-blades.png` (medievalStructure_14) | Kenney "Medieval RTS" 1.1 | CC0 | No |
| `public/assets/sprites/gate.png` (medievalStructure_06) | Kenney "Medieval RTS" 1.1 | CC0 | No |
| `public/assets/sprites/forge.png` (medievalStructure_20) | Kenney "Medieval RTS" 1.1 | CC0 | No |
| `public/assets/sprites/hero.png` (4-frame gallop strip) | Generated (`scripts/generate-hero-sprites.py`, this repo) | CC0 / project-owned | No |

The mounted hero (DESIGN §10's "one hard asset") is generated in-repo — regenerate/iterate via the script. A commissioned directional sheet remains an optional upgrade if the game earns it.

## 3D models (Three.js migration)

All CC0 — free for commercial use, attribution not required. Credited anyway.
Every file below was run through `scripts/optimize-model.mjs`, which keeps only
the animation clips the model manifest maps and then applies gltf-transform's
optimize pass (quantized meshes + webp textures). That took the character pack
from ~40 MB to 2.7 MB with no visible change.

| Asset | Source | License | Attribution required |
|---|---|---|---|
| `public/models/kaykit/Skeleton_Minion.glb` | KayKit Character Pack: Skeletons 1.0 — Kay Lousberg (kaylousberg.com) | CC0 | No |
| `public/models/kaykit/Skeleton_Warrior.glb` | KayKit Character Pack: Skeletons 1.0 | CC0 | No |
| `public/models/kaykit/Skeleton_Rogue.glb` | KayKit Character Pack: Skeletons 1.0 | CC0 | No |
| `public/models/kaykit/Skeleton_Mage.glb` | KayKit Character Pack: Skeletons 1.0 | CC0 | No |
| `public/models/kaykit/Knight.glb` | KayKit Character Pack: Adventurers 1.0 — Kay Lousberg | CC0 | No |
| `public/models/kaykit/Barbarian.glb` | KayKit Character Pack: Adventurers 1.0 | CC0 | No |
| `public/models/kenney-td/tower-round-*.glb` (6) | Kenney "Tower Defense Kit", kenney.nl/assets/tower-defense-kit | CC0 | No |
| `public/models/kenney-castle/{gate,wall,tower-hexagon-*}.glb` (5) | Kenney "Castle Kit", kenney.nl/assets/castle-kit | CC0 | No |
| `public/models/kenney-nature/{tree_*,rock_*,stump_old}.glb` (5) | Kenney "Nature Kit", kenney.nl/assets/nature-kit | CC0 | No |

**Castle and Tower-Defense kits shipped without their texture.** Both are Unity
exports referencing `Textures/colormap.png`, which was never downloaded with the
`.glb` files, so every material fell back to pure white. Two fixes, both in place:

- The renderer substitutes the manifest `tint` for any untextured-and-white
  material (`ModelViewFactory.applyPalette`), so these render in the game's
  own palette — one flat colour per model rather than the atlas's per-part
  variation.
- The dangling reference has been stripped from the files themselves
  (`scripts/strip-missing-texture.mjs`), because the loader was still requesting
  the missing PNG on every boot: 11 failed round trips and 16 console errors,
  costly on a phone and misleading to anyone later debugging a real texture bug.

Fetching the genuine `colormap.png` from the kit downloads would restore per-part
colour; nothing is broken without it. Note the strip is now baked into the
committed `.glb` files, so re-downloading a kit reintroduces the problem — run
the script again if that happens.

**The Nature kit lost its colour the same way, and it was not obvious.** This
file previously recorded it as "unaffected — carries real material colours".
It does not. It went through the same texture-stripping, but instead of leaving
white it kept whatever `baseColorFactor` happened to be in the material:
`leafsGreen` was teal `(0.161, 0.788, 0.671)` and `woodBark` was salmon. Those
are not white, so the renderer's white-repair path deliberately skipped them —
and because the props were separately collapsed to a two-unit blob at the map
origin by a quantisation bug, nobody ever saw the colours to notice.

Fixed by rewriting the factors in the files, keeping the trunk/foliage split that
flattening to a single manifest tint would have destroyed:

```
node scripts/retint-model.mjs public/models/kenney-nature/tree_default.glb      woodBark=#5b4126 leafsGreen=#37592c
node scripts/retint-model.mjs public/models/kenney-nature/tree_pineDefaultA.glb woodBarkDark=#4a3018 leafsDark=#2c4a24
node scripts/retint-model.mjs public/models/kenney-nature/rock_largeA.glb       dirt=#7c7c84 grass=#4a7c3a
node scripts/retint-model.mjs public/models/kenney-nature/rock_smallA.glb       dirt=#7c7c84 grass=#4a7c3a
node scripts/retint-model.mjs public/models/kenney-nature/stump_old.glb         woodBark=#5b4126
```

These are the game's palette colours, not Kenney's originals — the shipped
`.glb` files are modified. Re-downloading the kit reintroduces the junk factors;
re-run the commands above if that happens. CC0 permits modification without
attribution, so the licence row is unchanged.

Each pack's own `License.txt` / `LICENSE.txt` ships alongside its models.

| `public/models/hero/mount-fox.glb` | Khronos glTF-Sample-Assets "Fox" — model by PixelMannen (CC0), rig + animations by @tomkranis (CC-BY 4.0) | CC0 mesh / **CC-BY 4.0 rig+anims** | **Yes — credit @tomkranis if this ships** |

**The fox is a stand-in mount, not the hero's final horse.** It exists to prove
the bone-anchored-rider pipeline end-to-end (rigged quadruped with real
`Walk`/`Survey` clips, static KayKit Knight parented to `b_Spine02_03`) while
asset sites were unreachable from the dev container. Replace the file with a
rigged horse and update `hero-mounted` in `models.json` (file path, clip
names, bone name) — nothing else changes. If it is ever *not* replaced before
release, the CC-BY attribution above becomes a real obligation.

## AI-generated

| Asset | Source | License | Attribution required |
|---|---|---|---|
| `public/models/hero/horse-lord.glb` | Meshy AI, generated by Ben 2026-07-31 (`Art/default_lord.glb`) | **UNCONFIRMED — see below** | ? |

**The hero's licence is an open question and it now matters.** The project is
aiming at release, so "generated by an AI tool" is not by itself a commercial
grant — the terms depend on Meshy's plan tier at the time of generation. Confirm
what the account's plan grants for commercial use and record it here before
shipping. This is the one row in this file that is not settled.

**Status of the hero model.** `horse-lord.glb` went through
`scripts/optimize-character.mjs` (584,858 → 5,990 tris, 42.2 MB → 0.23 MB).
It replaced an earlier `Tier1_Rider` generation; the tier-skin system it was
made for is parked (see `BACKLOG.md`), so this is simply *the* hero now.

**Colour: fine.** Ben confirmed on device 2026-07-31. An earlier note here
called the hero monochrome brown and short of the `#3b5dc9` faction blue — that
was formed against the previous `Tier1_Rider` generation and carried over to
this model without being rechecked. It does not apply.

**Proportions: still open.** Roughly 6–7 heads tall against the 2–2.5 that
`ART-BRIEF.md` specifies. That is prompt-level, not fixable in post without
papering over the cause, and whether it actually clashes with the KayKit
enemies can only be judged on a real phone.

**Scale is set in the manifest, not the model.** `unit-hero` carries
`scale: 1.35`. `buildFromGltf` normalises every bounding box to `UNIT_HEIGHT`,
which gives a fused horse-and-rider the same total height as a lone standing
skeleton — the hero measured 30.0 against a grunt's 27.7 and a runner's 38.2
before this was set. Use `?heroScale=N` to try other values on device without
a rebuild; the number is absolute, so `?heroScale=1.35` is what ships.

**Facing was established indirectly.** The browser pane was unavailable when it
landed, so rather than eyeballing it, its vertex distribution was profiled in
height slices and compared against `Tier1_Rider`, whose +Z facing *was*
confirmed by eye — cosine similarity 0.83, i.e. same orientation. Strong, but
inferential: if the hero ever rides backwards, that inference is the thing that
was wrong, and the fix is a 180° yaw.

It is a single rigid mesh with no skeleton — deliberately. A fused
horse-and-rider is neither a biped nor a quadruped, so auto-rigging has no body
plan to work with. All of its motion is procedural, in
`src/render/mountAnimator.ts`.

The Quaternius horse noted here previously is **no longer needed**: the Meshy
model supplies horse and rider together.
