# MESHY-PROMPTS-BIPEDS.md — assembled prompts for the walking enemy roster

Companion to `MESHY-PROMPTS.md` (towers) in the same format: **one complete
copy-paste block per model** — character spec, subject, pose and output spec already
merged. The design rationale lives in `ART-BRIEF.md` §§4, 8 and 10; this file is the
assembled output.

**Who's in:** the eleven biped enemies — grunt, runner, brute, shieldbearer,
halberdier, looter, sapper, juggernaut, warden, stalker, warlord.
**Who's out:** swarm (rigid instanced blob — covered in ART-BRIEF §8), raven
(flyer), wolf-rider and outrider (quadruped composites), and everything hero-side.

Four of these currently have no face of their own: the **sapper wears the runner's
model**, the **juggernaut wears the brute's**, and the **warden and stalker have no
model at all** (`enemies.json` → `models.json`). An enemy whose entire counter-play
is "recognise it instantly" cannot share a silhouette — those four are the priority.

## How characters differ from the tower prompts

These are **rigged and animated** — everything ART-BRIEF §10 says applies:

| Setting | Value |
|---|---|
| Topology | **Quad** (remesh) — joints deform better; glTF triangulates on export anyway |
| Target polycount | **~3,000 tris** |
| Symmetry | **On**, except where a subject block says otherwise (shield, sack, standard) |
| PBR maps | **Off** — flat albedo only |
| Body plan | **Biped**, all eleven |
| Clips | `walk` + `idle` looping = **essential**; `attack` (short!) and `death` nice to have; `siege` reuses `attack`; unmapped states fall back to procedural |

**Painted, not tinted.** These models ship with their own painted flat low-poly
colours — dull red cloth against steel and leather, not one flat palette red. That
means every new enemy is wired with `"keepMaterials": true`: the enemy entries in
`models.json` currently declare a `tint` that would repaint the whole model into a
single palette slot at load, which was the right call for the colourless KayKit
placeholders and is the wrong one for painted art. Two consequences to design by:

- **The prompt colours are the final in-game colours.** They are chosen from the
  game palette (`src/render/palette.ts`) on purpose — stay on them, because nothing
  downstream will correct a drifted colour any more.
- **Red must still dominate every design.** The faction read used to be enforced by
  the tint; now it is enforced by the paint. An enemy where steel or leather
  outweighs the red reads as neutral at phone size — check each candidate at
  gameplay zoom under both the day and night lighting presets before accepting it.

**The family gate decides everything (ART-BRIEF §10):** drop the first result beside
a KayKit skeleton at gameplay zoom on a phone. If proportions clash, either re-prompt
toward the existing family or commit to regenerating the whole roster — never mix.
Generate the **grunt first**: it is the baseline every other enemy is read against,
and it sets the family that the other ten prompts' "same family as the basic
soldier" clauses refer back to.

Weight reads through value — heavier and more dangerous is darker (`#8e2f20`,
`#3d3646`), faster and more fragile is lighter (`#e0673f`). Naming:
`enemy-<id>.glb`.

---

## grunt — the baseline

```
A single isolated game character for a minimalist flat-shaded low-poly mobile tower-defence game. Compact sturdy proportions, roughly 3 heads tall, simplified geometric forms with faceted flat planes, no facial features, no thin protruding geometry. Flat solid colours only - no gradients, no painted highlights or shadows, no outlines, no baked lighting or ambient occlusion; the game lights the model itself with a low raking sun. Plain neutral grey background, no scenery, no ground shadow, no props other than the subject. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette seen from above is what matters most. Bold simple silhouette that stays readable at roughly 40 pixels tall on a phone screen. Elegant and understated rather than detailed or cute.

Subject: a basic enemy foot soldier, blocky and solid. Dull red tunic (#c4452e), plain rounded helm, a crude short single-handed weapon. Deliberately unremarkable in every way - this is the baseline enemy that every other enemy in the roster is read against. Average build, average gear, nothing distinctive.

Pose: full body, standing in a neutral A-pose, arms slightly away from the body, facing the viewer directly, symmetrical. Feet flat on the ground. The weapon held loosely at the side pointing down, merged into the figure. No base, no plinth, no ground plane.

Output: single merged mesh, around 3000 triangles, one material, texture 512x512 or smaller in flat unlit-style solid colours with no baked lighting, shading or ambient occlusion, and no pure white areas. Y-up orientation, model facing +Z, origin at the feet centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

## runner — fast and fragile

```
A single isolated game character for a minimalist flat-shaded low-poly mobile tower-defence game. Compact sturdy proportions, roughly 3 heads tall, simplified geometric forms with faceted flat planes, no facial features, no thin protruding geometry. Flat solid colours only - no gradients, no painted highlights or shadows, no outlines, no baked lighting or ambient occlusion; the game lights the model itself with a low raking sun. Plain neutral grey background, no scenery, no ground shadow, no props other than the subject. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette seen from above is what matters most. Bold simple silhouette that stays readable at roughly 40 pixels tall on a phone screen. Elegant and understated rather than detailed or cute.

