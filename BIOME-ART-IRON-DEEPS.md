# BIOME-ART-IRON-DEEPS.md — environment art for The Iron Deeps

One of three biome art docs (with `BIOME-ART-GREEN-ROAD.md` and
`BIOME-ART-LONG-STEPPE.md`). Format matches `GATE.md` and `MESHY-PROMPTS.md`: the
place, the rules, a prop roster, and one assembled copy-paste Meshy prompt per asset.
BIOMES.md governs what a biome *is*; this doc only covers how this one looks.

---

## 1. The place

Quarry cuts and pit-heads — *"close walls, cold light, and things that do not stop"*
(BIOMES.md C.2). The armour biome: brutes, shieldbearers, halberdiers, juggernauts,
wardens, under the `narrow-cuts` rule (tower range −18%, because the walls are close).
The art job: **industrial, cut, claustrophobic**. Nothing grows here on purpose;
everything standing was either dug out or built to dig. Where the Green Road's props
say "life going on", these say "work stopped". The dressing should make the range
nerf feel *right* — you can't see far because the ground itself is in the way.

## 2. Palette

From `src/data/biomes.json` (`iron-deeps.lighting`). Props render under both presets —
never bake either in. Note this biome overrides more of the preset than the others:
cold sun, higher ambient, steeper elevation.

| | day | night |
|---|---|---|
| ground | `#7d7466` dusty warm-grey | `#4f5a5e` cold grey |
| path | `#a89272` worn earth | `#8b8a80` grey |
| sun | `#f0ead8` cold-white, high | `#a9bedd` blue moonlight |
| fog | `#b6b3a6` dust, density 0.45 | `#2b3442`, density 0.5 |

**Colour guidance for props:** the trap here is grey-on-grey — the ground is already
warm grey, so quarry stone must sit **cooler and either darker or lighter** than
`#7d7466` to read as an object: cut rock in `#5a5c64`–`#8f8f96`, never in the ground's
own family. Mine timber is dark and oiled (`#4a3018`), darker than Green Road wood.
Iron is `#44464e`. The single permitted warm accent is lantern flame (`#e8a03c`) —
one warm spark against the cold light, used exactly once in the set.

## 3. What's there today

Every biome currently draws from one hardcoded list (`PROP_KINDS`,
`src/render/world.ts:699`): Kenney oak, pine, two rocks, and a stump. A healthy green
oak in a quarry actively fights the biome read. The rosters in these three docs
replace that with per-biome sets.

## 4. Rules for props (all biomes, stated once per doc)

- **Props are backdrop.** They cluster beside the road and must never be mistaken for
  a tower, an enemy, or a pickup. Low saturation, no faction colours. In this biome
  especially: nothing that silhouettes like a tower — the headframe (§5) is the one
  tall structure, and it reads as scaffolding, not masonry.
- **Silhouette from 55° above** is the only view that matters, and the low raking sun
  lays long shadows — angular quarry shapes throw the best ones in the game. Lean on
  hard diagonal cuts.
- **The scale anchor:** the Green Road oak is 46 world-units; rocks 8–13. Each roster
  row declares a height; the renderer normalises the model to it.
- **One material per model, and as few distinct colours across the set as possible.**
  Props merge into shared static geometry keyed by material — every distinct material
  in the biome's prop layer is one draw call.
- **Scenery, not systems.** DESIGN.md's structure policy is *exactly two* gameplay
  structures (Gate, Forge). The headframe and shoring are dressing — no interaction,
  and they must not look interactable.

## 5. Roster

| id | asset | height | why it belongs |
|---|---|---|---|
| `iron-deadtree` | bare dead tree | 40 | the one organic shape, and it's dead — the biome in a single prop |
| `iron-slab` | quarried slab boulder | 16 | cut, not weathered: flat faces, drill lines |
| `iron-strata` | layered rock column | 34 | the close walls, sampled — tall enough to block sightlines visually |
| `iron-headframe` | timber pit-head | 44 | the biome's landmark structure; "pit-heads" made literal |
| `iron-orecart` | ore cart on stub rails | 12 | industry, interrupted |
| `iron-shoring` | mine-mouth timber brace | 20 | a doorway into the dark at the map's edge |
| `iron-oreheap` | spoil heap with ore glints | 9 | ground clutter that says digging |
| `iron-lantern` | iron lantern post | 22 | the set's one warm accent |

