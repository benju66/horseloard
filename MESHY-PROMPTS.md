# MESHY-PROMPTS.md — assembled tower prompts, one block per model

Every prompt below is **complete and self-contained**: shared structure spec + subject +
output spec already merged. Copy one fenced block, paste it into Meshy text-to-3D, done.
The design rationale (tier grammar, family rules, wiring caveats) lives in
`ART-BRIEF.md` §8 — this file is only the assembled output of that section.

Generation settings for all of these: **symmetry on, no rigging, target ~1,500 tris,
PBR off** if offered. After each model lands: `npm run asset:optimize`, a line in
`ASSETS.md`, and check facing +Z / origin at base before wiring into `models.json`.

Naming convention for the files: `tower-<family>-l1|l2|l3|<branch>.glb`
(e.g. `tower-archer-sniper.glb`).

---

## Archer family

### archer-l1

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a slim wooden watchtower on a small grey stone footing (#8f8f96), warm brown timber (#6b4a2b), open railed platform under a simple peaked roof. Modest and plain - the first thing a player ever builds. Tall and narrow.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### archer-l2

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: the same slim wooden watchtower as before, grown one storey taller: stone lower half (#8f8f96), timber platform (#6b4a2b) with a sturdier rail, steeper peaked roof. Clearly the same building at a second stage of construction - taller and better built, same footprint, same proportions.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### archer-l3

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: the same slim watchtower at full height: dressed stone shaft (#8f8f96), timber hoarding at the top (#6b4a2b) with a crenellated rim, peaked roof carrying a small gold finial (#f6c945). The single gold accent marks it as fully upgraded. Same footprint and proportions as the earlier stages, taller and fully finished.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### archer-sniper (final type)

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a very tall, very thin stone spire-tower (#8f8f96) with a small enclosed lookout at the top pierced by a single narrow slit, dark wood details (#4a3018), one gold band (#f6c945) beneath the lookout. Exaggeratedly tall and slender - noticeably taller than any ordinary watchtower, because its height is its range. The lone narrow slit is the identity: one perfect shot at a time.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### archer-rapid (final type)

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a shorter, broader archer tower whose entire top is an open ring gallery with arrow slits all the way around, timber (#6b4a2b) over a stone base (#8f8f96), gold trim on the gallery rail (#f6c945). Width and repetition instead of height - the ring of many arrow slits must read from directly above, because this tower's identity is sheer rate of fire.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

---

## Bombard family

### bombard-l1

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a squat low artillery emplacement: a short wide-mouthed mortar angled upward on a heavy timber mount (#6b4a2b), inside a low ring of rough stone (#8f8f96). Wide and low, obviously slow and powerful - the opposite of a tall tower.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### bombard-l2

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: the same squat mortar emplacement reinforced: a full circular stone wall (#8f8f96) replacing the rough ring, a larger mortar with dark iron bands (#44464e) on its barrel. Same low wide silhouette as the first stage, heavier everything.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### bombard-l3

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: the same mortar emplacement at full strength: a dressed-stone bastion (#8f8f96), a massive iron-banded mortar (#44464e) with a single gold ring at the muzzle (#f6c945). The gold muzzle ring marks it as fully upgraded. Same low wide silhouette, maximum heft.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### bombard-cluster (final type)

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a stone artillery emplacement (#8f8f96) whose single mortar is replaced by three smaller mortar mouths splayed outward at different angles from one central mount, dark iron barrels (#44464e) with gold muzzle rings (#f6c945). The fan of three muzzles must read from directly above - this tower's shells split into bomblets across the lane, and the triple mouth is that promise.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### bombard-concussion (final type)

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a stone artillery emplacement (#8f8f96) carrying one enormous bell-mouthed mortar, exaggeratedly broad at the muzzle, on a massive dark iron mount (#44464e), one gold band (#f6c945) at the bell's rim. One huge mouth and nothing else - this tower stuns everything its blast touches, and the oversized single muzzle is the whole identity.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

---

## Frost family

### frost-l1

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a single faceted ice crystal, pale blue-white, rising from a low grey stone base (#8f8f96). Small and slender, clearly magical rather than mechanical - a shard of cold planted in the ground, not a machine.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### frost-l2

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: the same ice spire grown: a taller central faceted crystal flanked by two smaller shards at its base, pale blue-white over the same grey stone base (#8f8f96). Clearly the same object at a second stage of growth - same base, same slender proportions, more crystal.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### frost-l3

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: the same ice spire at full height: one tall faceted pale blue-white crystal ringed by a small cluster of shards, a deeper blue core visible through the main facets, on the same grey stone base (#8f8f96). Elegant, cold and finished - the deeper blue heart is what marks it as fully grown.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### frost-deep-freeze (final type)

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a massive single blocky ice crystal, squat and heavy like a fragment of glacier, pale blue-white with a deeper blue core, set on a grey stone plinth (#8f8f96). Mass instead of height - this tower periodically freezes the entire field solid, and it should look heavy enough to do it. No slender shards, one cold slab.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### frost-brittle (final type)

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a pale blue-white ice spire on a grey stone base (#8f8f96) whose top erupts into a radiating crown of short thick crystal shards, like a shatter frozen mid-burst. The jagged crown seen from above is the identity - enemies this tower chills become brittle and take extra damage. Keep every shard chunky and faceted, never needle-thin.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

---

## Mill family

### mill-l1

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a small timber windmill (#6b4a2b) with four broad plain sails and a thatched cap. Peaceful and civilian - this building never attacks, it only makes money. If possible keep the four sails as a separate simple cross-shaped piece attached at the hub, so the game can spin it; otherwise a single merged mesh is acceptable.

Output: one material, under 1500 triangles total, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. At most two meshes: the mill body and the sail cross; merge everything else. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### mill-l2

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: the same small windmill grown: a stone lower storey (#8f8f96) under the timber upper body (#6b4a2b), broader sails, a grain sack beside the door. Clearly the same building at a second stage - same silhouette, sturdier and slightly taller. If possible keep the four sails as a separate simple cross-shaped piece attached at the hub, so the game can spin it; otherwise a single merged mesh is acceptable.

Output: one material, under 1500 triangles total, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. At most two meshes: the mill body and the sail cross; merge everything else. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### mill-l3

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: the same windmill at full size: taller stone-and-timber body (#8f8f96, #6b4a2b), four wide sails edged in gold (#f6c945), a small gold weathervane on the cap. The gold sail edges mark it as fully upgraded. Same civilian character - prosperous, never military. If possible keep the four sails as a separate simple cross-shaped piece attached at the hub, so the game can spin it; otherwise a single merged mesh is acceptable.

Output: one material, under 1500 triangles total, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. At most two meshes: the mill body and the sail cross; merge everything else. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### mill-market (final type)

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a timber windmill (#6b4a2b) with a small market grown around its base: two or three simple stalls with plain awnings, crates and sacks, gold coins (#f6c945) spilling from an open chest. Wider footprint than a plain mill, busy and visibly rich - this building is serious money and nothing else. If possible keep the four sails as a separate simple cross-shaped piece attached at the hub, so the game can spin it; otherwise a single merged mesh is acceptable.

Output: one material, under 1500 triangles total, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. At most two meshes: the building and the sail cross; merge everything else. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### mill-beacon (final type)

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a timber windmill (#6b4a2b) carrying a tall beacon mast rising beside its cap, topped with a gold flame bowl (#f6c945) and flying a deep blue banner (#3b5dc9). The mast and flame must read from directly above - this building inspires every tower around it, and the beacon is that promise. If possible keep the four sails as a separate simple cross-shaped piece attached at the hub, so the game can spin it; otherwise a single merged mesh is acceptable.

Output: one material, under 1500 triangles total, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. At most two meshes: the building and the sail cross; merge everything else. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

---

## Barracks family

### barracks-l1

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a small timber longhouse (#6b4a2b) with a simple beam-and-canvas roof, one deep blue banner (#3b5dc9) at the door and a wooden training post standing in front. Plain, military and low - a place soldiers come from, not a fortress.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### barracks-l2

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: the same timber longhouse better built: a stone footing (#8f8f96) under the timber walls (#6b4a2b), a short palisade fence enclosing a small yard, two deep blue banners (#3b5dc9). Clearly the same building at a second stage - same longhouse, now with a defined yard.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### barracks-l3

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: the same barracks rebuilt in stone: a crenellated walled yard (#8f8f96) around the timber-roofed longhouse (#6b4a2b), a standard pole with a gold top (#f6c945) flying the deep blue banner (#3b5dc9). The gold standard marks it as fully upgraded. Same layout as the earlier stages, fortified.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### barracks-shieldwall (final type)

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a squat fortress-like barracks whose entire front face is a rack of enormous rectangular tower shields, steel grey (#8f8f96) each bearing a simple deep blue device (#3b5dc9), lined edge to edge in an unbroken row. Stone walls, low and immovable. The unbroken row of shields is the whole silhouette - the soldiers this building raises hold their ground where they stand.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

### barracks-levy (final type)

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 60 pixels tall on a phone screen. Elegant and understated rather than detailed.

Subject: a sprawling low military camp: a timber longhouse (#6b4a2b) surrounded by rows of small canvas tents and many small deep blue banners (#3b5dc9) across a wide footprint. Numbers instead of walls - this building raises more bodies, replaced fast, and the spread of tents is that promise. Keep every tent a simple faceted wedge.

Output: single merged mesh, under 1500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, model facing +Z, origin at the base of the building centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```