Subject: a lean lightly-armoured enemy skirmisher built for speed, in the same family as the basic soldier but visibly lighter. Light red-orange (#e0673f), minimal gear, bare arms, no shield, no helm - a simple head-wrap instead. Narrow shoulders, light frame. Should read as fragile and fast at a glance - twice the pace, half the health.

Pose: full body, standing in a neutral A-pose, arms slightly away from the body, facing the viewer directly, symmetrical. Feet flat on the ground. Empty hands. No base, no plinth, no ground plane.

Output: single merged mesh, around 3000 triangles, one material, texture 512x512 or smaller in flat unlit-style solid colours with no baked lighting, shading or ambient occlusion, and no pure white areas. Y-up orientation, model facing +Z, origin at the feet centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

## brute — armoured weight

```
A single isolated game character for a minimalist flat-shaded low-poly mobile tower-defence game. Compact sturdy proportions, roughly 3 heads tall, simplified geometric forms with faceted flat planes, no facial features, no thin protruding geometry. Flat solid colours only - no gradients, no painted highlights or shadows, no outlines, no baked lighting or ambient occlusion; the game lights the model itself with a low raking sun. Plain neutral grey background, no scenery, no ground shadow, no props other than the subject. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette seen from above is what matters most. Bold simple silhouette that stays readable at roughly 40 pixels tall on a phone screen. Elegant and understated rather than detailed or cute.

Subject: a massive heavy enemy bruiser in the same family as the basic soldier but far broader, with a wide armoured torso and heavy shoulder plates. Dark red (#8e2f20) with dull steel armour plates (#8f8f96), a heavy two-handed weapon that reads as a single solid slab. Slow, armoured and dangerous - arrows glance off this one. The width of the shoulders is the read from above.

Pose: full body, standing in a neutral A-pose, arms slightly away from the body, facing the viewer directly, symmetrical. Feet flat on the ground. The slab weapon held in one hand at the side, head down, merged into the figure. No base, no plinth, no ground plane.

Output: single merged mesh, around 3000 triangles, one material, texture 512x512 or smaller in flat unlit-style solid colours with no baked lighting, shading or ambient occlusion, and no pure white areas. Y-up orientation, model facing +Z, origin at the feet centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

## shieldbearer — the wall from the front

```
A single isolated game character for a minimalist flat-shaded low-poly mobile tower-defence game. Compact sturdy proportions, roughly 3 heads tall, simplified geometric forms with faceted flat planes, no facial features, no thin protruding geometry. Flat solid colours only - no gradients, no painted highlights or shadows, no outlines, no baked lighting or ambient occlusion; the game lights the model itself with a low raking sun. Plain neutral grey background, no scenery, no ground shadow, no props other than the subject. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette seen from above is what matters most. Bold simple silhouette that stays readable at roughly 40 pixels tall on a phone screen. Elegant and understated rather than detailed or cute.

Subject: an enemy soldier in the same family as the basic soldier, carrying an enormous rectangular tower shield on one arm, big enough to cover most of the body from the front. Steel grey shield (#8f8f96) bearing a simple dull red device (#c4452e); dull red tunic. The shield must dominate the silhouette from the front and from above - it is the entire point of the unit, which blocks everything arriving from ahead of it.

Pose: full body, standing in a neutral A-pose, facing the viewer directly, feet flat on the ground. Symmetrical except the shield arm: the shield held flat against the forearm at the side of the body, not raised, so the rig can move it. The free hand empty. No base, no plinth, no ground plane.

Output: single merged mesh, around 3000 triangles, one material, texture 512x512 or smaller in flat unlit-style solid colours with no baked lighting, shading or ambient occlusion, and no pure white areas. Y-up orientation, model facing +Z, origin at the feet centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

*Fallback if the rigged shield deforms badly: generate this one empty-handed and keep
the shield as a separate `hand`-socket prop, which is exactly how the current
placeholder works (`unit-shieldbearer` in `models.json`).*

## halberdier — the garrison-killer

```
A single isolated game character for a minimalist flat-shaded low-poly mobile tower-defence game. Compact sturdy proportions, roughly 3 heads tall, simplified geometric forms with faceted flat planes, no facial features, no thin protruding geometry. Flat solid colours only - no gradients, no painted highlights or shadows, no outlines, no baked lighting or ambient occlusion; the game lights the model itself with a low raking sun. Plain neutral grey background, no scenery, no ground shadow, no props other than the subject. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette seen from above is what matters most. Bold simple silhouette that stays readable at roughly 40 pixels tall on a phone screen. Elegant and understated rather than detailed or cute.

Subject: a tall disciplined enemy soldier in the same family as the basic soldier but harder and more professional: dark red (#8e2f20) with steel half-armour (#8f8f96) and a tall narrow helm. Carries a halberd - a long thick-shafted polearm with a heavy axe-blade head. The vertical line of the polearm beside the figure is the read from above. Keep the shaft chunky, never a thin stick. This is the soldier-killer: it should look like a veteran, not a brawler.

Pose: full body, standing in a neutral A-pose, facing the viewer directly, feet flat on the ground. Symmetrical except the weapon arm: the halberd held vertically at the side like a marching guard, butt on the ground, merged into the figure. No base, no plinth, no ground plane.

Output: single merged mesh, around 3000 triangles, one material, texture 512x512 or smaller in flat unlit-style solid colours with no baked lighting, shading or ambient occlusion, and no pure white areas. Y-up orientation, model facing +Z, origin at the feet centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

## looter — the thief

```
A single isolated game character for a minimalist flat-shaded low-poly mobile tower-defence game. Compact sturdy proportions, roughly 3 heads tall, simplified geometric forms with faceted flat planes, no facial features, no thin protruding geometry. Flat solid colours only - no gradients, no painted highlights or shadows, no outlines, no baked lighting or ambient occlusion; the game lights the model itself with a low raking sun. Plain neutral grey background, no scenery, no ground shadow, no props other than the subject. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette seen from above is what matters most. Bold simple silhouette that stays readable at roughly 40 pixels tall on a phone screen. Elegant and understated rather than detailed or cute.

Subject: a furtive hooded enemy thief in the same family as the basic soldier but slighter and hunched, carrying a bulging sack over one shoulder. Muted red (#c4452e) hooded cloak, hunched grasping posture, a hint of gold (#f6c945) at the sack's mouth. The hood-and-sack hump is the silhouette from above - it comes for your coins, not your gate, and should look like it is already leaving.

Pose: full body, standing in a neutral A-pose adapted to the design: hood up, slight forward hunch, the sack resting against the back of one shoulder and merged into the figure, both hands free and slightly away from the body. Facing the viewer directly, feet flat on the ground. No base, no plinth, no ground plane.

Output: single merged mesh, around 3000 triangles, one material, texture 512x512 or smaller in flat unlit-style solid colours with no baked lighting, shading or ambient occlusion, and no pure white areas. Y-up orientation, model facing +Z, origin at the feet centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

## sapper — the tower-breaker

```
A single isolated game character for a minimalist flat-shaded low-poly mobile tower-defence game. Compact sturdy proportions, roughly 3 heads tall, simplified geometric forms with faceted flat planes, no facial features, no thin protruding geometry. Flat solid colours only - no gradients, no painted highlights or shadows, no outlines, no baked lighting or ambient occlusion; the game lights the model itself with a low raking sun. Plain neutral grey background, no scenery, no ground shadow, no props other than the subject. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette seen from above is what matters most. Bold simple silhouette that stays readable at roughly 40 pixels tall on a phone screen. Elegant and understated rather than detailed or cute.

Subject: a slight, quick enemy demolitionist in the same family as the basic soldier but wiry, carrying a heavy two-handed maul - a thick square hammer head on a stout shaft, clearly a tool for breaking stone rather than a soldier's weapon. Light red-orange (#e0673f) with a dark leather work-harness and a small pack of iron wedges at the hip. The maul is the identity: this thing knocks towers down as it passes, and the player must learn its outline the first time they see it. Light frame, heavy tool - that contrast is the read.

Pose: full body, standing in a neutral A-pose, facing the viewer directly, feet flat on the ground. Symmetrical except the weapon arm: the maul held at the side, head down on the ground, merged into the figure. No base, no plinth, no ground plane.

Output: single merged mesh, around 3000 triangles, one material, texture 512x512 or smaller in flat unlit-style solid colours with no baked lighting, shading or ambient occlusion, and no pure white areas. Y-up orientation, model facing +Z, origin at the feet centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

## juggernaut — the moving fortress

```
A single isolated game character for a minimalist flat-shaded low-poly mobile tower-defence game. Compact sturdy proportions, roughly 3 heads tall, simplified geometric forms with faceted flat planes, no facial features, no thin protruding geometry. Flat solid colours only - no gradients, no painted highlights or shadows, no outlines, no baked lighting or ambient occlusion; the game lights the model itself with a low raking sun. Plain neutral grey background, no scenery, no ground shadow, no props other than the subject. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette seen from above is what matters most. Bold simple silhouette that stays readable at roughly 40 pixels tall on a phone screen. Elegant and understated rather than detailed or cute.

Subject: a vast enemy colossus, the heaviest walking thing in the game: a towering figure encased head to foot in overlapping slab armour, blackened iron (#3d3646) over dark red (#8e2f20), with a tiny slit-visored helm sunk between enormous shoulders. No visible skin anywhere. Carries nothing - its mass is the weapon. Wide stance, forward lean, like something that has momentum even standing still. It is nearly impervious while moving and must read as unstoppable at a glance.

Pose: full body, standing in a neutral A-pose, arms slightly away from the body, facing the viewer directly, symmetrical. Feet flat on the ground, stance wide. No base, no plinth, no ground plane.

Output: single merged mesh, around 3000 triangles, one material, texture 512x512 or smaller in flat unlit-style solid colours with no baked lighting, shading or ambient occlusion, and no pure white areas. Y-up orientation, model facing +Z, origin at the feet centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

## warden — the standard-bearer

```
A single isolated game character for a minimalist flat-shaded low-poly mobile tower-defence game. Compact sturdy proportions, roughly 3 heads tall, simplified geometric forms with faceted flat planes, no facial features, no thin protruding geometry. Flat solid colours only - no gradients, no painted highlights or shadows, no outlines, no baked lighting or ambient occlusion; the game lights the model itself with a low raking sun. Plain neutral grey background, no scenery, no ground shadow, no props other than the subject. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette seen from above is what matters most. Bold simple silhouette that stays readable at roughly 40 pixels tall on a phone screen. Elegant and understated rather than detailed or cute.

Subject: an enemy standard-bearer in the same family as the basic soldier: robed rather than armoured, dark red (#8e2f20) with blackened trim (#3d3646), carrying a tall war-standard - a thick pole topped with a rigid rectangular banner in dull red (#c4452e) with a blackened iron emblem. It has no weapon at all; the standard is everything. The banner above the crowd is the read from above: every enemy near it is harder to kill, and the player's job is to reach the bearer. The pole must be thick and the banner a solid rigid slab, never cloth-thin.

Pose: full body, standing in a neutral A-pose, facing the viewer directly, feet flat on the ground. Symmetrical except the standard arm: the pole held vertically at the side, butt on the ground, banner at the top, all merged into the figure. The free hand empty. No base, no plinth, no ground plane.

Output: single merged mesh, around 3000 triangles, one material, texture 512x512 or smaller in flat unlit-style solid colours with no baked lighting, shading or ambient occlusion, and no pure white areas. Y-up orientation, model facing +Z, origin at the feet centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

## stalker — the hunter

```
A single isolated game character for a minimalist flat-shaded low-poly mobile tower-defence game. Compact sturdy proportions, roughly 3 heads tall, simplified geometric forms with faceted flat planes, no facial features, no thin protruding geometry. Flat solid colours only - no gradients, no painted highlights or shadows, no outlines, no baked lighting or ambient occlusion; the game lights the model itself with a low raking sun. Plain neutral grey background, no scenery, no ground shadow, no props other than the subject. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette seen from above is what matters most. Bold simple silhouette that stays readable at roughly 40 pixels tall on a phone screen. Elegant and understated rather than detailed or cute.

Subject: a lean predatory enemy hunter, narrower and lower than any other soldier in the family: a tight hooded cowl coming to a sharp point, a close-fitting wrap in near-black red (#6e2318) with light red (#e0673f) bindings at the forearms and shins, a pair of short heavy blades sheathed crossed on the lower back. Forward-leaning, coiled posture even at rest. This is the one enemy that leaves the road and comes for the player - it should read as wrong among the marching soldiers, a predator in a column of livestock.

Pose: full body, standing in a neutral A-pose adapted to the design: a slight forward crouch, arms slightly away from the body, hands empty and open. Facing the viewer directly, symmetrical, feet flat on the ground. No base, no plinth, no ground plane.

Output: single merged mesh, around 3000 triangles, one material, texture 512x512 or smaller in flat unlit-style solid colours with no baked lighting, shading or ambient occlusion, and no pure white areas. Y-up orientation, model facing +Z, origin at the feet centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

## warlord — the boss

```
A single isolated game character for a minimalist flat-shaded low-poly mobile tower-defence game. Compact sturdy proportions, roughly 3 heads tall, simplified geometric forms with faceted flat planes, no facial features, no thin protruding geometry. Flat solid colours only - no gradients, no painted highlights or shadows, no outlines, no baked lighting or ambient occlusion; the game lights the model itself with a low raking sun. Plain neutral grey background, no scenery, no ground shadow, no props other than the subject. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette seen from above is what matters most. Bold simple silhouette that stays readable at roughly 40 pixels tall on a phone screen. Elegant and understated rather than detailed or cute.

Subject: an enormous enemy warlord, the most dangerous thing in the game: blackened armour (#3d3646) with deep red accents (#c4452e), a heavy horned helm whose two thick horns are the crown of the silhouette, a short tattered dark cape merged against the back, and a massive brutal single-handed weapon. Broader than the heavy bruiser, more ornate than everything - but ornate through bold shapes (horns, cape, pauldrons), never through fine detail. It breaks towers and does not stop, and it must read instantly as the boss.

Pose: full body, standing in a neutral A-pose, facing the viewer directly, feet flat on the ground. Symmetrical except the weapon arm: the weapon held at the side, head down, merged into the figure. Cape hanging flat against the back, clear of the arms. No base, no plinth, no ground plane.

Output: single merged mesh, around 3000 triangles, one material, texture 512x512 or smaller in flat unlit-style solid colours with no baked lighting, shading or ambient occlusion, and no pure white areas. Y-up orientation, model facing +Z, origin at the feet centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

---

## Wiring

Height between enemies is **not** authored into the models — every model is
normalised from its bounding box and sized by `scale` in `models.json`. Author all
eleven at the same convenient size; the manifest does the rest. Current scales to
keep or migrate:

| enemy | models.json today | intended scale |
|---|---|---|
| grunt | `unit-grunt` (1.0) | 1.0 — the reference |
| runner | 0.9 | 0.9 |
| brute | ~1.40 (base-large 1.35 × 1.04) | ~1.4 |
| shieldbearer | 1.0 + shield prop | 1.0 (shield now in-mesh, or keep the prop) |
| halberdier | 1.08 | ~1.1 |
| looter | 0.95 | 0.95 |
| sapper | **borrows `unit-runner`** | new `unit-sapper`, ~0.95 |
| juggernaut | **borrows `unit-brute`** | new `unit-juggernaut`, ~1.55 (radius 20 vs brute 16) |
| warden | **none** | new `unit-warden`, ~1.05 |
| stalker | **none** | new `unit-stalker`, ~0.95 |
| warlord | ~1.80 + crown/cape props | ~1.8, props retired into the mesh |

- Each new model: a `models.json` entry with `file`, `clips` mapping (name whatever
  Meshy's clips are called; the manifest maps logical → actual), and
  `"keepMaterials": true` so the painted colours survive — the `tint` inherited
  from the base entries would otherwise flatten the model to one palette red.
  Update the enemy's `model` field in `enemies.json` (`sapper`, `juggernaut`,
  `warden`, `stalker` especially).
- Verify **facing +Z** before wiring — ART-BRIEF §10 calls it the single most likely
  thing to be wrong, and a backwards-walking army is the failure mode.
- `attack` clips must be **short** — siege reuses them and brutes hit every ~1s.
- `npm run asset:optimize` per file, and the `ASSETS.md` line (source: Meshy, plus
  whatever its licence terms say) **in the same commit** as the asset.
- Order of work: **grunt first** (sets the family), then the four with no identity
  (sapper, juggernaut, warden, stalker), then the rest by screen time.
