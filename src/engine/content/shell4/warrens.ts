/**
 * THE WARRENS — the game's only authored spatial content. Sixteen hand-built
 * side-tunnels (four per shell, retrofit to Loam/Ferrite/Verdance): a fixed
 * layout described in its own words, a puzzle, a fight, a guaranteed unique
 * that drops ONCE, and repeatable materials — the primary source of RUNES.
 *
 * Entering a Warren PAUSES the descent: a detour, not a cost. Nothing in a
 * Warren expires, resets on a clock, or punishes leaving mid-way.
 */
import type { ActionResult, EngineCtx, GameState } from '../../types';
import { addMaterial } from '../../systems/forge';
import { startFight } from '../../combat/combat';
import { depthRecord } from '../../shells';
import { grantRune, type RuneId } from './runes';

export type WarrenPuzzleKind = 'echo' | 'weights' | 'gates';

export interface WarrenDef {
  id: string;
  shellId: string;
  name: string;
  /** Depth the entrance appears at (record-gated, never missable). */
  depth: number;
  flavor: string;
  /** The room described — the handmade part. */
  layout: string;
  puzzle: { kind: WarrenPuzzleKind; seed: number; prompt: string };
  fight: string; // speciesId
  unique: { kind: 'rune' | 'gem' | 'gear'; id: string; note: string };
  repeatMats: Array<{ materialId: string; count: number }>;
  runeChance: { runeId: RuneId; chance: number };
}

const W = (def: WarrenDef): WarrenDef => def;

