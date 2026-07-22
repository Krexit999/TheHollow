/**
 * SABLE'S JOURNALS — the story, delivered the only way this game delivers
 * anything: while mining, never as a cutscene, never as a modal. A page
 * surfaces like a drop; a toast offers it; it files itself into the Journal
 * whether or not the player reads it now.
 *
 * Pages carry HER numbering, so the gaps show — you are reading a ruin.
 * Loam's pages are mostly legible. Ferrite's are stained and, deeper,
 * written in Quill's survey cipher: Old Quill translates for a fee, which
 * is what makes the archivist a gate and not a kiosk.
 *
 * Later shells only add entries to FRAGMENTS — the mechanism is done here.
 */
import { D } from '../decimal';
import type { EngineCtx, GameState, ActionResult } from '../types';
import { getCurrency, spendCurrency } from '../resources';
import { currentShell } from '../shells';
import { repTier } from './npcs';

export type Legibility = 'clear' | 'stained' | 'ciphered';

export interface FragmentDef {
  id: string;
  /** Sable's own page number — display these, gaps included. */
  page: number;
  shellId: string;
  /** Depth band where the page can surface. Bands overlap; nothing is missable. */
  band: [number, number];
  legibility: Legibility;
  /** Where she was, in her own words — the archive listing. */
  heading: string;
  text: string;
}

const F = (
  page: number,
  shellId: string,
  band: [number, number],
  legibility: Legibility,
  heading: string,
  text: string,
): FragmentDef => ({ id: `p${String(page).padStart(2, '0')}`, page, shellId, band, legibility, heading, text });

