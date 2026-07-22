/**
 * CURING — time is the ingredient.
 *
 * Some stones improve if you leave them alone. Resin hardens, ore oxidizes into
 * something stabler, sap turns to amber over three real days. A cache at depth
 * holds the stone; real time does the work — including the time you are away,
 * which is the one thing an idle game is uniquely placed to make matter.
 *
 * THE RULES, each a test:
 *  - It CONVERTS, it does not PRODUCE. A batch of N cures into N of the result —
 *    better in character, never more in count. Curing is upside on patience, not
 *    a second income rate (pillar 2). No path increases quantity.
 *  - Nothing spoils and nothing is missed. Past completion a cure just waits;
 *    leaving it a year is never worse than leaving it a week. You may also pull a
 *    stone out early, uncured — you get exactly what you put in back.
 *  - Discovery, not a list (pillar 5). WHICH stones cure, INTO WHAT, and HOW LONG
 *    is found by leaving things at depth, and written into your own Codex. This
 *    table is the source of truth the game reads; it is never shown as a list.
 *
 * The depth requirement is what ties curing to the column: a stone needs the
 * conditions of the deep to change, so the cache must be installed deep enough.
 */
export interface CureRecipe {
  id: string;
  /** The stone you leave. */
  from: string;
  /** What patience turns it into (a `worked` material — never mined). */
  to: string;
  /** Real hours the change takes. Includes time spent away. */
  hours: number;
  /** The cache must sit at least this deep — the stone needs the conditions. */
  minDepth: number;
  /** Shown only once the cure is discovered. */
  flavor: string;
}

/**
 * Seven cures across the first five shells. Durations span a quick set (3h) to
 * the flagship three-day amber; depths span the shallow (12) to the deep (90),
 * so a cure always asks you to install a cache somewhere specific.
 */
export const CURE_RECIPES: CureRecipe[] = [
  { id: 'cureOchre', from: 'ochre', to: 'rustochre', hours: 3, minDepth: 12,
    flavor: 'Ochre reddens as the iron in it finds the damp air of the deep.' },
  { id: 'cureSilk', from: 'wormsilk', to: 'setsilk', hours: 6, minDepth: 20,
    flavor: 'Wormsilk sets from thread into cloth if nobody disturbs it.' },
  { id: 'cureRootglass', from: 'rootglass', to: 'stillglass', hours: 10, minDepth: 30,
    flavor: 'Rootglass held still lets its charge settle into one true line.' },
  { id: 'cureRustmarrow', from: 'rustmarrow', to: 'bloomrust', hours: 8, minDepth: 45,
    flavor: 'Rustmarrow taken all the way through the rust reaches the stable bloom beyond.' },
  { id: 'cureSap', from: 'sapstone', to: 'sunamber', hours: 72, minDepth: 40,
    flavor: 'Sap left three days in the deep — and not a day less — comes out amber and true.' },
  { id: 'cureFrost', from: 'frostsand', to: 'frostpane', hours: 18, minDepth: 65,
    flavor: 'Frostsand settles grain by grain into a single clear pane.' },
  { id: 'cureAsh', from: 'ashgrit', to: 'cinderglass', hours: 24, minDepth: 90,
    flavor: 'Ash grit fuses where the deep runs warm.' },
];

const BY_FROM = new Map(CURE_RECIPES.map((r) => [r.from, r]));
const BY_ID = new Map(CURE_RECIPES.map((r) => [r.id, r]));

/** The recipe a given stone cures by, if any. */
export function cureFor(materialId: string): CureRecipe | undefined {
  return BY_FROM.get(materialId);
}
export function cureById(id: string): CureRecipe | undefined {
  return BY_ID.get(id);
}
/** Is this stone one that changes if left alone? (A property, like a trait.) */
export function isCurable(materialId: string): boolean {
  return BY_FROM.has(materialId);
}

export const HOUR_MS = 3_600_000;