export const WARRENS: WarrenDef[] = [
  // ------------------------------- LOAM ------------------------------------
  W({
    id: 'ossuary', shellId: 'loam', name: 'The Quiet Ossuary', depth: 35,
    flavor: 'Bonechalk stacked by hands that counted.',
    layout: 'A round room of shelved chalk. Seven niches; six hold nothing; the seventh holds the sequence, and the sequence holds the door.',
    puzzle: { kind: 'echo', seed: 101, prompt: 'The niches light in an order. Give it back.' },
    fight: 'gravegnaw', unique: { kind: 'rune', id: 'kel', note: 'Kel, cut into a knuckle of chalk.' },
    repeatMats: [{ materialId: 'bonechalk', count: 6 }, { materialId: 'marrowglass', count: 1 }],
    runeChance: { runeId: 'kel', chance: 0.2 },
  }),
  W({
    id: 'rootcellar', shellId: 'loam', name: "Halden's Root-Cellar", depth: 70,
    flavor: 'He built it for his daughter\'s spring. He went home. It stayed.',
    layout: 'Shelves of preserved things and one stubborn scale: jars must balance to the mark scratched on the beam.',
    puzzle: { kind: 'weights', seed: 102, prompt: 'Load the scale to exactly the beam-mark.' },
    fight: 'silkweaver', unique: { kind: 'rune', id: 'mol', note: 'Mol, grown INTO a jar lid.' },
    repeatMats: [{ materialId: 'rootglass', count: 4 }, { materialId: 'wormsilk', count: 3 }],
    runeChance: { runeId: 'mol', chance: 0.2 },
  }),
  W({
    id: 'lamplighters', shellId: 'loam', name: "The Lamplighters' Walk", depth: 105,
    flavor: 'Dovekin\'s predecessors kept a road down here. The lamps remember the toll.',
    layout: 'A corridor of nine dead lamps. Gates bar the way; each gate opens when the right lamps burn and the wrong ones don\'t.',
    puzzle: { kind: 'gates', seed: 103, prompt: 'Light the lamps the gates ask for.' },
    fight: 'tunnelwight', unique: { kind: 'gem', id: 'hearthstone', note: 'A Hearthstone left as the last toll.' },
    repeatMats: [{ materialId: 'hollowamber', count: 2 }, { materialId: 'duskflint', count: 4 }],
    runeChance: { runeId: 'ash', chance: 0.2 },
  }),
  W({
    id: 'tapmothersgarden', shellId: 'loam', name: "The Tapmother's First Garden", depth: 140,
    flavor: 'Before she tended the floor, she tended this.',
    layout: 'A grown-over bower where every path curls back. The way through is the order she planted it in.',
    puzzle: { kind: 'echo', seed: 104, prompt: 'Walk the planting order. She is watching. She is always watching.' },
    fight: 'silkmatron', unique: { kind: 'gear', id: 'gardenersKnot', note: 'The Gardener\'s Knot — her own harness pattern.' },
    repeatMats: [{ materialId: 'taproot', count: 1 }, { materialId: 'wormsilk', count: 4 }],
    runeChance: { runeId: 'vey', chance: 0.25 },
  }),
  // ------------------------------ FERRITE ----------------------------------
  W({
    id: 'compassrose', shellId: 'ferrite', name: 'The Compass Rose', depth: 60,
    flavor: 'A room the needles avoid mentioning.',
    layout: 'Eight iron petals around a hub. The petals hum in an order the hub repeats wrong — correct it.',
    puzzle: { kind: 'echo', seed: 201, prompt: 'The hub lies. Repeat the PETALS\' order, not its.' },
    fight: 'lodecrab', unique: { kind: 'rune', id: 'thur', note: 'Thur, forged into a petal.' },
    repeatMats: [{ materialId: 'scalebackplate', count: 4 }, { materialId: 'ironsinew', count: 2 }],
    runeChance: { runeId: 'thur', chance: 0.2 },
  }),
  W({
    id: 'railyard', shellId: 'ferrite', name: 'The Sunken Railyard', depth: 130,
    flavor: 'Rails to nowhere, counterweights to everything.',
    layout: 'A turntable jammed by hanging counterweights. Balance the stated load and the table swings.',
    puzzle: { kind: 'weights', seed: 202, prompt: 'Hang exactly the turntable\'s asking-weight.' },
    fight: 'railtide', unique: { kind: 'rune', id: 'sen', note: 'Sen, stamped on a signal plate.' },
    repeatMats: [{ materialId: 'ironsinew', count: 4 }, { materialId: 'voltgland', count: 3 }],
    runeChance: { runeId: 'sen', chance: 0.2 },
  }),
  W({
    id: 'nullchapel', shellId: 'ferrite', name: 'The Null Chapel', depth: 190,
    flavor: 'Where the field goes to be quiet. Someone worshipped that.',
    layout: 'Pews of unmagnetized iron. Gate-wards open only when the right censers burn — the wrong ones anger the quiet.',
    puzzle: { kind: 'gates', seed: 203, prompt: 'Burn what the wards ask. Nothing else.' },
    fight: 'nullmoth', unique: { kind: 'rune', id: 'nix', note: 'Nix, in the silence under the altar.' },
    repeatMats: [{ materialId: 'nullquill', count: 2 }, { materialId: 'magnetheart', count: 1 }],
    runeChance: { runeId: 'nix', chance: 0.25 },
  }),
  W({
    id: 'sablescache', shellId: 'ferrite', name: "Sable's Cache", depth: 230,
    flavor: 'She left supplies for whoever followed. Vess would bill you; Sable didn\'t.',
    layout: 'A dead-drop behind a falsework wall, locked in her survey cipher: a combination in weights, because of course it is.',
    puzzle: { kind: 'weights', seed: 204, prompt: 'Her combination: the weights of page, pick, and lamp.' },
    fight: 'compasswight', unique: { kind: 'gear', id: 'sablesSatchel', note: 'Her satchel. It still smells of ink.' },
    repeatMats: [{ materialId: 'ironsinew', count: 3 }, { materialId: 'scalebackplate', count: 5 }],
    runeChance: { runeId: 'ur', chance: 0.25 },
  }),
  // ------------------------------ VERDANCE ---------------------------------
  W({
    id: 'seedvault', shellId: 'verdance', name: 'The Drowned Seed-Vault', depth: 60,
    flavor: 'Someone saved everything, in case. The case came.',
    layout: 'Rows of seed-drawers behind a living gate that opens to the germination order.',
    puzzle: { kind: 'echo', seed: 301, prompt: 'The drawers sprout in sequence. Repeat the spring.' },
    fight: 'rootboar', unique: { kind: 'rune', id: 'ash', note: 'Ash, kept dry a hundred years.' },
    repeatMats: [{ materialId: 'throatroot', count: 4 }, { materialId: 'mothspool', count: 3 }],
    runeChance: { runeId: 'ash', chance: 0.2 },
  }),
  W({
    id: 'loomshrine', shellId: 'verdance', name: 'The First Loom', depth: 150,
    flavor: 'Before the Lamphouse loft, the frame stood here.',
    layout: 'A great rotted loom whose warp-stones must balance for the shed to open.',
    puzzle: { kind: 'weights', seed: 302, prompt: 'Balance the warp-stones to the old tension.' },
    fight: 'loomspider', unique: { kind: 'rune', id: 'vey', note: 'Vey, woven into the last cloth.' },
    repeatMats: [{ materialId: 'wireweed', count: 4 }, { materialId: 'palefiber', count: 3 }],
    runeChance: { runeId: 'vey', chance: 0.2 },
  }),
  W({
    id: 'mireheart', shellId: 'verdance', name: 'The Mireheart', depth: 210,
    flavor: 'The bog keeps what it is given. It was given a door.',
    layout: 'Stepping-stumps over black water; gate-flowers that open for the right offerings and close the path for wrong ones.',
    puzzle: { kind: 'gates', seed: 303, prompt: 'Feed the gate-flowers their own colors.' },
    fight: 'mirefiend', unique: { kind: 'gem', id: 'mourningpearl', note: 'A Mourningpearl the mire refused to keep.' },
    repeatMats: [{ materialId: 'mawpith', count: 3 }, { materialId: 'throatroot', count: 5 }],
    runeChance: { runeId: 'mol', chance: 0.25 },
  }),
  W({
    id: 'plentyorchard', shellId: 'verdance', name: "Old Plenty's Orchard", depth: 260,
    flavor: 'Rows of trees that fruit on a schedule nobody set.',
    layout: 'An orchard whose harvest-bells ring in an order; ring it back and the bough-gate lowers itself.',
    puzzle: { kind: 'echo', seed: 304, prompt: 'Ring the harvest-bells\' own carillon.' },
    fight: 'plentygrub', unique: { kind: 'gear', id: 'orchardkeepersHood', note: 'The Orchardkeeper\'s Hood, grown to fit.' },
    repeatMats: [{ materialId: 'mawpith', count: 4 }, { materialId: 'wireweed', count: 3 }],
    runeChance: { runeId: 'kel', chance: 0.2 },
  }),
  // ------------------------------ GLASSMERE --------------------------------
  W({
    id: 'mirrormaze', shellId: 'glassmere', name: 'The Unfinished Mirror-Maze', depth: 70,
    flavor: 'Somebody was building a cathedral of reflections. They saw something in one.',
    layout: 'Half-silvered panes on rails. The exit shows only in the pane-order the builder abandoned.',
    puzzle: { kind: 'echo', seed: 401, prompt: 'The panes flash their intended order. Honor the draft.' },
    fight: 'glasswight', unique: { kind: 'rune', id: 'sen', note: 'Sen, etched on the master pane.' },
    repeatMats: [{ materialId: 'glasschitin', count: 4 }, { materialId: 'coldsinew', count: 2 }],
    runeChance: { runeId: 'sen', chance: 0.2 },
  }),
  W({
    id: 'frostgallery', shellId: 'glassmere', name: 'The Frost Gallery', depth: 170,
    flavor: 'Statues of delvers, too accurate.',
    layout: 'A cold hall where plinth-counterweights hold the far door; load them to the curator\'s mark.',
    puzzle: { kind: 'weights', seed: 402, prompt: 'The curator\'s mark is exact. Be exact.' },
    fight: 'rimeshade', unique: { kind: 'rune', id: 'ur', note: 'Ur, frozen mid-stroke.' },
    repeatMats: [{ materialId: 'coldsinew', count: 4 }, { materialId: 'lenswing', count: 2 }],
    runeChance: { runeId: 'ur', chance: 0.2 },
  }),
  W({
    id: 'silentorrery', shellId: 'glassmere', name: 'The Silent Orrery', depth: 260,
    flavor: 'A model of skies nobody down here has seen. It still keeps time.',
    layout: 'Planet-gates that align only when the right spheres glow — the wrong ones drag the whole clock backward.',
    puzzle: { kind: 'gates', seed: 403, prompt: 'Light the spheres the alignment asks.' },
    fight: 'prismreaver', unique: { kind: 'gem', id: 'voidopal', note: 'A Voidopal set as a missing moon.' },
    repeatMats: [{ materialId: 'lenswing', count: 3 }, { materialId: 'prismheart', count: 1 }],
    runeChance: { runeId: 'nix', chance: 0.25 },
  }),
  // ------------------------------ CINDER (Phase 9) -------------------------
  W({
    id: 'coolinggallery', shellId: 'cinder', name: 'The Cooling Gallery', depth: 70,
    flavor: 'Where the first delvers came to breathe. The benches are still warm. Everything is still warm.',
    layout: 'A long vaulted room of stone benches over dead vents. The vent-covers ring in an order when the drafts move; the door listens for it.',
    puzzle: { kind: 'echo', seed: 501, prompt: 'The vents sigh in sequence. Sigh it back.' },
    fight: 'coalhound', unique: { kind: 'rune', id: 'ash', note: 'Ash — the rune, from the shell that IS.' },
    repeatMats: [{ materialId: 'emberplate', count: 4 }, { materialId: 'charsinew', count: 3 }],
    runeChance: { runeId: 'ash', chance: 0.2 },
  }),
  W({
    id: 'bellowsgrave', shellId: 'cinder', name: 'The Bellows Grave', depth: 160,
    flavor: 'Machines that breathed for the mine, buried where they stopped.',
    layout: 'A pit of great collapsed lungs. The counterweight chains still hang; load them to the pressure stamped on the master gauge.',
    puzzle: { kind: 'weights', seed: 502, prompt: 'Load the chains to the master gauge\'s mark.' },
    fight: 'bellowsbeast', unique: { kind: 'gem', id: 'cinderquartz', note: 'A Cinderquartz, grown in a dead lung.' },
    repeatMats: [{ materialId: 'magmaduct', count: 3 }, { materialId: 'charsinew', count: 4 }],
    runeChance: { runeId: 'ur', chance: 0.2 },
  }),
  W({
    id: 'firstfurnace', shellId: 'cinder', name: 'The First Furnace', depth: 250,
    flavor: 'Every kiln above is a grandchild of this room.',
    layout: 'A brick cathedral, cold for the first time in an age. Its nine burner-mouths open only when the right ones are lit — the wrong ones wake the flue.',
    puzzle: { kind: 'gates', seed: 503, prompt: 'Light the mouths the old firing-order asks for.' },
    fight: 'pyreclaw', unique: { kind: 'rune', id: 'ur', note: 'Ur, cut into the keystone brick.' },
    repeatMats: [{ materialId: 'pyregland', count: 2 }, { materialId: 'emberplate', count: 5 }],
    runeChance: { runeId: 'thur', chance: 0.25 },
  }),
  W({
    id: 'salamandersbed', shellId: 'cinder', name: "The Salamander's Bed", depth: 400,
    flavor: 'Something slept here long enough to leave a print in basalt.',
    layout: 'A bowl of glassed stone, still radiant. The heat-bells around the rim ring what the sleeper dreamed; ring the dream, not the echo of your own pulse.',
    puzzle: { kind: 'echo', seed: 504, prompt: 'Ring the dream in its own order. Your pulse will argue. Ignore it.' },
    fight: 'emberking', unique: { kind: 'gear', id: 'stokersGauntlet', note: "The Stoker's Treads — for feet that tend fire without hurrying." },
    repeatMats: [{ materialId: 'pyregland', count: 3 }, { materialId: 'magmaduct', count: 4 }],
    runeChance: { runeId: 'nix', chance: 0.25 },
  }),
  // ------------------------------ HOLLOW (Phase 10) ------------------------
  W({
    id: 'lastlamproom', shellId: 'hollow', name: 'The Last Lamp Room', depth: 100,
    flavor: 'Somebody carried a lamp this far down and then had to choose. The lamp is still here.',
    layout: 'A room implied by lamplight: walls exist exactly as far as the glow reaches. The lamp flickers in an order; the dark answers back.',
    puzzle: { kind: 'echo', seed: 601, prompt: 'The lamp flickers its keeper\'s old signal. Answer it.' },
    fight: 'echoshade', unique: { kind: 'rune', id: 'vey', note: 'Vey — the Veil — cut from actual veil.' },
    repeatMats: [{ materialId: 'quietsinew', count: 4 }, { materialId: 'echograin', count: 2 }],
    runeChance: { runeId: 'vey', chance: 0.2 },
  }),
  W({
    id: 'archiveofsighs', shellId: 'hollow', name: 'The Archive of Sighs', depth: 250,
    flavor: 'Every breath let out in relief, filed somewhere. The drawers do not open. The drawers breathe.',
    layout: 'Shelves of sealed exhalations on a scale older than air. Balance the listed sighs to the archivist\'s mark.',
    puzzle: { kind: 'weights', seed: 602, prompt: 'Weigh out the sighs the ledger asks for. Gently.' },
    fight: 'quietsire', unique: { kind: 'gem', id: 'voidopal', note: 'A Voidopal that looks back politely now.' },
    repeatMats: [{ materialId: 'hollowplate', count: 3 }, { materialId: 'quietsinew', count: 3 }],
    runeChance: { runeId: 'nix', chance: 0.25 },
  }),
  W({
    id: 'unbuiltchapel', shellId: 'hollow', name: 'The Unbuilt Chapel', depth: 400,
    flavor: 'Plans for a holy place, standing up without the place.',
    layout: 'Blueprint-lines of light where walls will be. The votive sockets want the right candles lit and the wrong ones dark — the building notices.',
    puzzle: { kind: 'gates', seed: 603, prompt: 'Light what the unbuilt walls ask. They are very sure.' },
    fight: 'umbrawright', unique: { kind: 'rune', id: 'ur', note: 'Ur — the Deep — from deeper than deep goes.' },
    repeatMats: [{ materialId: 'voidglass', count: 2 }, { materialId: 'echograin', count: 3 }],
    runeChance: { runeId: 'ur', chance: 0.25 },
  }),
  W({
    id: 'sablescamp', shellId: 'hollow', name: "Sable's Last Camp", depth: 540,
    flavor: 'A bedroll, a cold kettle, and forty years of margin notes weighted down with a pick.',
    layout: 'Her camp, kept as she left it by nothing at all. The kettle-chimes ring her waking order; the void kept her schedule out of respect.',
    puzzle: { kind: 'echo', seed: 604, prompt: 'Ring her mornings back to her. You know the order; you have read all of her.' },
    fight: 'thewaiting', unique: { kind: 'gear', id: 'quietshroud', note: 'The Quiet Shroud — her last lantern, hooded. It reveals NOTHING, on purpose.' },
    repeatMats: [{ materialId: 'absencia', count: 1 }, { materialId: 'voidglass', count: 3 }],
    runeChance: { runeId: 'sen', chance: 0.3 },
  }),
  // ------------------------------ ALEPH (Phase 10) -------------------------
  W({
    id: 'proofroom', shellId: 'aleph', name: 'The Proof Room', depth: 10,
    flavor: 'Where the rules were tested before anyone had to live in them.',
    layout: 'A workbench of worlds at one-to-a-thousand scale. The prototype lamps flash their acceptance test; it has never once been re-run.',
    puzzle: { kind: 'echo', seed: 701, prompt: 'Re-run the acceptance test. Pass it, this time, on purpose.' },
    fight: 'stillbirth', unique: { kind: 'rune', id: 'kel', note: 'Kel — the Edge — the FIRST edge, chipped from the prototype.' },
    repeatMats: [{ materialId: 'firstiron', count: 5 }, { materialId: 'protolith', count: 3 }],
    runeChance: { runeId: 'kel', chance: 0.25 },
  }),
  W({
    id: 'inkwell', shellId: 'aleph', name: 'The Inkwell', depth: 20,
    flavor: 'The well the world is written from. It is very nearly dry.',
    layout: 'A stone well of the Author\'s ink, rationed by counterweighted stoppers. Draw exactly the measure the manuscript needs.',
    puzzle: { kind: 'weights', seed: 702, prompt: 'Draw the manuscript\'s exact measure. Not a drop of world more.' },
    fight: 'voidmaw', unique: { kind: 'gem', id: 'axiomite', note: 'An Axiomite, legal at last.' },
    repeatMats: [{ materialId: 'protolith', count: 4 }, { materialId: 'axiomite2', count: 2 }],
    runeChance: { runeId: 'thur', chance: 0.25 },
  }),
  W({
    id: 'errata', shellId: 'aleph', name: 'The Errata', depth: 30,
    flavor: 'The mistakes, kept. Every draft the wardens edited out, filed under glass.',
    layout: 'Gallery gates that open only for the CORRECTED lamps — light the fixed versions, leave the errors dark, and try not to pity them.',
    puzzle: { kind: 'gates', seed: 703, prompt: 'Light the corrections. The errors will ask nicely. Refuse them.' },
    fight: 'lacunae', unique: { kind: 'rune', id: 'mol', note: 'Mol — the Root — of, it turns out, everything.' },
    repeatMats: [{ materialId: 'axiomite2', count: 3 }, { materialId: 'firstiron', count: 4 }],
    runeChance: { runeId: 'mol', chance: 0.25 },
  }),
  W({
    id: 'thedesk', shellId: 'aleph', name: 'The Reading Desk', depth: 38,
    flavor: 'Not the Author\'s desk. The one across from it. For visitors. For you.',
    layout: 'A desk, a chair, and a bell-pull that rings the house-order of a house that is a universe. Ring the order a good guest rings.',
    puzzle: { kind: 'echo', seed: 704, prompt: 'Announce yourself properly. Sable did, every single time.' },
    fight: 'hollowking', unique: { kind: 'gear', id: 'authorsRule', note: "The Author's Rule — a straightedge that has drawn horizons." },
    repeatMats: [{ materialId: 'alephite', count: 2 }, { materialId: 'axiomite2', count: 3 }],
    runeChance: { runeId: 'ash', chance: 0.3 },
  }),
  W({
    id: 'eyeofthemere', shellId: 'glassmere', name: 'The Eye of the Mere', depth: 340,
    flavor: 'The Unblinking\'s reflection lives here, and reflections practice.',
    layout: 'A lens-lined pit that shows you acting a half-second from now. The bells ring what you WILL ring; ring what you should.',
    puzzle: { kind: 'echo', seed: 404, prompt: 'Ignore your reflection\'s order. Ring the bells\' true carillon.' },
    fight: 'glasswarden', unique: { kind: 'gear', id: 'unblinkingMonocle', note: 'A monocle ground from the Eye itself.' },
    repeatMats: [{ materialId: 'prismheart', count: 2 }, { materialId: 'glasschitin', count: 5 }],
    runeChance: { runeId: 'kel', chance: 0.25 },
  }),
];