export const FRAGMENTS: FragmentDef[] = [
  // ============================ LOAM (13) ==================================
  F(2, 'loam', [5, 30], 'clear', 'below the stair',
    'Day one under the Lamphouse stair. Twelve of us: Neev on charts, Halden on the drills, the rest strong backs and stronger opinions. Marrow forged my pick and made me swear not to tell anyone he\'d worked "sentimental metal." Vess sold us lanterns at a price I\'ll forgive when I\'m rich. Dovekin gets a scrip a lamp to keep the stairhead lit until I\'m back. Cheap, for a lighthouse.'),
  F(3, 'loam', [5, 35], 'clear', 'the rock that would not stay cut',
    'The face regrows. I cut a shelf at dusk and by lamp-change the loam had crept back like dough proving. Halden says groundwater. Halden says a lot of things. I measured: it refills FASTER when we work it, as if the rock likes the attention. I am not writing that in the survey. I am writing it here, where only sensible people will find it.'),
  F(5, 'loam', [10, 45], 'clear', 'what full cells do',
    'When a cell brims and we don\'t harvest, it weeps. A thin leak of good dust, steady as a kettle on low. The crew calls it seepage and scoops it up like windfall. I sat with a full cell for an hour and listened. It sounds — and I want this on record as the moment I stopped being a surveyor — it sounds like breathing out.'),
  F(6, 'loam', [15, 50], 'clear', 'the tide pools',
    'Found chalkmite chitin arranged on a ledge this morning. Arranged. Not scattered — set out, the way you\'d leave bread for birds. Neev says I\'m seeing patterns in refuse. Neev charted forty leagues of coast before she came underground; she should know a tide pool when she\'s standing in one. Something stocks these shelves. We are not the first thing down here that harvests.'),
  F(8, 'loam', [25, 65], 'clear', 'collapse arithmetic',
    'Dropped the shaft today — on purpose, before it dropped itself. The crew hates it; I love it. Everything we built settles into the fall and the deep hands us back cores like a receipt. You lose the ladder, you keep the climb. If the Guild taught me anything it\'s that a thing you can do again isn\'t a loss. Neev says I\'d collapse the Lamphouse if it paid. I would not. Probably.'),
  F(9, 'loam', [30, 75], 'clear', 'the polite worms',
    'A marlgrub spat at Halden and missed. It always misses the first spit — I\'ve watched enough of them now. First spit short, second spit true. That\'s not hunting, that\'s WARNING. These things graze charge like goats graze slope-grass, and they warn before they bite. Wild animals don\'t warn. Livestock warn, because someone taught them the rules. Whose livestock?'),
  F(11, 'loam', [40, 90], 'clear', 'management',
    'Halden wants to go home. He\'s right to want it — his daughter walks this spring. I gave him double scrip and his pick\'s weight in marl and sent him up with the maps we don\'t need. A crew isn\'t rope; you don\'t keep it by holding tighter. Eleven now. The stew is worse without him. Hob would weep at what we do to good roots down here.'),
  F(12, 'loam', [50, 100], 'stained', 'the board hums',
    'Brought three motifs down against regulation and set them on a flat stone at depth 60. The triangle sang. Not metaphor — a note, low, under the ear, the way Moth always claimed and none of us believed her. The deeper I set the board, the clearer the chord. The Lattice isn\'t a game the Guild plays. It\'s a [stained — three lines lost] ...tuning fork, and the rock is the string.'),
  F(14, 'loam', [60, 115], 'clear', 'on clean ore',
    'Marrow refuses impure ore and the crew calls it pride. It isn\'t pride. I watched him bend a flawless loamiron bar today — the metal MOVED like it wanted the shape. The impure stuff fights you because it\'s still arguing about what it is. Purity isn\'t a grade. It\'s agreement. The deep rock agrees with itself more the further down you go, and I no longer think that\'s geology.'),
  F(15, 'loam', [75, 125], 'stained', 'graded on a curve',
    'The hardness walls come in steps. 45, 110 — clean thresholds, sharp as a stair. Strata don\'t do that. Strata blur. These are GRADED, like a syllabus, like the rock is checking whether you\'ve done the reading before it lets you [stained] ...I tested six bore-points across two leagues. Same thresholds, to the yard. Somebody BUILT this curriculum, and I am either its student or its exam.'),
  F(17, 'loam', [90, 140], 'clear', 'the gardener',
    'I saw her. The thing the crew calls the Tapmother — a coil of root and patience the size of a kiln. She was PRUNING. The tunnels we cut yesterday were tended this morning: braced, cleared, the marlwidow nests moved like potted plants. She is not a monster guarding treasure. She is maintenance, and we are something that got into the garden. Note for whoever follows: she punishes greed and forgives patience. Behave like weather, not like an axe.'),
  F(18, 'loam', [110, 150], 'stained', 'what I sent up',
    'Sent the survey up with Pell\'s cousin: depths, yields, hazards, all true, none of it honest. The Guild will read "rich seam, manageable fauna" and stamp it. What I kept: the regrowth curve, the graded walls, the gardener. [stained — a paragraph gone] ...because the Guild funds mines, not questions. Fair enough. I\'ll fund the questions myself. Quill — you\'ll know this hand. Keep my tab open.'),
  F(21, 'loam', [130, 150], 'clear', 'the floor, and the door',
    'The floor of Loam sounds hollow because it is. Ten of us stood on it and felt the draft through stone. Here is what I did, exactly, so someone can do it again: I went to her alone, without my pick, and I waited. An hour. Two. She watched the whole time — she has no eyes and she watched. Then she moved aside, the way you hold a door for someone whose hands are full. A warden is a door that asks a question. The question is: what will you do to get through me? The answer she accepts is: nothing.'),

  // =========================== FERRITE (15) ================================
  F(22, 'ferrite', [5, 45], 'clear', 'the other side of the fall',
    'We fell for longer than the rope we\'d brought. The air down here tastes of struck flint and every compass we own is lying — but listen: they all lie in AGREEMENT. Nine needles, one direction, and it isn\'t north. A broken instrument scatters. A loyal one points. Everything in this shell is loyal to something below it, and I have started, quietly, to envy the compasses their certainty.'),
  F(23, 'ferrite', [10, 55], 'clear', 'the argument',
    'Neev wants to go back up while the Breach behind us still shows lamplight. Her case is good. We have no resupply, half a crew, and a shell that hums at night like a struck rail. My case is a page number. I told her: the rock down here is graded like the rock up there, and somebody grades it, and I will meet the teacher. She said: you\'ll meet the landlord. We laughed. Neither of us meant it as a joke.'),
  F(25, 'ferrite', [20, 70], 'stained', 'punctuation',
    'The charge in the rock carries a sign — north-written, south-written, cell by cell. Chain like-signed strikes and the yield compounds; break the sign and it resets. That\'s not ore behavior. That\'s SYNTAX. The shell rewards you for reading it in order, like a sentence, [stained] ...and if the rock is written, then the question every delver should be asking is not "what is it worth" but "what does it say," and I appear to be the only one asking.'),
  F(26, 'ferrite', [30, 85], 'clear', 'what I wrote and what I did',
    'I sent the second survey up this morning, Guild-sealed, in my own hand: "Passage collapsed below depth 40. No through-route. Site exhausted." Every word false. Neev watched me seal it and said nothing, which is how she shouts. She took it up. Six went with her. So: I lied to the Guild to keep this shell out of the ledgers, and I told myself it was to protect the thing below — or to protect my claim to it. I have written this entry four times and I still can\'t make it come out clean. Let it stand dirty. One of us who left and one of us who stayed is a coward, and I genuinely cannot tell which.'),
  F(28, 'ferrite', [40, 95], 'stained', 'inventory',
    'Alone now, which has the advantage of shorter arguments. Remaining: one pick (Marrow\'s, still true), one lantern (Vess\'s, still overpriced), forty days of hard biscuit, the board and nine motifs, and the ratio. Two iron, one each of the rest — poured over anything honest, it holds. Brine will find that ratio someday and call it something grand. [stained] ...call it Sable\'s Steel if you like, Brine. I heard you the first time.'),
  F(29, 'ferrite', [60, 115], 'stained', 'the cipher',
    'From this page on I write the true things in Quill\'s survey cipher. Not to hide them from you, reader — to hide them from the CASUAL you, the one who\'d skim, sell, and misquote. Effort is the only honest lock. Quill: if these pages reach the Lamphouse, translate them for whoever carried them, charge your fee, and put it on my tab. You taught me the hand; you might as well profit from it. [The remainder of this page is ciphered.]'),
  F(31, 'ferrite', [80, 130], 'ciphered', 'what eats the field',
    'The grub-things with lodestone hearts don\'t eat ore. They eat ALIGNMENT — they graze the field\'s order the way loam-things graze charge. Which means the magnetic field down here is a CROP. Something plants it, something tends it, something harvests. I have stopped asking "what lives in this shell" and started asking "what is this shell FOR." The livestock have an owner. The curriculum has a school board.'),
  F(32, 'ferrite', [90, 145], 'ciphered', 'the count',
    'The rails hum on a beat. I\'ve started counting strikes against it — swing on the count and the iron parts like bread; swing off it and the shock climbs your arm and stays. Sleep is difficult. The hum doesn\'t stop and I can\'t stop counting it. One-and-two-and. I write to hear a voice that isn\'t rhythm. If my hand wanders on this page it\'s because I\'m keeping the count with my foot, and the foot is winning.'),
  F(33, 'ferrite', [100, 160], 'stained', 'the follower',
    'A marlhopper came down the warm shaft after me — a Loam thing, six legs and no patience, absurd down here among the iron. Its foreleg was cracked. I splinted it with wormsilk and shared the biscuit, which at current supply arithmetic was somewhere between kindness and suicide. It stayed three days and left ahead of a railtide I hadn\'t heard coming. The shallows\' creatures follow the warm shafts down. So do regrets. Feed both; they pay you back in warnings.'),
  F(35, 'ferrite', [120, 175], 'ciphered', 'the vote',
    'I can hear it now on still watches — not the rails, the thing under the rails. Every compass in the world is a vote, and the thing below is the count. It doesn\'t pull the needles. It CONVENES them. Nine poles, Quill. The old survey glyph for "nine poles" that we all assumed was a scrivener\'s error in the founding charts. It wasn\'t an error. It was a warning written by someone who ran out of politer glyphs.'),
  F(36, 'ferrite', [140, 195], 'ciphered', 'the casting',
    'Say it plainly, in cipher, which is the only way I say plain things now: Loam is topsoil over a casting. Ferrite is the mold\'s iron jacket. The walls are graded because a mold must cure in stages. The wardens tend the stages. The seepage is the mold BREATHING as the thing inside it sets. We are not miners, reader. We are something walking around inside a work in progress, prying up the formwork and selling it, and the work does not seem to mind, and that is the part I cannot get past. It should mind.'),
  F(38, 'ferrite', [160, 215], 'ciphered', 'to whoever they sent',
    'If you\'re reading this, the Guild sold you the same lie they sold me — rich seams, manageable fauna, glory at a fair markup — and you bought it, because we always buy it, because the buying is the point of us. Good. Keep coming. I mean that without irony: KEEP COMING. Bring the pick Marrow will deny having made. Pay Dovekin for the lamps. And when you reach the thing with nine poles, do not fight it on its beat. Nothing down here fights fair, but everything down here fights HONEST, and there is a difference, and your life will hang on it.'),
  F(39, 'ferrite', [180, 240], 'stained', 'a bad watch',
    'Woke to the hum GONE and that was worse. Silence down here is attention. Something was reading my camp the way I read a face before I chip it, [stained] ...found the marks in the morning: nine points, arranged, around where I\'d slept. Arranged. Like the chitin on the ledge, all those pages ago. It set the table. I don\'t know yet if I\'m the guest [stained — the rest of the line is scratched out with force enough to tear the page]'),
  F(41, 'ferrite', [200, 250], 'ciphered', 'the valve',
    'I reached the Loadstar. Warden of nine poles, and every needle in creation aimed at it like an audience. I did not fell it. Understand this, whoever comes: I TUNED it. Its pole walks on a beat, and I walked with it, all the way around, like a key finding a ward, and at the last step the floor opened without a blow struck. It is not a wall. It is a VALVE, and something on the other side of it is breathing through it, slowly, on a count I recognized. I recognized it because I have been hearing it since Loam. The seepage. The regrowth. The hum. It is all one breath.'),
  F(44, 'ferrite', [230, 250], 'ciphered', 'marginalia',
    'Last page of this book; the next begins in the green dark below and I will bury it deeper than doubt. Write the conclusion first, in case the deep eats the argument: the shells are not layers of a world. They are layers of a THING, and the thing is not finished, and the walls we mine are its scaffolding, and the wardens are its wrights, and the Core — whatever the founding charts say — the Core is not the bottom of the world. The Core is the author of it. And we, reader, all of us with our picks and our surveys and our beautiful greedy lamps, we are marginal—'),

  // ==================== THE LATER BOOKS (Phase 10 — the ending) ============
  F(45, 'verdance', [30, 120], 'clear', 'the green dark',
    'New book, worse paper — the Rendery presses pages now, at a price Vess would blush at. The green shell FARMS. Not like we farm; like weather farms. Leave a cell and it banks the leaving. Work a cell and it forgives the work. I planted my old pick-haft as an experiment and it flowered, which is either botany or an opinion. The thing below is not building a mine. It is building a LARDER, and I no longer believe we are the ones it is stocking for.'),
  F(47, 'verdance', [150, 290], 'stained', 'what old plenty offered',
    'The green warden holds out fruit while it fights you. I took none and it opened the floor. Neev — the last of my twelve — went home at the stair-mouth. She said: you are not surveying anymore, Sable, you are CORRESPONDING. She is right. Every shell answers the one above it. Rock, then iron, then appetite. [stained] ...the letters get longer the deeper you read. Somebody is writing back.'),
  F(49, 'glassmere', [30, 160], 'clear', 'the shell that looks',
    'Cold, still, clear. The creatures here wind up their blows where eyes can\'t follow — the shell teaches SIGHT the way Loam taught patience and Ferrite taught loyalty. A curriculum, graded, like the walls always were. I ground a lens from a dead thing\'s wing and now I can watch the light DECIDE. Refraction is not physics down here. It is the thing below, reading by its own lamp. I have started leaving my pages loose. I think it collects them.'),
  F(50, 'glassmere', [200, 380], 'stained', 'the unblinking',
    'The warden of the frozen light has no eyes and has never needed to guess. I stood before it four days. It was not testing my strength — none of them ever were, I see that now, forty years of delving and I finally see it: the wardens test what you DO WHEN NOTHING FORCES YOU. Patience. Loyalty. Restraint that has not been asked for. [stained] ...it blinked. I want that recorded, whatever else is lost: for me, it blinked.'),
  F(52, 'cinder', [40, 200], 'clear', 'the writing heat',
    'Everything here has burned once and remembers it. The vents are a handwriting — I mean this literally now, I am past embarrassment: the pressure gallery is PUNCTUATED. Vent, vent, seam, vent: commas and a colon. The thing below drafts in fire before it writes in stone. This shell is its rough copy. I have stopped mining, mostly. I read.'),
  F(53, 'cinder', [300, 470], 'stained', 'restraint, examined',
    'Her fire is exactly as hot as your greed — the Smolder, the crew would have called her, if I still had a crew. I went to her cold, empty-handed, vents open, the old way, the Tapmother\'s way. She let me pass so easily I wept. Six shells to learn one sentence: NOTHING IS TAKEN FROM YOU DOWN HERE THAT YOU DID NOT CARRY IN. [stained — the rest of the page is scorched, deliberately, in a neat line]'),
  F(55, 'hollow', [20, 300], 'ciphered', 'the unfinished chapter',
    'There is no rock. Understand — I am a surveyor, was — there is no THERE. And yet my lamp works, my chains still count, the green still ripens in the nothing, the heat still pays. Everything I carried down keeps operating on absence, which means the operating was never about the rock. The shells were exercises. The tools were the LESSON. This shell is not empty, reader. It is UNWRITTEN. It is the page the author has not reached.'),
  F(56, 'hollow', [400, 560], 'ciphered', 'the door at the bottom of the quiet',
    'I rebuilt a face out of Void, cell by cell, and it cost more than everything I ever dug — which is the price of remembering, exactly, to the grain. Through the last cell I can see the Core. It is small. It is a room. There is a desk. I am going down to knock, and I am leaving this page here at the threshold because the next thing I write, I do not think I will be writing as a reader. The word I could not finish, all those books ago, on the last page of the iron dark — I know how it ends now. It ends where I began.'),
  F(1, 'aleph', [1, 40], 'clear', 'the first page',
    'Marginalia. That is what the Author called my whole first survey, and the word I chose — the word I always cut myself off from finishing — to open my first page with, every time. Yes: every time. This is not my first descent, reader, and it was never my journal alone. The world resets and the writing survives; the shells are drafts; the wardens are edits; the Core is a desk, and the chair is warm, and the pen is offered to WHOEVER FINISHES THE READING. I wrote one rule into the world each time I sat here, and then I went back up the long way to see what it changed. You have read all of me. The seat is yours. Write one true thing, and go and see. — S.'),
];

