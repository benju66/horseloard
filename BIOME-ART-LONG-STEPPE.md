# BIOME-ART-LONG-STEPPE.md — environment art for The Long Steppe

One of three biome art docs (with `BIOME-ART-GREEN-ROAD.md` and
`BIOME-ART-IRON-DEEPS.md`). Format matches `GATE.md` and `MESHY-PROMPTS.md`: the
place, the rules, a prop roster, and one assembled copy-paste Meshy prompt per asset.
BIOMES.md governs what a biome *is*; this doc only covers how this one looks.

---

## 1. The place

Open grass to the horizon — *"everything is faster here, including the wind"*
(BIOMES.md C.3). The speed biome: wolf-riders, ravens, outriders, stalkers, sappers,
the warlord finale, under `open-country` (enemy speed +12%, tower range +10%). The
art job: **empty, windswept, and not yours**. The Green Road is tended and the Deeps
are worked; the steppe belongs to the things riding across it. Sparse dressing is
correct here — this biome has the lowest fog density in the game (0.22) because you
are *supposed* to see all the way to the horizon, and every prop placed is one the
long sightline has to justify. Everything standing should look shaped by wind or
left behind by riders.

## 2. Palette

From `src/data/biomes.json` (`long-steppe.lighting`). Props render under both
presets — never bake either in. The day sun is low (elevation 19°) and warm gold:
this biome is all long shadows.

| | day | night |
|---|---|---|
| ground | `#98904f` dry gold-green | `#5d6d63` grey-green |
| path | `#d6bf8d` pale dust | `#a9a291` grey |
| sun | `#ffe3a8` low warm gold | `#bccdec` blue moonlight |
| fog | `#c4d4d6`, density 0.22 | `#303c56`, density 0.3 |

**Colour guidance for props:** the ground is dry gold-green, so live grass props must
be *paler* than it (`#c9bd7a`-ish) to read as standing stalks rather than ground.
Stone is cool grey (`#7c7c84`–`#8f8f96`) — the strongest contrast available against
the warm ground, which is why stones are this biome's best props. Wood is bleached
and grey-brown (`#8a7a5e`), sun-dried, never the Green Road's warm brown. One
deliberate exception to the no-faction-colour rule: the raider totem carries tattered
enemy red (`#c4452e`) — this is enemy country, and the dressing is allowed to say so
exactly once.

## 3. What's there today

Every biome currently draws from one hardcoded list (`PROP_KINDS`,
`src/render/world.ts:699`): Kenney oak, pine, two rocks, and a stump. A lush pine on
the open steppe reads as the wrong continent. The rosters in these three docs replace
that with per-biome sets.

## 4. Rules for props (all biomes, stated once per doc)

- **Props are backdrop.** They cluster beside the road and must never be mistaken for
  a tower, an enemy, or a pickup. Low saturation; faction colour only where §5
  explicitly grants it (the totem).
- **Silhouette from 55° above** is the only view that matters — and with the lowest
  sun in the game (19° day elevation), this biome's props cast the longest shadows.
  A lone leaning tree earns its whole cost in its shadow.
- **The scale anchor:** the Green Road oak is 46 world-units; rocks 8–13. Each roster
  row declares a height; the renderer normalises the model to it.
- **One material per model, and as few distinct colours across the set as possible.**
  Props merge into shared static geometry keyed by material — every distinct material
  in the biome's prop layer is one draw call.
- **Scenery, not systems.** DESIGN.md's structure policy is *exactly two* gameplay
  structures (Gate, Forge). The totem and wagon are dressing — no interaction, and
  they must not look interactable.

## 5. Roster

Deliberately the smallest of the three rosters — sparseness is this biome's look.

| id | asset | height | why it belongs |
|---|---|---|---|
| `steppe-tree` | lone windswept tree | 42 | the biome's signature: one tree, bent by decades of wind |
| `steppe-grass` | tall grass tuft | 8 | the ground made three-dimensional, leaning with the wind |
| `steppe-stone` | weathered standing stone | 24 | someone raised it long ago; nobody remembers who |
| `steppe-cairn` | stacked stone cairn | 14 | a waymark on a road with no walls |
| `steppe-skull` | great horned beast skull | 10 | things die in the open here and stay where they fell |
| `steppe-totem` | raider totem pole | 30 | the enemy's claim on the land — the one red prop in the game |
| `steppe-wagon` | broken abandoned wagon | 14 | somebody didn't make it across |

## 6. Assembled Meshy prompts