export const WARREN_BY_ID = new Map(WARRENS.map((w) => [w.id, w]));

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Puzzle instance data (deterministic; the UI presents, the engine checks). */
export function puzzleData(w: WarrenDef): { sequence?: number[]; weights?: number[]; target?: number; gates?: Array<{ on: number[]; off: number[] }> } {
  const rng = mulberry(w.puzzle.seed * 48271 + 11);
  if (w.puzzle.kind === 'echo') {
    const len = 4 + Math.floor(rng() * 3);
    return { sequence: Array.from({ length: len }, () => Math.floor(rng() * 6)) };
  }
  if (w.puzzle.kind === 'weights') {
    const weights = Array.from({ length: 6 }, () => 1 + Math.floor(rng() * 11));
    const pickCount = 2 + Math.floor(rng() * 2);
    const idx = new Set<number>();
    while (idx.size < pickCount) idx.add(Math.floor(rng() * weights.length));
    const target = [...idx].reduce((a, i) => a + weights[i]!, 0);
    return { weights, target };
  }
  // gates: built CONSISTENTLY — a global lit-set exists by construction,
  // each gate demands part of it on and part of its complement off.
  const lit = [0, 1, 2, 3, 4].filter(() => rng() < 0.55);
  if (lit.length === 0) lit.push(Math.floor(rng() * 5));
  const dark = [0, 1, 2, 3, 4].filter((l) => !lit.includes(l));
  const gates = Array.from({ length: 3 }, () => {
    const on = lit.filter(() => rng() < 0.7);
    const off = dark.filter(() => rng() < 0.5);
    return { on: on.length > 0 ? on : [lit[0]!], off };
  });
  return { gates };
}

