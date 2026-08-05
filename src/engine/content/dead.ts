/**
 * THE DEAD (§48.1) — twelve delvers came down before you, and each one stopped.
 *
 * THE WHOLE MECHANIC IS THE ABSENCE. You find Kell's lamp in Loam and Kell's
 * glove in Ferrite and Kell's ledger in Verdance, and then nothing, ever,
 * anywhere. Kell stopped at Verdance. Nothing announces it; the game never says
 * "KELL: DECEASED". You learn it by having walked everywhere else.
 *
 * THE BAR EVERY LINE HAS TO CLEAR, and it is a test rather than a promise
 * (`dead.test.ts` §3): **a ghost must say something the player could not read
 * off their own screen at the moment they found it.** A ghost that hands you a
 * number is a relic with a name, and a ghost that names the station three rows
 * down is a tooltip. So every object carries `knows` — a POINTER INTO THE
 * REGISTRY, not prose — and the test resolves it and then asserts it was not
 * legible from where the object lay:
 *
 *   - a `station` must be in another shell, or more than `LEGIBLE_AHEAD`
 *     stations below the one the object lies at (§1's fog rule is the bar);
 *   - a `shell` must not be the shell the object is in;
 *   - a `delver` must be somebody whose trail you have not finished;
 *   - `nothing` is exempt and CAPPED, because §48.2's best objects do nothing
 *     at all and a layer that is all sentiment is a layer that says nothing.
 *
 * PILLAR 2. Not one object in this file is equipment, a modifier, a currency or
 * a drop. Finding all thirty-six moves `dpsMax` by exactly zero and a test
 * reads it at the same depth either side. What they change is what you KNOW —
 * which is reach, and reach is the only thing pillar 2 permits.
 *
 * WHY NOT SABLE. She is already authored — six marks on every unmineable wall
 * (`shellWalls.ts`), nine sentences at her desk (`shell1/reading.ts`), a lamp
 * you can wear, and a challenge in her name. §48.1 says she "was always a
 * previous you", which makes her a different thing from these twelve: they came
 * down and stopped, she came down and got out by ending the world. Two of the
 * twelve have found her marks and say so; nothing here adds to her.
 *
 * THIRTY-SIX ROWS AND NO SYSTEM. There is no shelf to build, no case to buy, no
 * completion bonus, no set. §48.3 is explicit that the Long Shelf is a RECORD
 * and not a location, so this ships as a record: a list of who was here, what
 * they left, and where they got to.
 */
import type { GameState } from '../types';

/** What an object's line points AT. Resolved and checked in test, never prose. */
export type Knowledge =
  /** A station, named before the lamp could reach it. */
  | { kind: 'station'; shell: string; id: string }
  /** A shell below this one — its physics, its floor, that it is there at all. */
  | { kind: 'shell'; id: string }
  /** A stone, and the fact that it exists to be had. */
  | { kind: 'material'; id: string }
  /** Another of the twelve. The dead knew each other. */
  | { kind: 'delver'; id: string }
  /** It tells you about the person and nothing about the world. §48.2's best
   *  category: "does it do anything? no." Capped at a third of the registry. */
  | { kind: 'nothing' };

export interface DelverObject {
  id: string;
  /** What it is, in the hand. */
  name: string;
  /** Where it lies — a station id in that shell's authored Roll. */
  shell: string;
  station: string;
  /** The provenance line. This IS the content (§48.1). */
  line: string;
  knows: Knowledge;
}

export interface Delver {
  id: string;
  name: string;
  /** Who they were, in one clause. Shown from the first object found. */
  trade: string;
  /** The shell they stopped in. NEVER SHOWN until the trail closes. */
  stopped: string;
  /** The line the trail ends on. Earned by absence, not by a find. */
  epitaph: string;
  objects: DelverObject[];
}

// ---------------------------------------------------------------------------
// The twelve
// ---------------------------------------------------------------------------

