# HERO-DESIGN.md — the Horse Lord

The mounted archer commander. The player *is* this character — pillar 1 is "you are on
the field", and this is the thing that makes that true. It is on screen 100% of the time,
which is why DESIGN §10 once called it "the single highest-leverage art dollar."

> **Naming:** Ben has referred to it as the *Horse King*. The project title "Horse Lord"
> is explicitly a working title (DESIGN §15.6) and the character has never been formally
> named in-fiction. Worth settling: the title, the character name, and whether they are
> the same word. This doc says "the Horse Lord" for now.

---

## 1. What it is, mechanically (all shipped and tuned — do not redesign)

| | |
|---|---|
| Move speed | 150 u/s — crosses a map in ~3.5s. "Ride to the problem" is a real verb. |
| Contact radius | 16 |
| Cannot die | Heavy enemies **stagger** instead: 70u shove, 0.4s control loss, 1.2s per-enemy cooldown |
| Trample | 6 damage on contact while moving, 1s per-enemy cooldown |
| Bow | Auto-fire, nearest target in range. Six levels, bought at the forge, reset each run |
| Abilities | Charge (free), Volley, Rally Horn — all cast **at/from the hero**, never tap-anywhere |

**Design rule that constrains everything:** the hero has no health bar and cannot lose.
All tension comes from *position* — being in the wrong place. Any visual design must
therefore read its **position and facing** instantly, at phone size, from a 55° camera.

## 2. Silhouette requirements

- **Chibi, 2–2.5 heads tall** including the mount, matching the enemy roster. The
  proportion gate applies to the hero more than anything else — it is the reference
  every other character is judged against.
- **Blue (`#3b5dc9`) must dominate.** The hero is the only blue thing on the field;
  enemies are red (`#c4452e`). That contrast is the entire faction read at gameplay zoom,
  and it must survive a colourblind pass (M4 requirement) — so also differentiate by
  *shape*: the hero is the only mounted silhouette in the game.
- **Reads from above.** At 55° elevation the horse's back, the rider's shoulders and the
  bow shape carry the read. Legs and hooves are nearly invisible; do not spend detail there.
- **Wider than tall in plan view** — the horse's length is the thing that distinguishes it
  from every upright enemy at a glance.

## 3. Construction: a composite, not one model

The hero is **rider parented to horse** at the `mount` socket, with the bow at `hand`.
This is already how `models.json` describes it, and it buys three things:

1. Mount/dismount becomes possible later at no extra cost.
2. The horse and rider can be sourced, replaced or upgraded independently.
3. **It is what makes visual progression cheap** — see §4.

```
unit-hero (base-horse)
 ├─ mount socket  → rider mesh
 └─ hand socket   → bow mesh
```

Current state: the rider is a KayKit Knight; **the horse is still placeholder geometry**
because Quaternius distributes via Google Drive and needs a manual download.

## 4. Visual progression — the new design

**The problem it solves.** The forge bow track costs 30 → 142 gold across six levels and
currently changes *nothing visible*. A player spends 142 gold and the hero looks
identical. That is a dead reward: the numbers improve, the fantasy doesn't.

**The proposal.** Bow level drives a visible kit-up. Because the hero is already a
socket-composite, this is prop swapping — no new rig, no new animation, and every tier
is a small independent asset rather than six full character models.

| Bow | Damage / interval | Visual change | Socket |
|---|---|---|---|
| **L1** | 13 / 0.475 | Plain rider, simple shortbow, bare horse | — |
| **L2** | 18 / 0.43 | **Quiver** on the back | `back` |
| **L3** | 23 / 0.385 | **Recurve bow** replaces the shortbow; shoulder guard | `hand`, `back` |
| **L4** | 28 / 0.34 | **Helmet with crest** | `head` |
| **L5** | 33 / 0.295 | **Cape**; barding (armour cloth) on the horse | `back`, horse |
| **L6** | 38 / 0.25 | **Gold trim** on helm and bow; horse plume | tint + `head` |

**Why this ordering:** the earliest change (quiver) is the cheapest asset and the most
legible silhouette change from above. Gold trim is last because colour-only changes read
worst at distance and best as a "you are maxed" flourish.

**Read-at-a-glance test:** a player should be able to tell L1 from L6 in a screenshot,
and roughly place the middle tiers. If two adjacent tiers are indistinguishable at phone
size, merge them and add the spare change elsewhere.

### Implementation sketch (not built yet)

The manifest's `props` array is currently static per model. Progression needs props that
appear at a threshold. Smallest change that works:

```jsonc
// src/data/models.json — proposed, NOT implemented
{
  "id": "unit-hero",
  "base": "base-horse",
  "props": [
    { "id": "hero-rider", "socket": "mount", "file": "models/hero/rider.glb" },
    { "id": "hero-bow",   "socket": "hand",  "file": "models/hero/bow-short.glb", "maxTier": 2 },
    { "id": "hero-bow-recurve", "socket": "hand", "file": "models/hero/bow-recurve.glb", "minTier": 3 },
    { "id": "hero-quiver","socket": "back",  "file": "models/hero/quiver.glb", "minTier": 2 },
    { "id": "hero-helm",  "socket": "head",  "file": "models/hero/helm.glb",   "minTier": 4 },
    { "id": "hero-cape",  "socket": "back",  "file": "models/hero/cape.glb",   "minTier": 5 }
  ]
}
```

- Schema: add optional `minTier` / `maxTier` to `ModelPropSchema`.
- Renderer: `ModelViewFactory` gains `setTier(view, n)`; the game calls it with
  `sim.hero.bowLevel` whenever it changes. Props toggle `visible`.
- **Substrate rule holds** — the engine never learns any of this exists; `bowLevel` is
  already public sim state and the renderer only reads it.
- Cost: roughly an hour of code, then one small asset per tier.

**Deliberately out of scope for now:** meta-tree upgrades driving visuals too. The
in-run bow track is the tighter loop and the better first proof — meta upgrades persist
across runs, so a maxed player would simply always look maxed, which is a weaker signal.

## 5. Animation needs

Minimum viable: **`walk` and `idle`** on the horse. Everything else falls back to
`procedural` (code-driven bob, lean, shove) and the game is fully playable.

Nice to have, in priority order: `stagger` (the shove already has camera kick and a red
flash, but a real recoil would sell it), then `attack` (a draw-and-loose on the rider —
note the bow auto-fires as often as every 0.25s at L6, so this must be very short or it
will look frantic).

**The rider does not need leg animation** — it is seated. That is a real saving.

## 6. Open questions

1. **Name.** Horse Lord / Horse King / something in-fiction. Affects the title too.
2. **Does the horse change colour or breed with progression**, or only its barding? Colour
   change risks weakening the blue faction read.
3. **Should Charge get a distinct visual state** — mane streaming, lowered posture? It is
   the identity verb and currently reads only through FX (burst, camera kick, ring swell).
   Ben has already flagged Charge as not making sense; a posture change may be part of the
   answer.