export function checkAnswer(w: WarrenDef, answer: number[]): boolean {
  const data = puzzleData(w);
  if (w.puzzle.kind === 'echo') return JSON.stringify(answer) === JSON.stringify(data.sequence);
  if (w.puzzle.kind === 'weights') {
    const sum = answer.reduce((a, i) => a + (data.weights![i] ?? 0), 0);
    return sum === data.target;
  }
  // gates: answer is the set of lit lamps; every gate satisfied.
  const lit = new Set(answer);
  return data.gates!.every((g) => g.on.every((l) => lit.has(l)) && g.off.every((l) => !lit.has(l)));
}

export function warrenAvailable(state: GameState, w: WarrenDef): boolean {
  return depthRecord(state, w.shellId) >= w.depth;
}

export function warrenEnter(state: GameState, id: string): ActionResult {
  const w = WARREN_BY_ID.get(id);
  if (!w) return { ok: false, reason: 'No such tunnel' };
  if (!warrenAvailable(state, w)) return { ok: false, reason: `Its mouth opens at ${w.shellId} depth ${w.depth}` };
  if (state.warrens.active) return { ok: false, reason: 'Already off the main shaft' };
  state.warrens.active = { id, stage: 'puzzle', killBase: state.combat.kills[w.fight] ?? 0 };
  return { ok: true };
}

