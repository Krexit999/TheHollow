/**
 * WHERE A HOVER PANEL GOES — pure, so it can be tested without a DOM.
 *
 * Pulled out of `BucketInfo` (A.54) rather than left inline, because the branch
 * that matters most is the one the app cannot currently produce: no modifier
 * label ever sits in the top 180px of a room, since the face canvas owns the
 * top of every screen. A guard that no driver can exercise is a guard nobody
 * checks, and this project has shipped several of those. Here it is a function
 * with a test instead of a comment.
 *
 * The rules, in the order they matter:
 *   FIT     — never wider than the viewport, minus a margin each side.
 *   CLAMP   — centred on the anchor, then pulled back inside both edges, so a
 *             label near either side still shows its whole breakdown.
 *   FLIP    — above the anchor by default (it reads as belonging to the thing
 *             you are pointing at); below it when there is not room above.
 */
export interface Placement {
  left: number;
  width: number;
  /** True when the panel should hang below the anchor instead of above it. */
  flipDown: boolean;
}

export const TIP_MAX_W = 240;
export const TIP_MARGIN = 8;
/** Less headroom than this above the anchor and the panel goes below instead. */
export const TIP_MIN_ABOVE = 180;

export function tooltipPlacement(
  anchor: { left: number; top: number; width: number },
  viewport: { width: number; height: number },
  maxW = TIP_MAX_W,
  margin = TIP_MARGIN,
): Placement {
  const width = Math.min(maxW, Math.max(0, viewport.width - margin * 2));
  const centred = anchor.left + anchor.width / 2 - width / 2;
  const left = Math.max(margin, Math.min(centred, viewport.width - width - margin));
  return { left, width, flipDown: anchor.top < TIP_MIN_ABOVE };
}
