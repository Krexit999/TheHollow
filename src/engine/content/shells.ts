/**
 * Shell content registrations. Adding a shell = one registerShell call plus
 * its currencies (and, if it has one, a signature module + craft-system).
 */
import { registerShell } from '../shells';
import { registerCurrency } from '../resources';

export function registerShellContent(): void {
  registerShell({
    id: 'loam',
    ordinal: 1,
    name: 'Loam',
    title: 'SHELL I · LOAM',
    chipCurrencyId: 'dust',
    convCurrencyId: 'brick',
    converterName: 'The Kiln',
    converterFlavor: 'A throat of stacked stone that turns Dust into Brick.',
    floorDepth: 150,
    walls: [
      { depth: 45, tier: 2 },
      { depth: 110, tier: 3 },
    ],
    // Loam's signature (Phase 5 correction): the loam always gives a little.
    signatureId: 'seepage',
  });

  registerShell({
    id: 'ferrite',
    ordinal: 2,
    name: 'Ferrite',
    title: 'SHELL II · FERRITE',
    chipCurrencyId: 'ingot',
    convCurrencyId: 'flux',
    converterName: 'The Bloomery',
    converterFlavor: 'A ribbed furnace that sweats Ingot into Flux. It hums on one note.',
    floorDepth: 250,
    walls: [
      { depth: 40, tier: 4 },
      { depth: 100, tier: 5 },
      { depth: 170, tier: 6 },
    ],
    signatureId: 'polarity',
    drillByproduct: { currencyId: 'scale', perCharge: 0.03 },
    deepByproduct: { currencyId: 'rime', minDepth: 200, perCharge: 0.02 },
  });

  registerShell({
    id: 'verdance',
    ordinal: 3,
    name: 'Verdance',
    title: 'SHELL III · VERDANCE',
    chipCurrencyId: 'spore',
    convCurrencyId: 'sap',
    converterName: 'The Rendery',
    converterFlavor: 'A press of green copper that weeps Spore into Sap. It is always slightly warm, and it drips on a beat.',
    // 290, not 350 (A.16): shell spans are sized to the multiplier machinery
    // one shell actually accrues — Verdance at 350 measured a 13h arc.
    floorDepth: 290,
    walls: [
      { depth: 45, tier: 7 },
      { depth: 120, tier: 8 },
      { depth: 210, tier: 9 },
    ],
    signatureId: 'growth',
    drillByproduct: { currencyId: 'humus', perCharge: 0.03 },
    deepByproduct: { currencyId: 'resin', minDepth: 250, perCharge: 0.02 },
  });
}

export function registerGlassmereShell(): void {
  registerShell({
    id: 'glassmere',
    ordinal: 4,
    name: 'Glassmere',
    title: 'SHELL IV · GLASSMERE',
    chipCurrencyId: 'prism',
    convCurrencyId: 'lumen',
    converterName: 'The Lenswork',
    converterFlavor: 'A cold gallery of ground glass that focuses Prism into Lumen. It makes no sound at all.',
    floorDepth: 380,
    walls: [
      { depth: 50, tier: 10 },
      { depth: 160, tier: 11 },
      { depth: 270, tier: 12 },
    ],
    signatureId: 'refraction',
    drillByproduct: { currencyId: 'silica', perCharge: 0.03 },
    deepByproduct: { currencyId: 'frost', minDepth: 300, perCharge: 0.02 },
  });
  registerCurrency({
    id: 'prism', name: 'Prism', tier: 'shell', color: '#bcd8ee',
    description: 'Chipped light, still angular. It remembers which way it was going.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'lumen', name: 'Lumen', tier: 'shell', color: '#eef6ff',
    description: 'What Prism becomes when the Lenswork agrees with it. Weightless, priceless.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'silica', name: 'Silica', tier: 'shell', color: '#c8c2b8',
    description: 'Ground glass off the drills. The Bench shapes optics from it.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'spectrum', name: 'Spectrum', tier: 'shell', color: '#d8b8ee',
    description: 'Colors that arrive from very far away. The Observatory bottles them.',
    resetsOnCollapse: false,
  });
  registerCurrency({
    id: 'frost', name: 'Frost', tier: 'shell', color: '#e8f4fa',
    description: 'Cold from below three hundred. It is not water. Stop asking.',
    resetsOnCollapse: true,
  });
}

export function registerCinderShell(): void {
  registerShell({
    id: 'cinder',
    ordinal: 5,
    name: 'Cinder',
    title: 'SHELL V · CINDER',
    chipCurrencyId: 'slag',
    convCurrencyId: 'ember',
    converterName: 'The Slagworks',
    converterFlavor: 'A row of tapped crucibles that runs Slag down into Ember. It glows through its own seams, and it is never, ever cold.',
    // Floor per A.16 sizing (~+90 per shell past Glassmere's 380).
    floorDepth: 470,
    walls: [
      { depth: 55, tier: 13 },
      { depth: 175, tier: 14 },
      { depth: 300, tier: 15 },
    ],
    signatureId: 'pressure',
    drillByproduct: { currencyId: 'obsidian', perCharge: 0.03 },
    deepByproduct: { currencyId: 'pyre', minDepth: 380, perCharge: 0.02 },
  });
  registerCurrency({
    id: 'slag', name: 'Slag', tier: 'shell', color: '#c47a4a',
    description: 'Rock that already burned once and resents doing it again.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'ember', name: 'Ember', tier: 'shell', color: '#e0703c',
    description: 'What the Slagworks distills out of Slag: heat you can spend, carefully.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'obsidian', name: 'Obsidian', tier: 'shell', color: '#6e6480',
    description: 'Cooled fast enough to keep an edge. The Vent Network is plumbed with it.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'pyre', name: 'Pyre', tier: 'shell', color: '#e8a83c',
    description: 'Fuel from below three-eighty, dense as a held breath. The Array burns nothing finer.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'cinder', name: 'Cinder', tier: 'shell', color: '#a89890',
    description: 'What is left when everything that could leave has left. It keeps the shape of what it was.',
    resetsOnCollapse: false,
  });
}

