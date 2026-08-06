# BIOME-ART-GREEN-ROAD.md — environment art for The Green Road

One of three biome art docs (with `BIOME-ART-IRON-DEEPS.md` and
`BIOME-ART-LONG-STEPPE.md`). Format matches `GATE.md` and `MESHY-PROMPTS.md`: the
place, the rules, a prop roster, and one assembled copy-paste Meshy prompt per asset.
BIOMES.md governs what a biome *is*; this doc only covers how this one looks.

---

## 1. The place

Rolling farmland, warm and open — *"where you learn what normal is"* (BIOMES.md C.1).
The teaching biome and the campaign's control: no terrain rule, the gentlest pool
(grunt, swarm, runner, looter). The art job matches: **safe, domestic, worth
protecting**. This is the only biome where the world looks like it was doing fine
before the war arrived, and that contrast is what the other two biomes are read
against. Nothing here should look dangerous.

## 2. Palette

From `src/data/biomes.json` (`green-road.lighting`). Props render under both presets —
never bake either in.

| | day | night |
|---|---|---|
| ground | `#3f7a5c` warm green | `#5e7e7d` grey-green |
| path | `#b9a884` warm sand | `#9da09b` grey |
| sun | `#f4f0d2` warm cream | — |
| fog | `#b4d2d4`, density 0.5 | `#3f555d`, density 0.62 |

**Colour guidance for props:** foliage darker than the ground (`#37592c` — already the
established tree canopy) so canopies read as objects, not ground blotches, from 55°
above. Wood in the warm brown family (`#5b4126`–`#6b4a2b`). Hay and wheat pull from
the *path* family (`#c9a86a`–`#d6bf8d`) so the harvest reads warm against the green.
No faction colours: props are neutral — red is the enemy's, blue is the hero's and the
gate's, and a red barn would read as a threat at phone size.

## 3. What's there today

Every biome currently draws from one hardcoded list (`PROP_KINDS`,
`src/render/world.ts:699`): Kenney oak, pine, two rocks, and a stump, seeded per map
in roadside clusters and merged into a handful of draw calls. It dresses the maps but
carries zero biome identity — the quarry and the steppe get the same oak. The rosters
in these three docs replace that with per-biome sets.

## 4. Rules for props (all biomes, stated once per doc)

- **Props are backdrop.** They cluster beside the road and must never be mistaken for
  a tower, an enemy, or a pickup. Low saturation, no faction colours, no gold except
  where a doc says so.
- **Silhouette from 55° above** is the only view that matters, and the low raking sun
  means every prop also lays a long shadow — a distinctive top-down shape earns its
  keep twice.
- **The scale anchor:** the current oak is 46 world-units tall, rocks 8–13. Each
  roster row declares a height; the renderer normalises the model to it, so author at
  any convenient size.
- **One material per model, and as few distinct colours across the set as possible.**
  Props merge into shared static geometry keyed by material — every distinct material
  in the biome's whole prop layer is one draw call. A six-prop set sharing three
  materials beats six prettier props with ten.
- **Scenery, not systems.** DESIGN.md's structure policy is *exactly two* gameplay
  structures (Gate, Forge). A barn or a well here is dressing — no interaction, no
  collision beyond what props already have, and it must not look interactable.

## 5. Roster

| id | asset | height | why it belongs |
|---|---|---|---|
| `green-oak` | broad round-canopy oak | 46 | the biome's signature tree — replaces the generic oak |
| `green-orchard` | small tended fruit tree | 30 | *tended* — someone planted this in a row |
| `green-haybale` | round hay bale | 10 | harvest, mid-season, life going on |
| `green-wheat` | wheat patch | 12 | ground cover that says farmland at a glance |
| `green-fence` | short wooden fence run | 12 | the human grid — fields have edges here |
| `green-cart` | hay cart | 18 | somebody's workday, interrupted |
| `green-barn` | small timber barn | 34 | the far-background anchor; the thing being protected |
| `green-well` | stone well with a little roof | 16 | the village read, in one prop |