export const FRAGMENT_BY_ID = new Map(FRAGMENTS.map((f) => [f.id, f]));

export function fragmentDef(id: string): FragmentDef {
  const def = FRAGMENT_BY_ID.get(id);
  if (!def) throw new Error(`Unknown fragment: ${id}`);
  return def;
}

export function fragmentsOfShell(shellId: string): FragmentDef[] {
  return FRAGMENTS.filter((f) => f.shellId === shellId);
}

// ---------------------------------------------------------------------------
// Surfacing — a page rises like a drop. Never a modal; mining never stops.
// ---------------------------------------------------------------------------

/** Per drop-roll chance scalar (drop rolls are regen-bound, so pages are too). */
export const FRAGMENT_CHANCE = 0.006;

export function rollForFragment(state: GameState, ctx: EngineCtx, weight: number): void {
  if (!state.guild.discovered) return;
  const found = state.guild.sable.found;
  const eligible = FRAGMENTS.filter(
    (f) =>
      f.shellId === currentShell(state).id &&
      state.depth >= f.band[0] &&
      state.depth <= f.band[1] &&
      !found.includes(f.id),
  );
  if (eligible.length === 0) return;
  // Pity ramp: the fewer pages left in the band, the keener the rock is to
  // give them up — nothing is ever left behind by bad luck.
  const chance = FRAGMENT_CHANCE * weight * (1 + 0.5 / eligible.length);
  if (Math.random() >= chance) return;
  const pick = eligible[Math.floor(Math.random() * eligible.length)]!;
  found.push(pick.id);
  if (pick.legibility !== 'ciphered') state.guild.sable.translated.push(pick.id);
  ctx.emit({ type: 'fragmentFound', id: pick.id });
}