### steppe-tree

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 30 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a lone windswept steppe tree: a leaning gnarled trunk in bleached grey-brown (#8a7a5e) with its entire canopy swept to one side, as if the wind never stops. The canopy is one or two chunky faceted masses in dry olive green (#6f7042), all streaming the same direction. Asymmetry is the whole identity - this tree has been shaped by decades of one prevailing wind.

Output: single merged mesh, under 500 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, canopy streaming toward +X, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### steppe-grass

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 12 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a tuft of tall dry steppe grass in pale gold (#c9bd7a), a single low clump of chunky faceted blades all leaning the same direction as if in wind. Treat the tuft as one solid wedge-shaped mass with a spiky top edge, never as individual thin blades. Paler than the ground it will stand on.

Output: single merged mesh, under 200 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, blades leaning toward +X, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### steppe-stone

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 25 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a single weathered standing stone in cool grey (#7c7c84): a tall faceted monolith, slightly tapered and slightly leaning, edges rounded by centuries of wind. Raised by someone long forgotten - clearly placed on purpose, but ancient and unadorned. No carvings, no runes.

Output: single merged mesh, under 250 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### steppe-cairn

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 18 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a cairn of stacked stones in cool grey (#7c7c84): five to seven chunky faceted rocks piled into a rough cone, largest at the bottom, deliberately balanced. A waymark left by travellers on a road with no walls or fences. Stable and purposeful, not a rubble heap.

Output: single merged mesh, under 250 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### steppe-skull

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 15 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: the bleached skull of a great horned beast, pale bone (#ddd6c2 - off-white, never pure white), half-settled into the ground at a slight tilt, with two thick curving horns that are most of the silhouette from above. Simplified and chunky - big eye sockets, heavy horn shapes, no fine tooth detail. Long dead, picked clean by wind and birds.

Output: single merged mesh, under 300 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere (bone is off-white #ddd6c2). Y-up orientation, muzzle facing +Z, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### steppe-totem

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 25 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a raider totem pole: a dark rough-hewn timber post (#4a3018) topped with a simple horned beast-skull shape, with two or three tattered strips of deep red cloth (#c4452e) streaming sideways from it in the wind, all blowing the same direction. Crude and menacing - a territorial marker planted by riders, warning travellers whose land this is. The red streamers and horned top are the whole read.

Output: single merged mesh, under 400 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, streamers blowing toward +X, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### steppe-wagon

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 20 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: an abandoned broken travellers' wagon in bleached sun-dried wood (#8a7a5e): a simple open wagon bed tipped at an angle with one solid-disc wheel missing and lying flat beside it, empty of cargo. Long abandoned - weathered grey, not freshly wrecked, no fire damage, no bodies, nothing gruesome. Somebody unloaded what mattered and walked on.

Output: single merged mesh, under 500 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, wagon bed along the X axis, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

## 7. Wiring

- **`models.json`:** one entry per prop, `silhouette: "structure"`, **no `tint`** —
  these colours are deliberate. The palette repair only repaints materials that are
  untextured *and pure white* (`entityViews.ts isUntextured`), which is why the
  prompts forbid white faces — the skull especially: bone must be `#ddd6c2`, because
  a pure-white skull would be "repaired" into a palette colour at load. If any model
  comes back with white anyway, set `"keepMaterials": true`.
- **Per-biome selection is a small render change** — see BIOME-ART-GREEN-ROAD.md §7
  for the shared plan (`props` array per biome in `biomes.json`, `PROP_KINDS` at
  `world.ts:699` becomes per-biome). Whichever biome's set lands first pays for the
  change; the other two are then JSON.
- Suggested weights to start: grass 0.34, stone 0.18, cairn 0.14, tree 0.12,
  skull 0.09, wagon 0.07, totem 0.06 — mostly grass and stone, the storytelling props
  rare. Consider also *fewer clusters* for this biome than the current seven
  (`world.ts` `CLUSTERS`): emptiness is the look, and if the cluster count ever moves
  into per-biome data, the steppe is the reason.
- All the leaning props (tree, grass, totem) stream toward **+X** so one prevailing
  wind direction holds across the whole map after random yaw is disabled for them —
  worth a `noRandomYaw` flag or fixed-yaw list in the prop placement when this set
  lands; wind blowing seven directions at once would undo the point of authoring it.
- As always: `npm run asset:optimize public/models/<file>.glb`, and a line per model
  in `ASSETS.md` recording Meshy and its licence terms **in the same commit**.