## 6. Assembled Meshy prompts

### green-oak

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 30 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a broad farmland oak tree with a full rounded canopy in deep green (#37592c) on a short thick trunk (#5b4126). The canopy is two or three chunky faceted lobes, not one sphere and not many small leaves. Warm, healthy and generous - the tree of a gentle countryside.

Output: single merged mesh, under 600 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### green-orchard

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 30 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a small tended fruit tree: a neat rounded green canopy (#37592c) on a slim straight trunk (#5b4126), with a few chunky warm-yellow fruit (#d9a94a) sitting in the canopy as simple faceted spheres. Clearly planted and cared for, not wild - tidier and smaller than a field oak.

Output: single merged mesh, under 600 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### green-haybale

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 20 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a round hay bale lying on its side, a simple faceted cylinder in warm straw gold (#c9a86a) with a slightly darker spiral end face. Plump and low. Nothing else - one bale.

Output: single merged mesh, under 300 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### green-wheat

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 20 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a small patch of ripe wheat: a cluster of chunky faceted stalks in warm straw gold (#c9a86a) with slightly heavier heads, merged into one solid clump the size of a low bush. Treat the patch as one simple mass with a spiky top edge, never as individual thin stalks.

Output: single merged mesh, under 300 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### green-fence

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 20 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a short run of simple wooden farm fence: three chunky posts and two horizontal rails in warm brown (#6b4a2b), slightly weathered, perfectly readable as a fence from above. Keep the posts and rails thick - chunky timber, never thin sticks.

Output: single merged mesh, under 300 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, the fence running along the X axis, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### green-cart

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 25 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a simple two-wheeled wooden hay cart, warm brown timber (#6b4a2b) with two chunky solid-disc wheels, its bed loaded with a mound of straw-gold hay (#c9a86a), resting tilted on its two support legs with the pull-poles down. A workday interrupted - peaceful, not wrecked.

Output: single merged mesh, under 500 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, model facing +Z, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### green-barn

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 30 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a small timber farm barn: warm brown plank walls (#6b4a2b), a wide steep thatched roof in straw gold (#c9a86a) that is most of the silhouette from above, a big simple door on the gable end. Homely and worth protecting - scenery only, it must not look like something a player can build or use. No banners, no faction colours.

Output: single merged mesh, under 600 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, door face toward +Z, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### green-well

```
A single isolated environment prop for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, nothing beyond the prop itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 20 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a small round village well: a low ring of grey stone (#8f8f96), two chunky timber posts (#6b4a2b) carrying a little peaked timber roof, a simple crossbar. The stone ring and tiny roof are the whole read. Scenery only - it must not look interactable. No bucket, no rope detail.

Output: single merged mesh, under 400 triangles, one material, no texture - flat per-face colour only, and no pure white faces anywhere. Y-up orientation, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

## 7. Wiring

- **`models.json`:** one entry per prop, `silhouette: "structure"`, **no `tint`** —
  these colours are deliberate. A missing tint is safe for coloured models: the
  palette repair only repaints materials that are untextured *and pure white*
  (`entityViews.ts isUntextured`), which is why the prompts forbid white faces. If a
  model comes back with any white, set `"keepMaterials": true` rather than fighting it.
- **Per-biome selection is a small render change.** `PROP_KINDS`
  (`src/render/world.ts:699`) is one global list; biome dressing means keying the
  list by the map's biome. The right home is data — a `props` array on the biome in
  `biomes.json` (`{id, weight, height}` per row, heights from §5), so the next
  biome's set is a JSON entry. The render change is selecting the list; the merge
  pipeline needs nothing.
- Suggested weights to start: oak 0.30, orchard 0.15, wheat 0.15, haybale 0.12,
  fence 0.12, cart 0.08, well 0.05, barn 0.03 — trees dominant, structures rare.
  Tune on-device; the seeded RNG makes layouts reproducible per map.
- As always: `npm run asset:optimize public/models/<file>.glb`, and a line per model
  in `ASSETS.md` recording Meshy and its licence terms **in the same commit**.