## 6. Assembled Meshy prompts

### iron-deadtree

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 30 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a dead bare tree: a stout weathered grey-brown trunk (#5c5148) splitting into three or four thick leafless limbs, no foliage at all. The limbs must be chunky and faceted, never thin twigs - a broken fork silhouette against the sky. Long dead, standing out of stubbornness.

Output: single merged mesh, under 500 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### iron-slab

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 20 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a large quarried stone slab boulder in cool grey (#5a5c64): flat cut faces and hard straight edges rather than natural weathering, tilted as if levered off a rock face and abandoned. Cut by tools, not by rain - the difference between this and a river boulder should be obvious at a glance.

Output: single merged mesh, under 300 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### iron-strata

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 30 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a tall column of layered quarry rock: stacked horizontal bands of stone alternating between cool grey (#5a5c64) and lighter grey (#8f8f96), with one vertical cut face where the quarry sliced through it. A piece of the pit wall left standing. Broad, angular, obviously heavy.

Output: single merged mesh, under 400 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, cut face toward +Z, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### iron-headframe

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 35 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a timber mine pit-head: an A-frame of heavy dark oiled beams (#4a3018) straddling a low stone shaft collar (#5a5c64), carrying one large iron wheel (#44464e) at the apex. The A-frame and wheel silhouette is the entire identity - it must read as mining headgear, scaffolding rather than a building. Keep every beam thick. Scenery only; it must not look like something a player can use.

Output: single merged mesh, under 600 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, model facing +Z, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### iron-orecart

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 20 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a small iron mine cart (#44464e) heaped with dark ore, standing on a short stub of two rails on wooden sleepers (#4a3018) that end abruptly at both sides. The cart is a simple angular hopper on four small solid wheels. Work stopped mid-shift - the cart still loaded.

Output: single merged mesh, under 400 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, rails running along the X axis, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### iron-shoring

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 25 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a mine entrance timber brace: two heavy upright posts and a thick lintel beam in dark oiled wood (#4a3018), framing a dark opening set into a low mound of grey rock (#5a5c64). The dark rectangle of the opening under the heavy frame is the read - a doorway into the underground. The opening is solid near-black (#1d1b22), not a hole in the mesh.

Output: single merged mesh, under 400 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, opening facing +Z, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### iron-oreheap

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 15 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a low conical spoil heap of quarry rubble in grey (#6a675f), studded with a few chunky angular lumps of dark iron ore (#44464e) near the top. A faceted mound, wider than tall. Ground clutter that says digging happened here.

Output: single merged mesh, under 250 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### iron-lantern

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 20 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a mine lantern post: a single sturdy iron pole (#44464e) on a small stone footing (#5a5c64), with a simple boxy iron lantern hanging from a short arm at the top. The lantern's panes are flat warm amber (#e8a03c) - flat colour only, no glow effect, no halo. The one warm point in a cold biome.

Output: single merged mesh, under 300 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, lantern arm toward +Z, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

## 7. Wiring

- **`models.json`:** one entry per prop, `silhouette: "structure"`, **no `tint`** —
  these colours are deliberate. The palette repair only repaints materials that are
  untextured *and pure white* (`entityViews.ts isUntextured`), which is why the
  prompts forbid white faces; if a model comes back with any white, set
  `"keepMaterials": true`.
- **Per-biome selection is a small render change** — see BIOME-ART-GREEN-ROAD.md §7
  for the shared plan (`props` array per biome in `biomes.json`, `PROP_KINDS` at
  `world.ts:699` becomes per-biome). Whichever biome's set lands first pays for the
  change; the other two are then JSON.
- Suggested weights to start: slab 0.22, strata 0.18, oreheap 0.16, deadtree 0.14,
  orecart 0.10, shoring 0.08, lantern 0.08, headframe 0.04 — rock dominant, the
  landmark rare. If the night preset makes the set too murky on-device, raise the
  lantern's weight before touching any colour.
- As always: `npm run asset:optimize public/models/<file>.glb`, and a line per model
  in `ASSETS.md` recording Meshy and its licence terms **in the same commit**.
