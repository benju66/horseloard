# /public/models — drop zone

Put downloaded `.glb` / `.gltf` files here (subfolders per pack are fine), then
tell Claude. Wiring them up is the other half of the job:

1. a `file` on the matching entry in `src/data/models.json`
2. clip names mapped to logical states (`walk`, `attack`, `death`, `siege`,
   `stagger`, `idle`) — anything unmapped falls back to `procedural`
3. a line per asset in `ASSETS.md` (source, license, attribution) **in the same
   commit** — CLAUDE.md requires it, and retrofitting attribution before
   publishing is misery

Until an entry has a `file`, it renders as crude placeholder geometry. That is
a supported state, not a broken one: the whole roster is playable with no assets
at all, and each model swaps in as a data edit with no code change.

## What the roster needs (MIGRATION-3D.md Part A.2)

| Need | Covered by |
|---|---|
| Towers, gate, forge | Kenney Tower Defense Kit / Castle Kit |
| Enemy humanoids (grunt, runner, brute, shieldbearer, looter, warlord) | KayKit Skeletons + Adventurers |
| Hero horse | Quaternius Ultimate Animated Animal Pack |
| Hero rider | KayKit Adventurers |
| Wolf (wolf-rider mount) | Quaternius animal pack |
| Path-edge props | Kenney Nature Kit |

## The gate that matters

**Proportions, not polish.** Every character must read as one family —
chibi-chunky, ~2–2.5 heads tall. Drop one model next to the hero at gameplay
zoom on-device; if proportions clash, reject the pack rather than mixing. If no
CC0 family hits the target across the whole roster, that discovery *is* the
Phase B commission trigger, and pack models stay placeholders until then.

Prefer glTF/GLB — all three sources offer it, and it avoids a conversion step.