export const DEAD: Delver[] = [
  {
    id: 'kell',
    name: 'KELL',
    trade: 'went down with three others and came back alone twice',
    stopped: 'verdance',
    epitaph:
      'Nothing of Kell below the Fallow. Three came up out of Loam behind them and one out of Ferrite, and past Verdance there is not a bootprint, not a mark, not a tin. Kell stopped here.',
    objects: [
      {
        id: 'kelllamp',
        name: "Kell's lamp",
        shell: 'loam',
        station: 'umberdeep',
        line: 'Burnt to the collar and then burnt past it. Scratched inside the housing, where you would only look if you were mending it: "IT PULLS AT FERRITE. HOLD THE PICK OR LOSE IT."',
        knows: { kind: 'shell', id: 'ferrite' },
      },
      {
        id: 'kellglove',
        name: "Kell's left glove",
        shell: 'ferrite',
        station: 'coilwrights',
        line: 'One glove. The palm is worn through in a band, not a patch — something was drawn across it over and over in the same line. Kell learned the chain here and wrote the number on the cuff. It is not a large number.',
        knows: { kind: 'station', shell: 'ferrite', id: 'reversal' },
      },
      {
        id: 'kellledger',
        name: "Kell's ledger",
        shell: 'verdance',
        station: 'thefallow',
        line: 'Nine pages of hauls and then four pages of nothing but the same note: LEFT THE NORTH CORNER ALONE AGAIN. WEEK FOUR. IT IS STILL GOING. Kell never wrote what it was going to become.',
        knows: { kind: 'material', id: 'heartwood' },
      },
    ],
  },
  {
    id: 'tallow',
    name: 'TALLOW',
    trade: 'sold light to people going deeper than they sold it to',
    stopped: 'loam',
    epitaph:
      'Tallow got to seventy-two and no further, and the last thing Tallow did was put the box down and walk toward the Ashfall. Everything of theirs is in the first eighty depths of the first shell. There has never been a delver who stopped so close to the top.',
    objects: [
      {
        id: 'tallowbox',
        name: "Tallow's tinderbox",
        shell: 'loam',
        station: 'kilnyard',
        line: 'Full, dry, and set down neatly on a ledge as if it were coming straight back. On the lid, in a hand that had time: "THERE IS A THING AT SEVENTY-TWO. IT IS NOT A WALL AND IT IS NOT A SEAM. YOU DO NOT HAVE TO GO IN. I AM GOING IN."',
        knows: { kind: 'station', shell: 'loam', id: 'ashfall' },
      },
      {
        id: 'tallowbill',
        name: "Tallow's bill of sale",
        shell: 'loam',
        station: 'lampline',
        line: 'Eleven names owing. Four are crossed out with the word DOWN. One is crossed out with the word UP, underlined twice, as though it were the stranger outcome.',
        knows: { kind: 'delver', id: 'esk' },
      },
      {
        id: 'tallowwick',
        name: 'A wick, unlit',
        shell: 'loam',
        station: 'lowbench',
        line: 'Cut to length, never trimmed, never touched to a flame. Tallow sold light for a living and died carrying one they had not used.',
        knows: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'orrin',
    name: 'ORRIN',
    trade: 'built the second of everything, the first having failed',
    stopped: 'ferrite',
    epitaph:
      'Orrin is in Loam and Orrin is in Ferrite and Orrin is nowhere under two hundred and ten. The Breaker\'s Yard is the last of them. Orrin built the thing that takes machines apart and then did not come back up from it.',
    objects: [
      {
        id: 'orrinplate',
        name: "Orrin's name plate",
        shell: 'loam',
        station: 'longcut',
        line: 'Riveted to a drum that is not here any more. ORRIN — SECOND PATTERN. There is no first pattern anywhere in this shell, which means the first one is what the drum was replaced for.',
        knows: { kind: 'station', shell: 'loam', id: 'shoringdeep' },
      },
      {
        id: 'orrincount',
        name: "Orrin's count",
        shell: 'ferrite',
        station: 'alloyersend',
        line: 'A tally cut into a beam, in fours, and then a fifth stroke through each four — and then, past two hundred, the strokes stop being counted and start being placed: one for every station, in order, down to a name Orrin could not have stood in.',
        knows: { kind: 'station', shell: 'ferrite', id: 'theseize' },
      },
      {
        id: 'orrinbar',
        name: 'A bar bent the wrong way',
        shell: 'ferrite',
        station: 'breakersyard',
        line: 'Bent against its own polarity, which takes either a very great deal of force or a shell that has stopped agreeing with itself. Orrin kept it. Orrin thought it was worth keeping.',
        knows: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'wyn',
    name: 'WYN DAWES',
    trade: 'measured things for other people and did not trust the answers',
    stopped: 'glassmere',
    epitaph:
      'Wyn Dawes measured all the way to the Balance House and then measured nothing else. There are no instruments of hers below a hundred and thirty in any shell, and she carried four.',
    objects: [
      {
        id: 'wynrule',
        name: "Wyn's folding rule",
        shell: 'loam',
        station: 'sag',
        line: 'Brass, sprung, and wrong — every mark on it is short by a hair, consistently, deliberately. She measured everything twice: once with this and once properly, and kept the difference. The difference is written on the back and it is not a length. It is a temperature.',
        knows: { kind: 'shell', id: 'cinder' },
      },
      {
        id: 'wyncase',
        name: "Wyn's sample case",
        shell: 'ferrite',
        station: 'thedraw',
        line: 'Nine slots, seven full, and the two empty ones are labelled in pencil for stones that are not in this shell and not in the one below it. She had seen them. She had not been able to carry them out.',
        knows: { kind: 'shell', id: 'glassmere' },
      },
      {
        id: 'wynglass',
        name: "Wyn's split glass",
        shell: 'glassmere',
        station: 'lenswork',
        line: 'One lens, cracked clean down the middle, and the two halves throw different colours at the same light. She wrote underneath: "IT IS NOT BROKEN. IT WAS ALWAYS TWO. EVERYTHING HERE IS ALWAYS TWO, FURTHER DOWN."',
        knows: { kind: 'station', shell: 'glassmere', id: 'thesplit' },
      },
      {
        id: 'wynbalance',
        name: "Wyn's last reading",
        shell: 'glassmere',
        station: 'balancehouse',
        line: 'A single figure, circled, with no units and no note. It is not a depth, a weight, a purity or a count. Nobody has worked out what she was measuring at the Balance House and she did not write it down anywhere else.',
        knows: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'esk',
    name: 'ESK',
    trade: 'owed Tallow for light and never paid',
    stopped: 'verdance',
    epitaph:
      'Esk went past Tallow, past the Ashfall, into the shell that pulls and the shell that grows, and stopped in the Quiet Quarter. Every one of Esk\'s things is above a hundred and fifty. Esk was not a great delver. Esk was simply the one who kept going after the person who sold them the lamp did not.',
    objects: [
      {
        id: 'eskchit',
        name: "Esk's unpaid chit",
        shell: 'loam',
        station: 'marlgate',
        line: 'A debt for four lamps and a spare glass, unsettled, in a hand that is not Esk\'s. On the back, in a hand that is: "PAY WHEN I AM BACK." Tallow is eight depths above this and has been for a long time.',
        knows: { kind: 'delver', id: 'tallow' },
      },
      {
        id: 'eskcharm',
        name: "Esk's ward",
        shell: 'ferrite',
        station: 'sieversrest',
        line: 'A twist of wire hung on a nail, and it is not magnetic — the only thing at Siever\'s Rest that is not. Esk hung it pointing down and it has not moved since. What it points at is a wreck, and the thing wrecked in it is the thing that used to hold this shell steady.',
        knows: { kind: 'station', shell: 'ferrite', id: 'governorswreck' },
      },
      {
        id: 'eskboot',
        name: "Esk's boot",
        shell: 'verdance',
        station: 'quietquarter',
        line: 'Rooted through. Something grew up through the sole while it was standing still, which means it stood still for a long time, which means Esk stopped here before Esk stopped.',
        knows: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'hollis',
    name: 'HOLLIS',
    trade: 'kept the ledgers nobody asked for',
    stopped: 'ferrite',
    epitaph:
      'Hollis recorded every delver who went past and stopped recording at the Sympathy. The last entry in the last book is Hollis, in Hollis\'s hand, undated.',
    objects: [
      {
        id: 'hollisbook',
        name: "Hollis's first book",
        shell: 'loam',
        station: 'quillrest',
        line: 'Names, dates, depths, and a column headed RETURNED which is mostly blank. The entries stop at a rule ruled across the page and the words: "THE ROOM AT THE BOTTOM IS NOT THE BOTTOM. THERE IS ANOTHER SHELL UNDER THE FLOOR AND IT IS NOT MADE OF SOIL."',
        knows: { kind: 'shell', id: 'ferrite' },
      },
      {
        id: 'hollispen',
        name: "Hollis's pen",
        shell: 'ferrite',
        station: 'ironvespers',
        line: 'The nib is pulled off true, curved the way everything in this shell is curved, and Hollis went on writing with it. The later hand slants. All of it slants the same way.',
        knows: { kind: 'nothing' },
      },
      {
        id: 'hollislast',
        name: "Hollis's last book",
        shell: 'ferrite',
        station: 'sympathy',
        line: 'Twelve names in the front, ruled, with a shell written beside each. Eleven have one. The twelfth has three, then a question mark, then the word ALEPH in different ink and a much later hand.',
        knows: { kind: 'delver', id: 'fane' },
      },
    ],
  },
  {
    id: 'garn',
    name: 'GARN',
    trade: 'fired kilns for forty years and never once let one go out',
    stopped: 'cinder',
    epitaph:
      'Garn went to the shell that is on fire and was, for a while, the best of anyone there. There is nothing of Garn past the Slake. The Purge and the floor beyond it were walked by somebody, but not by Garn.',
    objects: [
      {
        id: 'garnrake',
        name: "Garn's rake",
        shell: 'loam',
        station: 'kilnyard',
        line: 'Worn to a stub on one side only, from forty years of pulling the same way. Cut into the shaft, worn nearly smooth: "IT WILL TAKE MORE THAN YOU THINK AND GIVE IT BACK ALL AT ONCE."',
        knows: { kind: 'shell', id: 'cinder' },
      },
      {
        id: 'garnglass',
        name: "Garn's gauge glass",
        shell: 'cinder',
        station: 'boilerworks',
        line: 'The glass is scored at a hundred with a file, hard, by hand — the maker did not mark it there. Garn marked it there. Garn thought the number at the top of the gauge was worth knowing exactly, and not approximately.',
        knows: { kind: 'station', shell: 'cinder', id: 'thesluice' },
      },
      {
        id: 'garnapron',
        name: "Garn's apron",
        shell: 'cinder',
        station: 'theslake',
        line: 'Leather, gone hard as plate, and every burn on it is on the front. Garn never turned away from anything in forty years and it is not obvious that this was wisdom.',
        knows: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'peel',
    name: 'PEEL',
    trade: 'came down once, on a dare, and stayed',
    stopped: 'loam',
    epitaph:
      'Peel is at nine, at seventeen and at thirty-three, and Peel is nowhere else in seven shells. Peel came down for an afternoon and never went back up and never went further, and of the twelve, Peel is the only one who seems to have been content.',
    objects: [
      {
        id: 'peelcoat',
        name: "Peel's good coat",
        shell: 'loam',
        station: 'kilnyard',
        line: 'Town cloth, town buttons, entirely wrong for this. Folded. Whoever folded it meant to put it back on.',
        knows: { kind: 'nothing' },
      },
      {
        id: 'peelmark',
        name: "Peel's mark",
        shell: 'loam',
        station: 'sag',
        line: 'A hand traced on the rock in soot, which is the oldest thing anybody does anywhere. Beside it, later and shakier, a second hand, and a third — and the third is small.',
        knows: { kind: 'nothing' },
      },
      {
        id: 'peelbench',
        name: "Peel's bench",
        shell: 'loam',
        station: 'lampline',
        line: 'Cut into the ledge itself, wide enough for two, and the stone is polished where people sat. On the underside, out of sight of anyone sitting on it: "SHE WROTE ON THE THING THAT WOULD NOT BREAK. GO AND READ IT. IT IS WORTH THE WALK."',
        knows: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'assayer',
    name: 'THE ASSAYER',
    trade: 'never signed anything, so nobody knows the name',
    stopped: 'glassmere',
    epitaph:
      'Four instruments, no name, no journal, no mark on any wall. She stopped at Frostwork and left less of herself than anyone, which given the trade may have been the intention.',
    objects: [
      {
        id: 'assayloupe',
        name: 'A loupe, unsigned',
        shell: 'loam',
        station: 'undersill',
        line: 'Ground far finer than anything made in this shell. Hold it to the wall of the Undersill and the hardness reads off the rock itself, a band past where your own eye gives up. Whoever owned this could see one step further than the tools allowed, and did not tell anybody how.',
        knows: { kind: 'station', shell: 'loam', id: 'knot' },
      },
      {
        id: 'assayvial',
        name: 'A vial of something clear',
        shell: 'verdance',
        station: 'stillwrights',
        line: 'Still liquid, still clear, in a shell where everything ferments. The stopper is glass and the seal is wax and the label says only a temperature and a colour, neither of which is available in Verdance.',
        knows: { kind: 'shell', id: 'glassmere' },
      },
      {
        id: 'assayplate',
        name: 'A test plate',
        shell: 'glassmere',
        station: 'frostwork',
        line: 'Nine bands struck across it, six of which are the six. The seventh, eighth and ninth are struck just as carefully and there is no light in this shell that makes them.',
        knows: { kind: 'station', shell: 'glassmere', id: 'whiteroom' },
      },
    ],
  },
  {
    id: 'brait',
    name: 'BRAIT',
    trade: 'talked, constantly, to anyone and then to nobody',
    stopped: 'hollow',
    epitaph:
      'Brait went into the shell where there is nothing to talk to. Everything of Brait\'s is written on, right up to the Long Absence, and then there is one thing at Hushfall with nothing written on it at all.',
    objects: [
      {
        id: 'braittin',
        name: "Brait's tin",
        shell: 'ferrite',
        station: 'longspin',
        line: 'Covered in writing, inside and out, most of it arguments with somebody who is not there. On the base, boxed off from the rest: "IF YOU GET TO THE QUIET ONE DO NOT FILL IT. THAT IS WHAT IT IS FOR."',
        knows: { kind: 'shell', id: 'hollow' },
      },
      {
        id: 'braitpipe',
        name: "Brait's pipe",
        shell: 'verdance',
        station: 'mothgarden',
        line: 'Unsmoked, stuffed with something that grew in the bowl. Scratched round the stem: "THE CORNER YOU FORGET IS THE ONE THAT PAYS. I FORGOT ONE FOR A MONTH AND IT MADE ME A TREE. THERE IS A WHOLE STAND OF THEM FURTHER DOWN AND NOBODY FORGOT ANYTHING TO GET IT."',
        knows: { kind: 'station', shell: 'verdance', id: 'heartwoodstand' },
      },
      {
        id: 'braitslate',
        name: "Brait's slate",
        shell: 'hollow',
        station: 'hushfall',
        line: 'Wiped clean. There is chalk dust in the frame and a rag beside it and not one mark on the face of it. Everything else Brait owned is covered edge to edge.',
        knows: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'mercy',
    name: 'MERCY',
    trade: 'brought people back up, mostly',
    stopped: 'cinder',
    epitaph:
      'Mercy went down after other people for thirty years and the record of it is a rope, a splint and a list. The list has a line at the bottom with no name on it and Mercy is the only one it can be.',
    objects: [
      {
        id: 'mercyrope',
        name: "Mercy's rope",
        shell: 'loam',
        station: 'shoringdeep',
        line: 'Spliced eleven times, each splice a different age. Knotted at intervals that are not regular — they are the depths of the eleven places somebody had to be pulled out of, in order, so the rope is a map of other people\'s worst days. The last knot is past a hundred and fifty. Nothing is past a hundred and fifty. Mercy went and got somebody out of there anyway.',
        knows: { kind: 'shell', id: 'ferrite' },
      },
      {
        id: 'mercysplint',
        name: "Mercy's splint",
        shell: 'glassmere',
        station: 'quietgallery',
        line: 'Cut and bound for an arm, never used, still tied in a bow. Written along it, in the neat hand of somebody with time to wait: "THE FIRE SHELL DOES NOT BREAK BONES. IT DOES SOMETHING ELSE AND YOU CANNOT SPLINT IT."',
        knows: { kind: 'shell', id: 'cinder' },
      },
      {
        id: 'mercylist',
        name: "Mercy's list",
        shell: 'cinder',
        station: 'ventrow',
        line: 'Thirty years of names in two columns. The right column is longer, which is the only good news anywhere in this file. The last line is in the left column and it has no name against it.',
        knows: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'fane',
    name: 'FANE',
    trade: 'nobody knows, and Hollis had three shells against the name before giving up',
    stopped: 'aleph',
    epitaph:
      'Fane is at the Author\'s Cut, which is sixteen depths into the last shell there is. Whatever happened to the other eleven did not happen to Fane, and there is no thirteenth name anywhere to say what did.',
    objects: [
      {
        id: 'fanechalk',
        name: "Fane's chalk",
        shell: 'verdance',
        station: 'grafthouse',
        line: 'Worn to a nub, and the marks it left on the Grafthouse post are not directions or tallies. They are a sentence, in a grammar that is not writing, and one of the marks is a mark you have seen scratched on a wall that would not break.',
        knows: { kind: 'shell', id: 'aleph' },
      },
      {
        id: 'fanenothing',
        name: 'A jar, sealed, empty',
        shell: 'hollow',
        station: 'theunbuilt',
        line: 'Sealed from the inside, which is not a thing that can be done, and empty, which in this shell is not the same as containing nothing. Fane carried it a long way and never opened it.',
        knows: { kind: 'station', shell: 'hollow', id: 'longnothing' },
      },
      {
        id: 'fanecut',
        name: "Fane's cut",
        shell: 'aleph',
        station: 'authorscut',
        line: 'Not an object. A cut, in the rock, in the shape of a name that is being written and has not been finished, and the unfinished half is where you are standing.',
        knows: { kind: 'nothing' },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export const ALL_OBJECTS: DelverObject[] = DEAD.flatMap((d) => d.objects);

export const DELVER_OF: Record<string, Delver> = Object.fromEntries(
  DEAD.flatMap((d) => d.objects.map((o) => [o.id, d] as const)),
);

export function delverDef(id: string): Delver | undefined {
  return DEAD.find((d) => d.id === id);
}

export function objectDef(id: string): DelverObject | undefined {
  return ALL_OBJECTS.find((o) => o.id === id);
}

/** Everything lying in one shell's Roll, shallowest first. Depth comes from the
 *  STATION, never from a field here — one geography, one source. */
export function objectsIn(shell: string): DelverObject[] {
  return ALL_OBJECTS.filter((o) => o.shell === shell);
}

/** Nothing in this file is allowed to look at state; it is a name table. This
 *  exists so the signature matches the other content registries. */
export function registerDead(_state?: GameState): void {
  /* no side effects — the registry is the constant above */
}
