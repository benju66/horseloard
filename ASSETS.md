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

Each pack's own `License.txt` / `LICENSE.txt` ships alongside its models.

**Still missing: the hero's horse.** Quaternius (the animal pack) distributes
via a Google Drive folder, which can't be fetched programmatically — that one
download is Ben's. Until it lands, the hero renders as placeholder geometry,
which is a supported state.
