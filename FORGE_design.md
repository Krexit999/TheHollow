# THE HOLLOW — The Forge (Tinkers-style tool crafting)

Design blueprint. Build against this. This replaces the current slider-Forge entirely.
The Forge is the first "machine" (see machine-rewrite plan) and the biggest material sink
in the game — so building it makes materials matter immediately.

## The fantasy
A tool that is YOURS. You melt raw material, cast it into parts, assemble the parts into a
tool, mine with it, and upgrade it across the whole game. You never throw it away for a
better drop — you re-cast worn parts and improve the one you built. Tinkers Construct, but
deeper and wired into the game's other systems.

## The loop
1. MELT — heat a raw material into molten stock (a tub/basin fills with the melt).
2. CAST — pick a cast (a part shape), pour the molten material in, it cools into that PART
   in that material.
3. BUILD — in the tool station, drop a part into each slot, combine → your tool.
4. MINE — the tool is your manual mining tool (what you click the grid with).
5. UPGRADE — re-cast worn parts, swap parts for better materials, socket relics/runes/gems,
   add modifiers. The tool grows across the game.

## The tool is the manual mining tool
This is what the player clicks the grid with. Its stats change how manual mining feels —
speed, power, ore-mining, durability. It sits alongside drills (the idle layer); the tool is
the ACTIVE layer. A good tool makes active mining meaningfully better than bare clicking,
never required (idle/drills still work — pillar 1).

## THE SEVEN PARTS
Each part is cast from one material. The material's rarity/purity sets stat MAGNITUDE; its
traits set the tool's CHARACTER. All derived procedurally from existing material data — no
hand-authoring 158 materials.

| Part | Governs | Notes |
|---|---|---|
| **Head** | mining SPEED + POWER (breaking rock) | the main "how fast/hard you mine" part |
| **Core** | DURABILITY pool (the big one) + ore handling | the tank of the tool |
| **Edge/Tip** | ORE mining speed + cutting harder cells | the ore specialist (player's ask: ore speed) |
| **Binding** | modifier slots + how well mismatched parts cooperate | ties the tool together |
| **Handle** | durability + swing/use rate | secondary durability + speed |
| **Grip** | control → crit-like bonuses / trait amplification | fine-tuning |
| **Sockets** | hold relics / runes / gems for their effects | the tie-in to existing systems |

### Part → stat mapping (procedural, from existing material fields)
- **Magnitude** comes from rarity/purity band (common→aberrant) — deeper material = bigger
  numbers, so deep-shell materials make better parts (gives deep materials a job).
- **Character** comes from traits. Examples of trait→effect on a part:
  - `keen` → mining speed / cutting
  - `dense` / `tough` → durability, power
  - `brittle` → high speed but wears faster (a real tradeoff)
  - `charged` → socket/modifier synergy, ability triggers
  - `warm` → performs better in hot shells (Cinder), worse in cold
  - `springy` → swing/use rate
  - `light` → less durability drain per use
  - `hollow` → more modifier slots but lower base stats
  - `trueseated` → stability, less penalty from mismatched parts
- So "umberjade head" (brittle/charged) = fast, ability-prone, wears fast. "graveclay head"
  (dense/tough) = slower, tanky, lasts. Same part, different tool, from material choice.

## DURABILITY — never lost, can be broken
- A tool has a durability pool (mostly from Core + Handle materials).
- Using it drains durability. At **1 durability it is BROKEN** — heavily penalized (slow,
  weak) but STILL USABLE. You never lose the tool.
- Repair by re-casting the worn part, or a repair action using the same material.
- This is the "yours forever" promise with real maintenance — a reason to keep materials on
  hand and to care about part choice (a brittle edge needs re-casting often).

## SOCKETS — the tie-in
- Socket parts hold **relics, runes, and gems** — the existing systems plug straight into the
  tool. A socketed relic's effect applies to the tool. A rune inscribed. A gem set.
- Number of sockets comes from the socket-part material (hollow/charged materials give more).
- This connects the Forge to three systems that already exist instead of duplicating them.

## MODIFIERS
- After building, add modifiers (extra slots, ability triggers, stat boosts) by combining the
  tool with materials — Tinkers-style. Binding material sets how many modifier slots.
- Modifiers are where "the tool grows" late-game — discovered, not fully listed (pillar 5).

## HOW IT EATS MATERIALS (the point)
- Every part is a material. 7 parts × re-casting × modifiers = the biggest sink in the game.
- Deep-shell + dead materials get jobs: assign the 20 currently-dead materials (Hollow's 9,
  Aleph's thin set) as strong part materials, so they're worth mining.
- Rarity→magnitude means you WANT deeper materials for better parts — pulls the whole
  material tree into the tool.

## CASTING INTERACTION (the "do", not a slider)
- Melt: pick material → it fills the tub as molten stock (visible fill).
- Cast: pick a cast shape → pour → cools into the part. Satisfying, physical, not a timing bar.
- No puzzle, no fail (per the "not another puzzle" ruling) — you know what you want, you make
  it. The satisfaction is the making + the having.
- Infinite/batch input where it makes sense (melt a stack).

## PILLARS
- Pillar 1: the tool improves ACTIVE mining; idle/drills still work without it. Never required.
- Pillar 2: the tool mines FASTER/harder but total yield stays bounded by field regen (like
  ores, like abilities) — a better tool reaches the ceiling faster, never raises it.
  SIM-VERIFY this.
- Pillar 5: modifiers + material-character discovered, hinted not fully listed.
- Reach: casting/tool works every shell; parts castable from each shell's materials.

## PER-SHELL GATING
- Basic casting + the first parts unlock early (Loam).
- Deeper part types (Sockets, Grip, extra modifier depth) and better casts unlock per shell,
  so the tool system deepens as you descend — matches the machine-unlock spine.

## OPEN QUESTIONS (answer before/while building)
1. Is the tool a SINGLE tool you upgrade forever, or can you build/own SEVERAL and swap? (Lean:
   one main tool you grow, maybe unlock a second slot later.)
2. Do parts have their own durability, or one shared pool? (Lean: shared pool, but the worn
   part is what you re-cast — so part choice affects wear rate.)
3. How does melting relate to the Kiln (which already makes heat/brick)? Is the Kiln the
   melter, or is the Forge self-contained? (Lean: Forge self-contained for now, Kiln-tie later.)
4. Casting UI: how much is rendered vs plain panels? (Lean: plain functional panels — the tub
   fill + cast selection can be simple visuals, NOT a rendered canvas — canvas is this
   toolchain's weak zone. The satisfaction is the loop, not the graphics.)
5. Do the 7 parts all exist from the start, or unlock across shells? (Lean: Head/Core/Handle
   early, Edge/Binding/Grip/Sockets unlock deeper.)

## BUILD ORDER (when we prompt this)
1. Part system + procedural stat/trait mapping (the engine — parts from materials).
2. Casting (melt → cast → part) + the tool station (assemble parts → tool).
3. Wire the tool into manual mining (it's what you click with; stats affect mining).
4. Durability + repair.
5. Sockets (relics/runes/gems) + modifiers.
6. Per-shell gating + assign dead materials as part materials.
Build in plain panels, verify in play (cast a part, build a tool, mine with it, break it,
repair it), sim-verify pillar 2. Each step its own prompt against this doc.