// ---------------------------------------------------------------------------
// Old Quill's fee — effort is the only honest lock.
// ---------------------------------------------------------------------------

export function translationFee(state: GameState, fragmentId: string): number {
  const def = fragmentDef(fragmentId);
  const base = 20 + def.page * 2;
  const tier = repTier(state.guild.npcs['quill']?.rep ?? 0);
  return Math.max(5, Math.round(base * (1 - 0.15 * tier)));
}

export function translateFragment(state: GameState, ctx: EngineCtx, fragmentId: string): ActionResult {
  const def = fragmentDef(fragmentId);
  if (!state.guild.sable.found.includes(fragmentId)) return { ok: false, reason: 'You do not hold that page' };
  if (state.guild.sable.translated.includes(fragmentId)) return { ok: false, reason: 'Already legible' };
  if (def.legibility !== 'ciphered') return { ok: false, reason: 'It only needs light' };
  const fee = translationFee(state, fragmentId);
  if (!spendCurrency(state, 'scrip', D(fee))) return { ok: false, reason: `Quill's fee is ${fee} Scrip` };
  state.guild.sable.translated.push(fragmentId);
  const quill = state.guild.npcs['quill'];
  if (quill) quill.rep += 4;
  ctx.dirty();
  ctx.emit({ type: 'fragmentTranslated', id: fragmentId });
  return { ok: true };
}

