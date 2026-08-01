/**
 * THE EXPORT SPINE (Part B, A.39) — one thing per shell that the NEXT shell's
 * signature infrastructure refuses to run without.
 *
 * The Part A audit's verdict was that the shells are reskins because nothing
 * needs anything else: every system pays into the same modifier pool and no
 * shell's output is another shell's input. This registry was the fix.
 *
 * A.72 CUT FOUR OF THE FIVE PRODUCERS. Greenhouse, the Loom, the Bench and the
 * Ember Array — each shell's craft-system infrastructure — went, and each was
 * the sole producer of one export (Lodeframe, Set Resin + Fibercloth, Ground
 * Lens + Glasseal, Emberglass). The other road to each — Serra's export shelf
 * — went with the Guild in the same pass. Both roads to those five exports are
 * gone, so the KEEP-side gates that consumed them (Refraction's mirrors,
 * Pressure's vent pipes, Absence's Hollow rebuild) had their requirement
 * dropped at the source, not left as a wall with no door — see the comments
 * at each call site.
 *
 * WHAT SURVIVES: Kilnflux (Loam → Ferrite) is a Refinery chain, untouched by
 * any of this and still the Crucible's real fuel bill. Resonance (Hollow →
 * Aleph) was always a currency, earned by listening, spent writing an Axiom —
 * nothing about it depended on a craft-system producer either. The registry
 * stays, named down to what is actually still true.
 */

export interface ShellExport {
  shellId: string;
  /** The exported material id, or null for the Hollow (Resonance, a currency). */
  materialId: string | null;
  currencyId?: string;
  /** Where it is made, named for the UI ("refine it in Loam…"). */
  producedBy: string;
  /** What demands it, named for the UI. */
  consumedBy: string;
}

/** Ordered loam → hollow. The five bench-made exports left with their producers (A.72). */
export const SHELL_EXPORTS: ShellExport[] = [
  { shellId: 'loam', materialId: 'kilnflux', producedBy: 'the Refinery (The Kiln Firing)', consumedBy: 'every Crucible pour in Ferrite' },
  { shellId: 'hollow', materialId: null, currencyId: 'resonance', producedBy: 'listening in the Hollow', consumedBy: 'writing an Axiom' },
];

export const EXPORT_BY_MATERIAL = new Map(
  SHELL_EXPORTS.filter((e) => e.materialId).map((e) => [e.materialId!, e]),
);

export function exportsOfShell(shellId: string): ShellExport[] {
  return SHELL_EXPORTS.filter((e) => e.shellId === shellId);
}

/**
 * `produceExport` / `EXPORT_RECIPES` are GONE (A.72). Every bench-made export
 * (Lodeframe, Set Resin, Ground Lens, Glasseal) was produced through them, and
 * every one of those benches is cut. Kilnflux runs through the Refinery's own
 * chain verb; Resonance was always a currency. Nothing calls `produceExport`
 * for a live recipe any more, so it is not kept as a function that can only
 * ever say "Nothing makes that."
 */