export function warrenAnswer(state: GameState, ctx: EngineCtx, id: string, answer: number[]): ActionResult {
  const a = state.warrens.active;
  if (!a || a.id !== id || a.stage !== 'puzzle') return { ok: false, reason: 'Not at that door' };
  const w = WARREN_BY_ID.get(id)!;
  if (!checkAnswer(w, answer)) return { ok: true, data: { solved: false } };
  a.stage = 'fight';
  // The keeper steps out of the dark — a real fight through the real engine.
  startFight(state, ctx, w.fight);
  return { ok: true, data: { solved: true } };
}

/** Called when a warren-fight is won (combat end hook checks the stage). */
export function warrenClaim(state: GameState, ctx: EngineCtx): ActionResult {
  const a = state.warrens.active;
  if (!a || a.stage !== 'fight') return { ok: false, reason: 'Nothing to claim' };
  const w = WARREN_BY_ID.get(a.id)!;
  if (state.combat.active) return { ok: false, reason: 'The keeper still stands' };
  if ((state.combat.kills[w.fight] ?? 0) <= a.killBase) return { ok: false, reason: 'The keeper still stands' };
  state.warrens.active = null;
  state.warrens.cleared[w.id] = (state.warrens.cleared[w.id] ?? 0) + 1;
  for (const m of w.repeatMats) addMaterial(state, m.materialId, 55 + Math.floor(Math.random() * 20), m.count);
  if (Math.random() < w.runeChance.chance) grantRune(state, ctx, w.runeChance.runeId);
  if (!state.warrens.uniques.includes(w.id)) {
    state.warrens.uniques.push(w.id);
    if (w.unique.kind === 'rune') grantRune(state, ctx, w.unique.id as RuneId, 2);
    if (w.unique.kind === 'gem') state.materials.gems[w.unique.id] = (state.materials.gems[w.unique.id] ?? 0) + 1;
    if (w.unique.kind === 'gear') state.warrens.gearUnlocked.push(w.unique.id);
    ctx.emit({ type: 'warrenUnique', warrenId: w.id, note: w.unique.note });
  }
  ctx.dirty();
  ctx.emit({ type: 'warrenCleared', warrenId: w.id });
  return { ok: true };
}

export function warrenLeave(state: GameState): ActionResult {
  // A detour, not a trap: leave any time, lose nothing but the walk.
  state.warrens.active = null;
  return { ok: true };
}

export function defaultWarrensState(): GameState['warrens'] {
  return { active: null, cleared: {}, uniques: [], gearUnlocked: [] };
}
