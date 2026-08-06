# GATE.md — the gate design

The gate is the defended objective: the one thing on the map the player can lose. This
doc collects everything about it in one place — the rules (from DESIGN.md §6 "The Gate",
restated here with the code that enforces them), the data surface, how it renders today,
and the Meshy prompt pack for the model that should replace the kit-bashed placeholder.
Where this doc and DESIGN.md disagree, DESIGN.md wins; where either disagrees with
`src/engine/gateSystem.ts` and its tests, the code is describing a bug — fix the code.

---

## 1. Role

Three jobs, all load-bearing:

1. **The loss condition.** Gate HP hits zero, the run ends. Nothing else ends a run.
2. **The scoring surface.** Stars score on **total damage taken**, never HP remaining
   (3★ untouched, 2★ light damage, 1★ survived). Repair helps you survive but can never
   buy a star back — `totalDamageTaken` only ever goes up.
3. **The climax stage.** Leaks don't despawn — they walk to the gate and batter it, so
   every failing defence naturally converges into a courtyard siege in front of the
   gate. The gate is the backdrop of the game's most dramatic moments, which is why its
   model matters more than any tower's.

## 2. Rules (invariant — enforced by `gateSystem.ts` and its tests)

- **Leaks never despawn.** An enemy reaching the path end is a state change
  (walker → besieger), not a despawn. It takes an attack slot at the gate and deals its
  per-type `siegeDps`. No exceptions: the Warlord sieges (devastatingly) rather than
  ending the run on arrival — the comeback door is never fully closed.