export function registerHollowShell(): void {
  registerShell({
    id: 'hollow',
    ordinal: 6,
    name: 'Hollow',
    title: 'SHELL VI · THE HOLLOW',
    chipCurrencyId: 'void',
    convCurrencyId: 'nullEssence',
    converterName: 'The Still Point',
    converterFlavor: 'It does not turn Void into Null. It holds very still, and the Void decides to be Null near it.',
    floorDepth: 560,
    walls: [], // there is no rock to be hard
    signatureId: 'absence',
  });
  registerCurrency({
    id: 'void', name: 'Void', tier: 'shell', color: '#8a86a8',
    description: 'Measured nothing. It weighs exactly what you expect and that is the unsettling part.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'nullEssence', name: 'Null', tier: 'shell', color: '#6a6684',
    description: 'Void, distilled to its opinion of itself.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'hush', name: 'Hush', tier: 'shell', color: '#b8b4d0',
    description: 'A harvested quiet, folded small. The Loom will not touch it. The Loom is afraid of it.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'umbra', name: 'Umbra', tier: 'shell', color: '#4e4a66',
    description: 'The shadow of something that has not arrived yet.',
    resetsOnCollapse: false,
  });
}

export function registerAlephShell(): void {
  registerShell({
    id: 'aleph',
    ordinal: 7,
    name: 'Aleph',
    title: 'SHELL VII · ALEPH',
    chipCurrencyId: 'fragment',
    convCurrencyId: 'sigil',
    converterName: 'The Rewrite',
    converterFlavor: 'A desk. A pen. The pen writes on the world directly, which is why the desk is bolted down.',
    floorDepth: 40, // the Core. Short shell, large idea.
    walls: [],
    signatureId: 'absence', // the void follows you to the Core; the rock here is the FIRST rock
  });
  registerCurrency({
    id: 'fragment', name: 'Axiom Fragment', tier: 'shell', color: '#d9c25c',
    description: 'A piece of a rule. Sharp on every edge, including the ones facing away.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'sigil', name: 'Sigil', tier: 'shell', color: '#e8d88c',
    description: 'A rule, signed. The Core accepts no unsigned rules.',
    resetsOnCollapse: false,
  });
  registerCurrency({
    id: 'axiom', name: 'Axioms', tier: 'reset', color: '#f0e6a8',
    description: 'What a world is worth after you have fallen through all of it. Spent at the Rewrite, permanently.',
    resetsOnCollapse: false,
  });
}

export function registerVerdanceCurrencies(): void {
  registerCurrency({
    id: 'spore', name: 'Spore', tier: 'shell', color: '#9ccf7a',
    description: 'The green dust of a shell that is alive. It sticks to everything, hopefully.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'sap', name: 'Sap', tier: 'shell', color: '#d9b64a',
    description: 'What Spore becomes under the Rendery\'s patient weight. Sweet, slow, structural.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'chlorophyll', name: 'Chlorophyll', tier: 'shell', color: '#5fae52',
    description: 'Shed by harvested blooms. The Greenhouse drinks it neat.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'humus', name: 'Humus', tier: 'shell', color: '#7a6248',
    description: 'Rich dark rot from under the drills. The Mycelium asks for nothing else.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'resin', name: 'Resin', tier: 'shell', color: '#c98d3a',
    description: 'Amber blood from rock two-fifty deep. Brews want it; so does the light, the way it holds it.',
    resetsOnCollapse: true,
  });
}

export function registerFerriteCurrencies(): void {
  registerCurrency({
    id: 'ingot',
    name: 'Ingot',
    tier: 'shell',
    color: '#9fb3c8',
    description: 'Cold metal, chipped straight from the rock. It rings when it lands.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'flux',
    name: 'Flux',
    tier: 'shell',
    color: '#7fd4e0',
    description: 'What Ingot becomes when the Bloomery is done arguing with it.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'scale',
    name: 'Scale',
    tier: 'shell',
    color: '#8a97a8',
    description: 'Flakes off under the drills. The Magnet Array eats it.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'lodestone',
    name: 'Lodestone',
    tier: 'shell',
    color: '#7c8ede',
    description: 'Shed by long chains. Points somewhere, insistently.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'rime',
    name: 'Rime',
    tier: 'shell',
    color: '#cfeef7',
    description: 'Frost from rock two hundred deep. It does not melt. It waits.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'echo',
    name: 'Echoes',
    tier: 'reset',
    color: '#d8ccf0',
    description: 'What a whole world sounds like after you fall through it.',
    resetsOnCollapse: false,
  });
}