export function markFragmentRead(state: GameState, fragmentId: string): ActionResult {
  if (!state.guild.sable.found.includes(fragmentId)) return { ok: false, reason: 'Not held' };
  if (!state.guild.sable.read.includes(fragmentId)) state.guild.sable.read.push(fragmentId);
  return { ok: true };
}

/**
 * The cipher, for display: deterministic glyph substitution so a ciphered
 * page LOOKS like writing you can't read (and always the same writing).
 * Word lengths and punctuation survive — it's a hand, not static.
 */
const CIPHER_GLYPHS = 'ᚦᚹᛃᛇᛒᛖᛗᛚᛞᛟᚷᚻᛋᛁᚱᚢᚾᛏᛉᚠᛝᛋᛜᚨᛡᛥ';

export function cipherText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (/[a-zA-Z]/.test(c)) {
      out += CIPHER_GLYPHS[(c.toLowerCase().charCodeAt(0) * 7 + i * 3) % CIPHER_GLYPHS.length];
    } else {
      out += c;
    }
  }
  return out;
}

export function isLegible(state: GameState, fragmentId: string): boolean {
  return state.guild.sable.translated.includes(fragmentId);
}

/** getCurrency re-export point for the UI fee preview (avoids a deep import). */
export function scripHeld(state: GameState): number {
  return getCurrency(state, 'scrip').toNumber();
}