- **Attack slots cap the row, overflow queues.** `attackSlots` per map (5 on every
  current map, 6 on Warlord's March) caps simultaneous attackers. The row forms
  34 sim-units up-path of the gate at 16-unit spacing; overflow gathers 56 units
  up-path at 18-unit spacing and promotes head-first as attackers die. Visually the
  queue *is* the siege mob — it looms, it does not attack.
- **Repair is a coin sink, never a score tool.** Ride to the gate between waves, spend
  gold, restore HP. It competes with towers and forge for the same coins. It touches
  `hp` only — `totalDamageTaken` is untouched, so stars are unaffected.
- **Capacity changes are not repairs.** `adjustCapacity(delta)` moves `maxHp` *and*
  `hp` by the same amount — a reinforcement must visibly do something on a damaged
  gate, and a capacity trade-away must actually cost something now. HP floors at 1:
  a build choice can weaken the gate but only enemies can destroy it.
- **The gate never moves and is never a tower.** Fixed position per map, no attack, no
  targeting. It is scenery with an HP bar and a repair interaction.

## 3. Data surface

`GateSchema` (`src/data/schemas/map.ts`) — per map, in `src/data/maps/*.json`:

| Field | Type | Current values |
|---|---|---|
| `position` | sim vec2 | `{x: 210, y: 715}` on every map — bottom-centre, path end |
| `hp` | positive int | 100–130, scaling gently with campaign position |
| `attackSlots` | positive int | 5 everywhere; 6 on `warlords-march` |

Balance intent: `hp` is the pacing knob (how much leak pressure a map forgives),
`attackSlots` is the drama knob (how wide the final brawl gets). Raise `attackSlots`
rarely — a wider row also means faster gate damage from the same mob.

## 4. How it renders today

`buildGateFromKit` (`src/render/world.ts`) composes a gatehouse from Kenney Castle-kit
pieces — **tower · wall · wall · door · wall · wall · tower** — because the kit has no
gatehouse model; `gate.glb` is a lone door panel. The assembly is measured from the
models (a kit swap re-proportions itself), scaled so its total width equals the fixed
footprint `GATE_HALF_WIDTH = 92` × 2, palette-tinted (stone walls, darker towers), and
merged by material into **two draw calls**. If any kit piece is missing it degrades to
placed primitives, never to nothing.

Gate HP currently reads only in the HUD text. There is no on-model damage state — see
§6 for what replacing that would take.

## 5. Replacing it with a Meshy model

This is priority #2 in ART-BRIEF §9 (after the horse): the gate is permanently on
screen, and it is the one structure the player is emotionally attached to.

**Design requirements, in order:**

1. **Reads as the goal from above.** The camera sits ~55° above the horizon; the
   gatehouse must be identifiable as "the thing I defend" in the first second of a new
   player's first run. Two flanking towers and a spanning wall is the universally
   readable shape — keep it.
2. **Worth defending.** Banners in hero blue `#3b5dc9` — the gate is *yours*, the only
   structure besides the hero that carries the faction colour prominently.
3. **A stage, not a wall.** The attack row forms 34 sim-units in front of it and the
   queue mob 56 units out. The gate's up-path face is the backdrop of every siege —
   put the visual interest (door, banners, bracing) on that face, not the back the
   camera rarely reads.
4. **Wider than tall.** The footprint is width-locked (`GATE_HALF_WIDTH`); height
   follows. A gatehouse that reads as a tall tower will fight the camera's content
   bounds — see the 1,100-unit door-tower incident memorialised in `world.ts`.

**Wiring note:** a single gatehouse model does not slot into the current code as-is —
`buildGateFromKit` exists to *compose* one from pieces. Landing a one-piece model means
a new `models.json` entry (e.g. `world-gatehouse`) and a short-circuit branch in
`buildGate` that places it directly, scaled to the same `GATE_HALF_WIDTH` footprint,
before the kit path. Keep the kit path as the fallback, exactly as the primitive
fallback sits behind the kit today. As always: `npm run asset:optimize`, a line in
`ASSETS.md` in the same commit, and the `tint` question — this model's colours are
deliberate, so wire it with `"keepMaterials": true` or no tint.

### Assembled Meshy prompt — gatehouse

```
A single isolated building asset for a minimalist flat-shaded low-poly mobile tower-defence game. Simplified geometric forms with faceted flat planes, no thin protruding geometry. Flat solid colours only - no gradients, no surface texture, no painted highlights, no outlines, no baked shadows or ambient occlusion; the game lights the model itself. Plain neutral grey background, no scenery, no ground shadow, no characters, no props beyond the building itself; the building is completely unmanned - no people, no soldiers, no guards, no figures of any kind on or around it. Three-quarter view from clearly above, as though from a camera 55 degrees above the horizon - the silhouette from above is what matters most. Bold simple silhouette readable at roughly 100 pixels wide on a phone screen. Elegant and understated rather than detailed.

Subject: a fortified stone gatehouse spanning a road: a heavy timber gate door (#4a3018) with iron bands (#44464e) set in a grey stone wall (#8f8f96), flanked symmetrically by two squat round stone towers with simple conical roofs. Two deep blue banners (#3b5dc9) with gold trim (#f6c945), one on each tower, are the only ornament. Clearly wider than it is tall - a wall with a door and two towers, not a castle. The front face with the door and banners carries all the visual interest; the back is plain. This is the structure the player defends, and it must look worth defending.

Output: single merged mesh, under 2500 triangles, one material, preferably no texture at all (flat per-face colour); if a texture is unavoidable, 512x512 or smaller, flat unlit-style albedo with no baked lighting or ambient occlusion. Y-up orientation, the front face with the door facing +Z, origin at ground level centred on X and Z. Export as .glb. No PBR maps, no normal map, no metalness or roughness map.
```

Budget note: 2,500 tris rather than the towers' 1,500 — it is one permanent model, not
an instanced one, and it is the largest structure on screen.

## 6. Parked (deliberately)

- **On-model damage states.** Two or three visual stages (pristine / battered /
  breached: scorch, splintered door, fallen crenellation) swapped at HP thresholds
  would make gate health readable without the HUD. Cheap with Meshy — prompt "the same
  gatehouse, battered: …" as with the tower tiers — but it needs the model-swap
  plumbing from the tower-tier work first. Do it after, with the same technique, or
  not at all.
- **Gate upgrades or variants per map.** The gate is not a tower and must not grow a
  build surface. Per-map `hp`/`attackSlots` is the entire tuning space; one model
  serves every map.
- **Openable door, walk-through, courtyard interior.** The door never opens. Nothing
  passes the gate in either direction — that is what makes it the end of the world.
