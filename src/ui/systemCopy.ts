/**
 * SYSTEM COPY (Phase 11) — every system explains itself in three layers.
 * This table is authored UI-SIDE (the engine stays headless, content frozen).
 * The voice is the game's own — Sable's journals, Dovekin's lamp-talk — not a
 * manual's. Second person, plain, atmospheric. Never "a hex board with
 * adjacency rules"; always "the thing under the rubble that makes rock give
 * more."
 *
 *  Layer 1 — `purpose`: what this is and why you care. Always visible.
 *  Layer 2 — `next(state)`: the single most useful thing to do here, now.
 *            Returns null when there's nothing to say.
 *  Layer 3 — the number breakdown, via <BucketInfo>, lives in each panel.
 */
import type { GameState } from '../engine';
import { fmt } from '../engine';
import { MAX_DRILLS } from '../engine/systems/drills';
import { spiralPending } from '../engine/systems/spiral';
import { CASES } from '../engine/systems/museum';
import type { TabId } from './store';

export interface SystemCopy {
  title: string;
  purpose: string;
  next?: (s: GameState) => string | null;
  /**
   * A live readout for the header's right edge — "running hot · 77% heat",
   * "depth 214". Lives here rather than being passed in by each panel so the
   * central header can serve every system identically (Phase 11b).
   */
  status?: (s: GameState) => string | null;
}

const thinDust = (s: GameState, id: string) => (s.currencies[id]?.toNumber() ?? 0);

