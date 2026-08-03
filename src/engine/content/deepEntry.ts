/**
 * THE DEEP-ENTRY LADDER, PER SHELL (§16.2) — authored content, not system logic.
 *
 * Each shell has three, gated at compaction 8 / 14 / 20. Deepest one met wins;
 * one roll, one material. `systems/compaction.ts` owns the mechanism and reads
 * this; nothing else should.
 *
 * WHY IT LIVES IN `content/` RATHER THAN IN THE SYSTEM (A.89). A gate names a
 * stone you FIND — it is a SOURCE, exactly like a station's `seams` pool, and
 * the consumer audits scan engine source text to decide what nothing wants. The
 * moment Glassmere's `weepstone` gate was written, `weepstone` read as
 * "consumed" and `weepstoneToLoamiron` lost the only justification it had.
 *
 * That is the THIRD instance of one bug: a list that names materials without
 * wanting them, sitting inside the scan. It was `shell1/roll.ts` by filename
 * (A.84), then any `content/**\/roll.ts` by pattern (A.87), then the registry
 * (A.88) — and the registry only knew about ROLLS. So the table moves here and
 * `content/rolls.ts` registers this file too: one list of things that name
 * without wanting, and a source registry cannot fall out of it by being written
 * somewhere new.
 *
 * THESE CHANCES ARE UNVERIFIED BALANCE, inherited from Loam's original three —
 * set to make the first find reachable inside an hour, never sim-checked. The
 * per-shell tables copy them deliberately rather than inventing new ones: a
 * second unverified number is worse than a shared one.
 */

export interface DeepGate { at: number; materialId: string; chance: number }

/**
 * LOAM'S THREE, and the default every unauthored shell falls back to.
 *
 * The fallback is WRONG and knowingly so — a Verdance player once dug Deepgrave
 * out of soil, and the shells with no table of their own still do. Writing the
 * remaining ladders is a materials pass per shell (§16.2 names twelve stones,
 * most of which are not in the registry); switching those shells to "no deep
 * drops at all" would be a silent content change to worlds this pass is not
 * about. Ledgered.
 */
export const DEEP_GATES: DeepGate[] = [
  { at: 20, materialId: 'deepgrave', chance: 0.06 },
  { at: 14, materialId: 'graveclaydeep', chance: 0.11 },
  { at: 8, materialId: 'umberjade', chance: 0.18 },
];

/**
 * WHERE A SHELL REUSES A STONE THAT ALREADY EXISTS, it is doing the `umberjade`
 * thing on purpose: a second way to FIND something, never a second something
 * that means the same. Only a TERMINAL is ever new, because a terminal must come
 * out of the deepest gate and nowhere else.
 *
 *   loam       umberjade (pool) · graveclaydeep (new) · deepgrave (new)
 *   ferrite    wormsteel (Loam pure) · lodestonecored (new) · poleiron (new)
 *   verdance   sapstone (own common) · bindingclay (Loam rich) · thornwall (new)
 *   glassmere  weepstone (Loam aberrant) · truesilica (new) · truelight (new)
 */
export const DEEP_GATES_BY_SHELL: Record<string, DeepGate[]> = {
  loam: DEEP_GATES,
  ferrite: [
    { at: 20, materialId: 'poleiron', chance: 0.06 },
    { at: 14, materialId: 'lodestonecored', chance: 0.11 },
    { at: 8, materialId: 'wormsteel', chance: 0.18 },
  ],
  verdance: [
    { at: 20, materialId: 'thornwall', chance: 0.06 },
    { at: 14, materialId: 'bindingclay', chance: 0.11 },
    { at: 8, materialId: 'sapstone', chance: 0.18 },
  ],
  glassmere: [
    { at: 20, materialId: 'truelight', chance: 0.06 },
    { at: 14, materialId: 'truesilica', chance: 0.11 },
    { at: 8, materialId: 'weepstone', chance: 0.18 },
  ],
};

export function deepGatesFor(shellId: string): DeepGate[] {
  return DEEP_GATES_BY_SHELL[shellId] ?? DEEP_GATES;
}
