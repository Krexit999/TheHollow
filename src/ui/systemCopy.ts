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
import { toolLevel } from '../engine/systems/toolMining';
import { tallyOf } from '../engine/systems/reading';
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
      /**
       * WHAT THE NUMBER ON THE ROCK IS FOR.
       *
       * This line carries a third of the material economy. Measured: a hand
       * that chips the FULLEST cell reaches graveclay-deep and deepgrave
       * NEVER — zero units in eighteen simulated hours across three seeds —
       * while a hand that works one cell down reaches them in 51 s and 119 s.
       * Machines never compact, so hand-chipping is the only route there for
       * anybody, idle or active. Nothing in the game said so.
       *
       * LAW 3: it names the BEHAVIOUR and nothing else. No threshold, no
       * material name, no table of what waits at 8 / 14 / 20 — the digit on the
       * cell is the destination and the player watches it move. In the
       * propositions' voice, because it is the same kind of claim they make: a
       * sentence about how the world works.
       *
       * IT STOPS THE MOMENT IT IS UNDERSTOOD. `gates` counts deep-entry gates
       * crossed, so the line is gone forever after the first one — a hint that
       * keeps talking after the player has acted on it is noise.
       */
      if (tallyOf(s, 'gates') === 0 && (s.face.compaction?.some((c) => c > 0) ?? false)) {
        return 'The rock remembers the cell, not the hand. Work one square instead of the fullest and watch its number climb — that is what the number is for.';
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
  // 'forge' retired A.71. Its copy is not deleted so much as SPLIT: the tool
  // half is the Refinery's business now. Gear (combat) is gone A.7x.
  casting: {
    title: 'The Casting Floor',
    purpose:
      'Melt a stone until it runs, pour it into a shape, and it cools into a part. Seven parts make a tool that is yours — and the seven have to get along. A head from one world and a handle from another will fit, but they will never sit right together.',
    next: (s) => {
      const front = s.casting.crucible.queue[0];
      if (s.casting.tool.length > 0) return null;
      if (front && front.solid > 0) return 'It is melting. The tub tells you when it has run.';
      if (front && front.molten > 0) return 'There is melt in the tub. Pick a cast and pour it.';
      if (s.casting.rack.length === 0) return 'Charge the crucible with something from the Hold.';
      return 'Parts on the rack. Drop seven into the station and combine them.';
    },
    status: (s) => {
      const q = s.casting.crucible.queue;
      if (q.length > 0) return `${Math.floor(q[0]!.molten)} melt${q.length > 1 ? ` · ${q.length} stones` : ''}`;
      if (s.casting.tool.length > 0) return `level ${toolLevel(s)}`;
      return s.casting.rack.length > 0 ? `${s.casting.rack.length} parts` : null;
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
    status: (s) => `${s.spiral.count} wound · ${s.spiral.challengeDone.length}/10 inversions kept`,
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
  relics: {
    title: 'Relics',
    purpose:
      'The things you carried up. Six settings, and only a set relic does anything — its power wakes in your hand and nowhere else. Fusing keeps the better of every line and never destroys; a LOCK makes even that impossible.',
    status: (s) => {
      const locked = s.relics.held.filter((r) => r.locked).length;
      return `${s.relics.equipped.length}/6 worn · ${s.relics.held.length} held${locked > 0 ? ` · ${locked} locked` : ''}`;
    },
    next: (s) => {
      if (s.relics.held.length === 0) return 'Nothing yet. They come out of the deep shaft, the Warrens, wells, and back with the crews.';
      if (s.relics.equipped.length === 0) return 'Nothing worn. A relic in the hold does nothing at all — wear one.';
      if (s.relics.held.length > s.relics.equipped.length + 2) return 'You are carrying spares. Fuse them in — nothing is lost, and the keeper only ever improves.';
      return `${s.relics.equipped.length} of six worn. An empty slot is pure loss.`;
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