export const SYSTEM_COPY: Partial<Record<TabId, SystemCopy>> = {
  dig: {
    title: 'The Face',
    purpose:
      'The rock in front of you. Tap it and it gives up charge as Dust; leave it and it fills back on its own. Everything you own started here.',
    status: (s) => `depth ${s.depth}`,
    // The opening beats, in order. The first version of this line was a single
    // string that never changed: it still read "keep tapping" at 1,200 Dust
    // with the Kiln affordable, which is worse than saying nothing.
    next: (s) => {
      const dust = thinDust(s, 'dust');
      if (!s.kiln.built && dust >= 500) {
        return 'You have enough to raise the Kiln — the first machine that works without you.';
      }
      if (s.maxDepthRecord === 0) {
        if (dust >= 50) return 'You can afford your first upgrade. Take it — the face gives more from here on.';
        return 'Tap the rock. Keep tapping — the first upgrade is only a few strokes away.';
      }
      return null;
    },
  },
  shaft: {
    title: 'The Shaft',
    purpose:
      'The column you have dug, end to end. Descent is not one-way: climb back up your own shaft, and the rock you have cleared this run is free to walk. Lay rail with Cores and it outlives the Collapse — the fastest way back to the deep.',
    status: (s) => {
      const reached = s.shaft.reached;
      const rail = s.shaft.rail[s.shell.current] ?? 0;
      return `depth ${s.depth} of ${reached}${rail > 0 ? ` · rail to ${rail}` : ''}`;
    },
    next: (s) => {
      const reached = s.shaft.reached;
      const rail = s.shaft.rail[s.shell.current] ?? 0;
      if (s.depth < reached) return 'You are up the shaft. Tap a cleared depth to move — walking your own column costs nothing.';
      if (s.collapse.count > 0 && rail < reached && s.depth >= 20) {
        return 'Lay rail down to here with Cores. It survives the Collapse and halves the climb back next time.';
      }
      if (reached >= 26 && s.collapse.count === 0) return 'Deep enough to fall. The Collapse resets the shaft — but the rail, once laid, would remain.';
      return 'The face is deepest at the bottom of the shaft. Go up for access, down for income.';
    },
  },
  kiln: {
    title: 'The Kiln',
    purpose:
      'It eats Dust and gives back Brick — and Brick is what you build with: every machine, every widened wall, every deeper thing. But a cold kiln wastes most of what it swallows, so keep it fed and let the heat climb.',
    status: (s) =>
      `${!s.kiln.feeding ? 'idle' : s.kiln.heat < 0.25 ? 'warming' : 'running hot'} · ${Math.round(s.kiln.heat * 100)}% heat`,
    next: (s) => {
      if (!s.kiln.feeding) return 'It sits cold and idle. Set it feeding to start turning Dust into Brick.';
      if (s.kiln.heat < 0.25) return 'Barely warm — most of the Dust is going up the flue. Keep feeding it until the heat rises.';
      if (thinDust(s, 'dust') < 100 && s.shell.current === 'loam') return 'Your Dust is running thin; the fire will bank itself soon. Chip more, or let it idle.';
      return 'Running hot — Brick is banking. Spend it on machines and on widening the face.';
    },
  },
  drills: {
    title: 'The Drill Bay',
    purpose:
      'Machines that chip the rock for you while your hands are elsewhere — or while you sleep. They can only take what the field grows back, so more drills means faster, never infinite.',
    status: (s) => (s.drills.bayBuilt ? `${s.drills.units.length}/${MAX_DRILLS} drills` : null),
    next: (s) => (s.drills.units.length === 0 ? 'Build the bay, then buy your first drill. It works whether you watch or not.' : null),
  },
  vents: {
    title: 'The Vent Network',
    purpose:
      'Cinder runs hot, and heat is money — right up until it floods the shaft. Pipe from the shaft to the outlets to breathe the heat out. Better routing lets you run hotter, safely.',
    status: (s) => `${s.pressure.heat.toFixed(0)}° · ${s.pressure.pipes.filter((p) => p > 0).length} pipes`,
    next: (s) => {
      const laid = s.pressure.pipes.filter((p) => p > 0).length;
      if (laid === 0) return 'Nothing is plumbed yet. Lay pipe from the shaft mouth (left) toward an outlet.';
      if (s.pressure.choke) return 'The vents are choked — heat can climb to 100 and flood the shaft. Release them and it costs you nothing.';
      if (s.pressure.heat > 85) return 'Running very hot. Widen the network or ease off before the klaxon.';
      return `${laid} lengths laid. Shorter runs vent harder — straighten them and you can hold more heat.`;
    },
  },
  hollow: {
    title: 'The Silence',
    purpose:
      'There is no rock here. The quiet itself is the vein: let it build, then listen, and it pays out as Void. Spend that Void rebuilding the face you started the whole game with, one cell at a time.',
    next: (s) =>
      s.hollow.silence > 60 ? 'The quiet is loud. Listen — harvest it into Void before it mutes your income.' : 'Let the Silence climb, then Listen. Set an auto-listen line so it never overflows.',
  },
  lattice: {
    title: 'The Lattice',
    purpose:
      'A board of old sockets you found under the rubble. Set stones on it; stones in a line ring a Chord, and a Chord makes the rock give more — forever. Nobody wrote down which patterns work. That is the game: find them.',
    next: (s) => (s.lattice.discovered.length === 0 ? 'Place three of the same shape in a line. Something will ring.' : 'Experiment. Undiscovered Chords are still out there — try shapes you haven\'t.'),
  },
  crucible: {
    title: 'The Alloy Crucible',
    purpose:
      'Pour metals together in the right ratios and they become an alloy you can socket into a tool. Most ratios make slag. The few that work are yours to find — the Codex remembers each one.',
    // Board-state only. Naming a ratio would sell what the Insight branch is
    // for, and pillar 5 is discovery over unlocking.
    status: (s) => `${s.crucible.discovered.length} alloys known`,
    next: (s) =>
      s.crucible.pours === 0
        ? 'You have never poured. Pick any ratio — a failed pour costs the metal and teaches you the space.'
        : `${s.crucible.discovered.length} found in ${s.crucible.pours} pours. Nobody wrote the rest down either.`,
  },
  foundry: {
    title: 'The Foundry',
    purpose:
      'A workshop of modules that bend the other systems — a little more here, a different rule there. Install what suits how you play.',
    status: (s) => `${s.foundry.installed.length}/${s.foundry.slots} slots`,
    next: (s) => {
      const free = s.foundry.slots - s.foundry.installed.length;
      if (free > 0) return `${free} slot${free === 1 ? '' : 's'} standing empty — an uninstalled module does nothing.`;
      return 'Every slot filled. Swapping costs nothing, so re-fit when your play changes.';
    },
  },
  greenhouse: {
    title: 'The Greenhouse',
    purpose:
      'Verdance grows things. Plant a strain, wait, harvest; cross two and you may breed a third nobody has grown. The green book fills with every strain you find.',
    status: (s) => `${s.greenhouse.codex.length} strains · ${s.greenhouse.plots.filter(Boolean).length}/${s.greenhouse.plots.length} beds`,
    next: (s) => {
      const empty = s.greenhouse.plots.filter((p) => !p).length;
      if (empty === s.greenhouse.plots.length) return 'Every bed is empty. Plant one — it grows whether you watch or not.';
      if (empty > 0) return `${empty} bed${empty === 1 ? '' : 's'} still empty. A full house crosses more often.`;
      return 'All beds working. When two mature side by side they may cross into something you have never grown.';
    },
  },
  mycelium: {
    title: 'The Mycelium',
    purpose:
      'A living network you feed. Fed well, it spreads on its own — to new sites, to new work — and it survives everything the shells throw at it.',
    status: (s) => `${Object.keys(s.mycelium.nodes).length} sites · ${Math.floor(s.mycelium.reserve)} humus`,
    next: (s) => {
      const sites = Object.keys(s.mycelium.nodes).length;
      if (sites === 0) return 'Nothing is growing. Inoculate your first site — it will not need you again.';
      if (s.mycelium.reserve > 50) return `Humus is banked (${Math.floor(s.mycelium.reserve)}). It will spread on its own; you can also place one yourself.`;
      return `${sites} sites live. Feed it and the network extends without you.`;
    },
  },
  loom: {
    title: 'The Loom',
    purpose:
      'Thread the warp and weft and a pattern emerges where they cross. The pattern makes SHAPES, and the shapes are the point — solve for them. You will know when you weave one.',
    // Board-state only — never which shape, never where.
    status: (s) => `${s.loom.discoveredShapes.length} shapes · ${s.loom.weaves} weaves`,
    next: (s) => {
      const held = Object.values(s.loom.threads).reduce((a, b) => a + b, 0);
      if (held === 0) return 'No thread in hand. Spin some first — the Loom cannot run dry.';
      const draft = [...s.loom.warp, ...s.loom.weft].filter(Boolean).length;
      if (draft === 0) return `${held} thread in hand. Assign some to the rows and columns, then commit.`;
      return 'A draft is set. Commit it and see whether anything crosses.';
    },
  },
  bench: {
    title: 'The Refraction Bench',
    purpose:
      'Optics puzzles. Route a beam through every target with a few mirrors. Every solution you find is saved as a Lens you can equip — a solved thing becomes a thing you own.',
    // Board-state only — never a mirror placement.
    status: (s) => `${s.bench.solved.length} solved`,
    next: (s) => {
      if (s.bench.solved.length === 0) return 'Nothing solved yet. Route the beam through every target and fire.';
      if (!s.bench.equippedLens) return `${s.bench.solved.length} Lenses solved and none equipped — a solved Lens does nothing on the shelf.`;
      return `${s.bench.solved.length} solved. Every puzzle you beat stays yours as a Lens.`;
    },
  },
  array: {
    title: 'The Ember Array',
    purpose:
      'A furnace grid that wants your hands on it. Place fuel, light it, and hold the heat in the band as long as you can — fire spreads as fuel dies, so a layout is a fuse you design. Your best run sets a bonus that never resets.',
    status: (s) => `best ${Math.floor(s.ember.bestSustainSec / 60)}m${Math.floor(s.ember.bestSustainSec % 60)}s · rank ${s.ember.passiveRank}/20`,
    next: (s) => {
      const fuelled = s.ember.grid.filter(Boolean).length;
      const lit = s.ember.burn.some((b) => b > 0);
      if (fuelled === 0) return 'The grid is bare. Place fuel, then light a corner.';
      if (!lit) return 'Fuel is laid but nothing is burning. Light a cell and watch the fire walk.';
      if (s.ember.sustainSec > s.ember.bestSustainSec) return 'You are past your own record right now. Keep it in the band.';
      return `Burning. Your best hold is ${Math.floor(s.ember.bestSustainSec)}s — beat it and the bonus is permanent.`;
    },
  },
  chamber: {
    title: 'The Echo Chamber',
    purpose:
      'It records what you do and does it again, forever, exactly — a way to hand the Chamber your own hands. Shorter routines score higher. This buys your attention back; it never breaks the ceilings.',
    // Board-state only — the trace shows waste; it never writes the program.
    status: (s) => `${s.chamber.tape.length} steps · rank ${s.chamber.passiveRank}/20`,
    next: (s) => {
      if (s.chamber.recording) return 'Recording. Everything you do is going onto the tape — stop when the loop is complete.';
      if (s.chamber.tape.length === 0) return 'The tape is blank. Record a short loop of your own moves, then run it.';
      if (!s.chamber.running) return `${s.chamber.tape.length} steps on the tape. Run it and read the trace.`;
      return 'Running. The trace shows which steps earn and which are dead weight.';
    },
  },
  hold: {
    title: 'The Hold',
    purpose:
      'Everything you have dug up, sorted by kind and cleanliness. Cleaner ore makes better tools. Assay a depth to learn what falls there and double your finds for a while.',
    status: (s) => `${s.materials.totalDrops} finds · ${s.materials.geodes} geodes`,
    next: (s) => {
      if (s.materials.geodes > 0) return `${s.materials.geodes} geode${s.materials.geodes === 1 ? '' : 's'} still shut. Crack them — the gems inside socket into tools.`;
      if (s.materials.totalDrops === 0) return 'Empty so far. Depth and drills fill this by themselves; you do not farm it.';
      return 'Assay the depth you are working to learn what falls there and double the finds for a while.';
    },
  },
  forge: {
    title: 'The Forge',
    purpose:
      'Where ore becomes tools and gear. A better tool chips the harder rock the walls demand; gear has two faces, one for mining and one for the fights. Purity carries through — clean metal, keen edge.',
    next: (s) => {
      const wall = s.shell.current === 'loam' && s.depth >= 40;
      return wall ? 'A hardness wall is near — forge the next tool tier before the rock refuses you.' : null;
    },
  },
  refinery: {
    title: 'The Refinery',
    purpose:
      'The bench between the Hold and the Forge. Three of a purity band cook down to one of the band above, so a bad stone is slow rather than wasted. The far half of the bench takes two materials and gives back a third — which two, and what comes out, is yours to work out. Broken tools come apart here too, half their material back at their own purity.',
    next: (s) => {
      const spare = s.forge.tools.filter((t) => t.id !== s.forge.equipped).length;
      if (spare >= 3) return `${spare} tools you are not using. They are materials with extra steps.`;
      const slag = s.materials.stacks['refineslag'];
      const slagCount = slag ? Object.values(slag).reduce((a, b) => a + (b?.count ?? 0), 0) : 0;
      if (slagCount >= 8) return 'Slag is piling up. It is an input, not a waste product.';
      return null;
    },
  },
  runes: {
    title: 'Rune Inscription',
    purpose:
      'Letters found on Warren walls. Etched next to each other they interact — and ORDER matters, Kel-Thur is not Thur-Kel. The grammar is learned only by trying it. A bad line ruins the inscription, never the tool.',
    status: (s) => `${Object.values(s.runes.found).reduce((a, b) => a + b, 0)} held · ${s.runes.pairsSeen.length} pairs speak`,
    next: (s) => {
      const held = Object.values(s.runes.found).reduce((a, b) => a + b, 0);
      if (held === 0) return 'You have no runes yet. They are found on Warren walls.';
      if (s.runes.pairsSeen.length === 0) return 'Etch two next to each other and see what happens. Order matters — a bad line fouls the inscription, never the tool.';
      return `${s.runes.pairsSeen.length} pair${s.runes.pairsSeen.length === 1 ? '' : 's'} you have heard speak. The rest are still unsaid.`;
    },
  },
  brew: {
    title: 'The Still',
    purpose:
      'Alchemy from what the green shell sheds. Brews are spikes, not engines — a burst for the moment you need one. Recipes are found by mixing, never bought.',
    status: (s) => `${s.brewing.discovered.length} recipes known`,
    next: (s) => {
      if (s.brewing.active) return 'A brew is working through you now. Spend the window — it does not pause.';
      const doses = Object.values(s.brewing.doses).reduce((a, b) => a + b, 0);
      if (doses > 0) return `${doses} dose${doses === 1 ? '' : 's'} on the shelf. Save the strong ones for a warden or a hard push.`;
      return 'Nothing on the shelf. Mix a ratio and drink it — a failed mix still teaches you something.';
    },
  },
  guild: {
    title: 'The Lamphouse',
    purpose:
      'The one warm room in a cold game. Thirty people who buy, sell, hire on, take contracts, and remember you. Standing here opens doors coin cannot.',
    status: (s) => `${s.guild.contracts.completed} contracts done`,
    next: (s) => {
      const open = s.guild.contracts.board.filter(Boolean).length;
      const met = Object.values(s.guild.npcs).filter((n) => n.met).length;
      if (open > 0) return `${open} job${open === 1 ? '' : 's'} on the board — they are written to stack with the digging you were doing anyway.`;
      if (met < 5) return 'Talk to whoever is in. Standing is the only thing down here that coin cannot buy.';
      return 'The board is empty for now. New work is posted on the clock, whether you are here or not.';
    },
  },
  bestiary: {
    title: 'The Bestiary',
    purpose:
      'The book of teeth. Everything you have met in the dark, and what you learned by killing it three times — its rhythm, its tell, how to beat it clean.',
    status: (s) => `${s.combat.seen.length} species logged`,
    next: (s) =>
      s.combat.seen.length === 0
        ? 'Nothing logged yet. Anything you meet in the dark writes itself in here.'
        : `${s.combat.seen.length} logged. Kill one three times and the book gives up its tell.`,
  },
  warrens: {
    title: 'The Warrens',
    purpose:
      'Side-tunnels off the main shaft — a detour, never a cost. Each is hand-built: a puzzle, a keeper, and one thing that exists nowhere else. The runes come from here.',
    status: (s) => `${Object.keys(s.warrens.cleared).length} cleared · ${s.warrens.uniques.length} uniques`,
    next: (s) => {
      if (s.warrens.active) {
        return s.warrens.active.stage === 'puzzle'
          ? 'You are inside one. Solve the puzzle to wake its keeper.'
          : 'The keeper is awake. Put it down and the unique is yours.';
      }
      const cleared = Object.keys(s.warrens.cleared).length;
      return cleared === 0
        ? 'Step into an open Warren. It is a detour, never a cost — you cannot lose progress here.'
        : `${cleared} cleared. Each remaining one still holds something that exists nowhere else.`;
    },
  },
  observatory: {
    title: 'The Observatory',
    purpose:
      'A dome aimed at skies nobody down here has stood under. Long exposures — minutes to half a day — return Spectrum and pieces of star-charts that assemble into permanent gifts. It finishes whether you watch or not.',
    next: (s) => (s.observatory.active ? 'An exposure is running. It waits for you — nothing is missable.' : 'Start an exposure. The long ones pay more; none of them expire.'),
  },
  journal: {
    title: "Sable's Journal",
    purpose:
      'The pages of the one who came before you, surfaced from the rock as you dig. Her hand degrades with depth; Quill translates the ciphered ones. Read them in order and the whole world changes shape.',
    status: (s) => `${s.guild.sable.found.length} pages found`,
    next: (s) => {
      const unread = s.guild.sable.found.filter((id) => !s.guild.sable.read.includes(id)).length;
      if (s.guild.sable.found.length === 0) return 'No pages yet. They surface out of the rock as you dig — you cannot hunt for them.';
      if (unread > 0) return `${unread} page${unread === 1 ? '' : 's'} you have not read. They only make sense in order.`;
      const untranslated = s.guild.sable.found.filter((id) => !s.guild.sable.translated.includes(id)).length;
      if (untranslated > 0) return `${untranslated} still in her cipher. Quill will read them for you.`;
      return 'Everything you have found is read. She keeps writing as you go deeper.';
    },
  },
  wells: {
    title: 'The Magma Wells',
    purpose:
      'Commit some of what you hold, wait, and roll — three, eight, or forty times back, or nothing. The odds are posted at the mouth, honest. A spice, never a strategy; a player who never touches them stays competitive.',
    status: (s) => (s.wells.rolls > 0 ? `${s.wells.wins}W / ${s.wells.losses}L` : 'never rolled'),
    next: (s) => {
      if (s.wells.active.length > 0) return `${s.wells.active.length} commit${s.wells.active.length === 1 ? '' : 's'} still out. The result waits forever — you cannot miss it.`;
      if (s.wells.rolls === 0) return 'The odds are posted at the mouth and they are honest. Never commit what you actually need.';
      return `${s.wells.rolls} rolls so far. This is a spice, not a strategy — the game is winnable without it.`;
    },
  },
  delver: {
    title: 'The Delver',
    purpose:
      'You. Everything you do earns experience, and levels earn skill points to spend on a tree of small permanent edges. This grows across every reset — it is the one thing that is only ever yours.',
    next: (s) => (s.delver.skillPoints > 0 ? `You have ${s.delver.skillPoints} skill point${s.delver.skillPoints === 1 ? '' : 's'} unspent. Spend them.` : null),
  },
  collapse: {
    title: 'The Collapse',
    purpose:
      'Drop the shaft on purpose. You lose the depth but the deep hands back Cores, and Cores buy permanent power that survives the fall. A thing you can do again is not a loss.',
    next: (s) => (s.depth >= 26 ? 'The shaft would pay Cores now. Collapse when the yield is worth the climb back.' : 'Dig deeper first — past depth 26 the shaft starts paying Cores to collapse.'),
  },
  rewrite: {
    title: 'The Rewrite',
    purpose:
      'At the Core, the world resets — but you keep your records, your name, your tools, and Axioms to spend. Each Axiom rewrites a RULE of the world, permanently. You will own only a handful; choose the world you want to play next.',
    status: (s) => `${s.recursion.axioms.length} written · recursion ${s.recursion.count}`,
    next: (s) => {
      const held = s.currencies['axiom']?.toNumber() ?? 0;
      // fmt(), not raw: a big balance printed "500000000 Axioms" in the audit.
      if (held >= 1) return `You hold ${fmt(s.currencies['axiom']!)} Axiom${Math.floor(held) === 1 ? '' : 's'}. Each one rewrites a rule, not a number — read them before you spend.`;
      if (s.recursion.count === 0) return 'Nothing to rewrite yet. Reach the Core and the world offers you the pen.';
      return 'No Axioms banked. Deeper records earn the next one.';
    },
  },
  parallel: {
    title: 'The Parallel View',
    purpose:
      'Every world you fell through, running at once. This is the whole game in one screen — and it has all been one descent.',
    status: (s) => `${Object.values(s.depthRecords).filter((d) => (d ?? 0) > 0).length} of 7 worlds`,
    // Honest Layer 2: this screen genuinely has no action, and saying so is
    // more useful than inventing one.
    next: () => 'Nothing to do here — it is a view. Every number on it is live.',
  },
  grid: {
    title: 'Achievements',
    purpose:
      'A grid of everything the game asks of you. Each cell is a small permanent bonus; a full row or column is a large one. It fills in as you play — never a checklist to grind.',
    status: (s) => `${Object.keys(s.achievements.unlocked).length} unlocked`,
    next: (s) => {
      const n = Object.keys(s.achievements.unlocked).length;
      return n === 0
        ? 'Nothing lit yet. You do not chase these — they land while you play.'
        : `${n} lit. Whole rows and columns pay far more than the cells in them.`;
    },
  },
  spiral: {
    title: 'The Spiral',
    purpose:
      'Below this you play a world. Here you wind one up and set it going. A Spiral spends every law you wrote and pays back capacity — slots for machines that dig without you, licences for worlds to run beside this one. It is the last thing the ladder has to offer, and it is a change of job, not a bigger number.',
    status: (s) => `${s.spiral.count} wound · ${s.spiral.challengeDone.length}/8 by hand`,
    next: (s) => {
      if (s.spiral.activeChallenge) return 'A challenge is running. Finish it or put it down — your own world is waiting, untouched.';
      const pending = spiralPending(s);
      if (pending >= 1) return `The world would pay ${pending} Spiral for winding. Everything you collected survives it.`;
      if (s.spiral.count === 0) return 'Not yet. Write more Axioms and recurse again — the Spiral reads both.';
      const held = s.currencies['spiral']?.toNumber() ?? 0;
      if (held >= 1) return `${Math.floor(held)} Spiral in hand. Buy a grid slot, or a licence for a second world.`;
      return 'Take a challenge. They are the only thing here you play with your hands, and each one pays a machine.';
    },
  },
  automation: {
    title: 'The Automation Grid',
    purpose:
      'The Echo Chamber taught the engine that a program obeys every ceiling a hand does. This is that, grown up: a board of decisions instead of a tape. Modules read the ones beside them, and a full board plays a world exactly as well as a patient idle player — never better, which is the point.',
    status: (s) => `${Object.keys(s.spiral.grid).length}/${s.spiral.slots} slots`,
    next: (s) => {
      if (s.spiral.slots === 0) return 'No slots yet. The Spiral sells them; nothing can be placed until one exists.';
      if (s.spiral.modules.length === 0) return 'No modules won yet. Challenges are where they come from.';
      const used = Object.keys(s.spiral.grid).length;
      if (used === 0) return 'Slots standing empty. Place a module — an unplaced one does nothing at all.';
      if (used < s.spiral.slots) return `${s.spiral.slots - used} slot${s.spiral.slots - used === 1 ? '' : 's'} free. Modules that work together pay more side by side.`;
      return 'The board is full. Re-arranging is free — neighbours are where the last of it hides.';
    },
  },
  relics: {
    title: 'Relics',
    purpose:
      'The things you carried up. Six can be worn at once, and only a worn relic does anything — its power wakes in your hand and nowhere else. What a relic can carry is decided by where you found it, so you can hunt the shape you want instead of praying at a slot machine, and fusing one into another keeps the better of every line and never destroys. The only thing that can take a relic out of your hands is a fusion; LOCK one and not even that.',
    status: (s) => {
      const locked = s.relics.held.filter((r) => r.locked).length;
      return `${s.relics.equipped.length}/6 worn · ${s.relics.held.length} held${locked > 0 ? ` · ${locked} locked` : ''}`;
    },
    next: (s) => {
      if (s.relics.held.length === 0) return 'Nothing yet. They come out of the deep shaft, the Warrens, anomalies, wells, and back with the crews.';
      if (s.relics.equipped.length === 0) return 'Nothing worn. A relic in the hold does nothing at all — wear one.';
      if (s.relics.held.length > s.relics.equipped.length + 2) return 'You are carrying spares. Fuse them in — nothing is lost, and the keeper only ever improves.';
      return `${s.relics.equipped.length} of six worn. An empty slot is pure loss.`;
    },
  },
  museum: {
    title: 'The Museum',
    purpose:
      'The long room off the back of the Lamphouse. Every other screen shows what you can do; this one shows what you did. Nothing is handed over: a hall fills from what you are holding, and now and then the room notices something about the collection and puts a name to it.',
    // CASES.length was hardcoded to 6 while the case list grew to 20 behind
    // it — a stale count exactly like the "a number in this document is not
    // evidence" rule warns about, dormant until this tab was reachable to see
    // it. Read the registry instead of restating it.
    status: (s) => `${s.museum.completed.length}/${CASES.length} cases`,
    next: (s) => {
      if (s.museum.completed.length === CASES.length) return 'Every hall filled. The room is finished, and so, more or less, are you.';
      if (s.museum.exhibitsFound.length > 0) return 'The room has named a few of them. Keep collecting — there are more.';
      if (s.relics.held.length > 0) return 'Your finds already count toward these halls. Nothing to hand over — go and find more.';
      return 'Empty, for now. Relics, teeth, gems and Codex pages all end up on these walls by themselves.';
    },
  },
  expeditions: {
    title: 'The Expeditions',
    purpose:
      'Crews sent out of the camp gate for two minutes or eight hours. They bring back what digging cannot: material from shells the one-way stair has already closed behind you. Nothing they find expires, and a crew that lands while you sleep waits at the gate until you come.',
    status: (s) => `${s.expeditions.active.length} out · ${s.expeditions.ready.length} back`,
    next: (s) => {
      if (Object.keys(s.guild.hirelings).length === 0) return 'Nobody to send. The Lamphouse hires crews.';
      if (s.expeditions.ready.length > 0) return `${s.expeditions.ready.length} crew back at the gate with a full pack. Take the haul.`;
      if (s.expeditions.active.length === 0) return 'Everyone is standing about. Send someone — the long routes are the ones worth sleeping through.';
      return 'Crews are out. They keep walking whether the tab is open or not.';
    },
  },
  vault: {
    title: 'The Vault',
    purpose:
      'Your save — export it to keep, import it to restore, and the developer tools if you want them. Everything here is safe to touch.',
    next: (s) =>
      s.stats.saveExported
        ? 'Exported before. Do it again after a long session — the file is the only copy that outlives this browser.'
        : 'You have never exported. Do it once: a cleared browser takes everything, and this is the only way back.',
  },
};

export function systemCopy(tab: TabId): SystemCopy | undefined {
  return SYSTEM_COPY[tab];
}
