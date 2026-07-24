# THE HOLLOW — UNBUILT LEDGER

> Split from DESIGN.md. The ledger is a claim, not evidence (see PILLARS.md working rules).

## UNBUILT — the deferral ledger

Every item cut or deferred from a phase, which phase it came from, and why — so a later
phase can check whether the reason still holds (a cut is provisional; its reason can
dissolve). **Append to this whenever anything is deferred.** Backfilled by auditing the
appendices.

**The ledger is a claim, not evidence** (see the working rule below). This table was
rebuilt at A.35 against the codebase, not from memory: every row's status was set by an
actual reference check (the file and symbol are named in the row), after two rows —
gem cutting and rune casting — were found marked UNBUILT while their implementations had
already shipped in P18. Verify a row against the code before you act on it.

| Item | Phase | Status | Verified against | Note |
|---|---|---|---|---|
| **Sound / audio** | P17 Part 4 (A.27) | UNBUILT | No `AudioContext`/`Audio`/`playSound` anywhere in `src/` (A.35 grep, zero hits) | The most-regretted cut: early boredom ties to everything after it, but sound done badly (a global audio context fighting `prefers-reduced-motion`, autoplay before opt-in) is worse than silence. Deserves a phase where it is the headline. |
| **Trait-driven visual identity** (a tool/material *looks* like its traits) | P17 Part 4 (A.27) | PARTIAL | Trait colour in renderers; no systematic per-trait visual language | Cut alongside sound; some trait-driven colour exists, but a full per-trait visual grammar was not built. |
| **Gem cutting** (shape a raw gem before socketing) | ~~P16 Part 4~~ → **built P18** | **BUILT** | `finishCut` + `workbench.gemCuts` in `workbenchActs.ts:197`; `cut` act live in `CraftWorkbench.tsx` | **Ledger correction (A.35):** was marked UNBUILT from memory; it shipped in the P18 Workbench as the `cut` craft-act. A raw gem is cut (lean + quality 0..1) before it socket-reads. |
| **Gem fusion** (combine gems) | P16 Part 4 → **built A.35** | **BUILT (A.35)** | `fuseGems`/`fuseGemsPreview` in `workbenchActs.ts:307`; live in `CraftWorkbench.tsx:500` | Two duplicates fuse into a better cut for the type — non-destructive (quality never falls), diminishing toward a 0.7 cap below a clean hand-cut, so skill still beats grinding. |
| **Tool rune-slots** (more room on a better tool) | P16 Part 4 → **built A.35** | **BUILT (A.35)** | `runeSlots(state,target)` in `content/shell4/runes.ts:117` (tool I–V:3, VI–X:4, XI–XV:5; gear fixed 3) | Tier buys sequence length; a longer sequence is where triples live. |
| **Rune extraction** (pull a seated rune back out) | P16 Part 4 (A.26) | PARTIAL | `salvageTool(..., extract)` recovers runes if paid | Extraction exists via salvage; a dedicated non-destructive un-seat was not built. |
| **Heirloom narrative history** (a tool remembers its deeds) | P16 Part 4 → **built A.35** | **BUILT (A.35)** | `heirloom.ts` (`HEIRLOOM_MARKS`, `addToolMark`, `logToolDeed`); hooks in combat/drops/breach/recursion; badges in `ForgePanel.tsx` | Marks (warden / recursion / geodes×100 / breach) read on the tool, each a small capped touch of `dropRate`. Distinct from P17 heirloom *composition* (parts through a Recursion), which already existed. |
| **Rune casting from materials, hand-craft vs delegate** | ~~P17 Part 3~~ → **built P18** | **BUILT** | `finishCast` + `CAST_RECIPES` + `matchCast` in `workbenchActs.ts:228`; `cast` act live | **Ledger correction (A.35):** was marked UNBUILT from memory; casting shipped in the P18 Workbench (a `cast` act reads input traits → a rune). A.35 added `runes.castKinds` so a cast rune is counted apart from a found one. |
| **Salvage: bulk / auto-salvage** | P16 Part 2 → **built A.35** | **BUILT (A.35)** | `bulkSalvage` in `salvage.ts:95`; two live buttons in `ForgePanel.tsx:59` | Break down every obsolete tool at once (below the equipped tool's tier), optionally paying to keep runes/gems. Never touches the equipped or the last tool. |
| **Tempering: the deeper media tree** | P16 Part 3 → **deepened A.35** | PARTIAL | `temperBonus` scales active bonus by `1 + 0.4·affinity` in `tempering.ts:129` | Deepened this phase: a temper now RESONATES with the tool's shell affinity (temper × where you are × the history in your hand). A broader tree of new quench media is still room to grow. |
| **The Face Cluster — Kiln + Drill Bay** | A.33 | **BUILT (A.34)** | (resolved) | Deferred at the A.33 green checkpoint; completed in the follow-up. Kept as a resolved entry — the ledger records outcomes, not just open items. |
| **Delver skill tree — the full 22/branch (66-node) size** | A.36 | PARTIAL | `SKILL_NODES` in `content/shell1/skillTree.ts` — **24 nodes** (Loam's opening set + more opening across shells II–VII via `unlockBreach`) | A.36 fixed the reported bug — the tree now OPENS PROGRESSIVELY across all seven shells and points no longer dead-end in Loam. But the locked spec is 3 branches × ~22 nodes (66); the game has 24. Reaching the full count (and spending all ~260 points earned by L200) is a balance/content pass, out of scope for a fix. The stubs are gone; the shape is real but shorter than the spec. **Re-counted A.37: 24, not 25.** |
| **Core tree — spec'd depth** | A.37 (Part 0) | PARTIAL (honest) | `CORE_NODES` in `content/shell1/coreTree.ts` — **14 nodes**; spec sketched ~28 | Unlike the old skill-tree stub, this is NOT deceptive: the 14 are real, tranche-gated nodes with no fake "opens later" UI promising nodes that never arrive. The shortfall is a shorter tree, not a lie about its length. Doubling it out is a Core-economy balance pass, out of scope for a legibility phase. Ledgered here so the gap is on the record, not hidden. |

Anything cut in a future phase gets a row here with the same columns, a `Verified against`
reference, and an honest reason, so nothing deferred is silently dropped.

