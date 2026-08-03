/**
 * TRANSMUTATION CHAINS — the edges that turn 132 independent buckets into a
 * graph.
 *
 * THE DESIGN RULE, and it is the whole point: **every chain consumes at least
 * one material that had ZERO consumers.** The audit
 * (`scripts/material-audit.ts`) found 49 of them — stones that dropped, stacked,
 * and were never asked for by any recipe, catalyst, brew or case. A test
 * asserts this rule holds, so a future chain cannot quietly be authored out of
 * two materials that were already busy.
 *
 * The outputs are either WORKED materials (the new intermediates) or materials
 * a tool recipe genuinely wants, which is what makes running a chain worth the
 * loss.
 *
 * Ordering does not matter — a chain is a SET of two, deliberately unlike the
 * rune grammar, where sequence is the entire mechanic. Two systems that both
 * take two inputs must not both care about order, or the second one is just
 * the first one again.
 *
 * PILLAR 5: none of this is listed anywhere. The player feeds two stones in and
 * finds out.
 */
import { registerChain } from '../../systems/refinery';

export function registerChains(): void {
  // --- The coarse end: commons nobody wanted become the universal binder ---
  registerChain({
    id: 'slagToClay', a: 'refineslag', b: 'sablequartz', out: 'bindingclay', cost: 4,
    name: 'The Wet Working',
    flavor: 'Slag worked wet with ground sablequartz until it stops being either one.',
  });
  registerChain({
    id: 'palegoldBinder', a: 'palegold', b: 'refineslag', out: 'bindingclay', cost: 3,
    name: 'The Poor Man\'s Gold',
    flavor: 'Palegold was never worth anything on its own. It was never meant to be on its own.',
  });
  registerChain({
    id: 'ashgritBinder', a: 'ashgrit', b: 'slagrock', out: 'bindingclay', cost: 3,
    name: 'The Cinder Mix',
    flavor: 'Two Cinder leavings that hate each other enough to bond.',
  });

  // --- Orphan commons become the shell staples the Forge actually asks for -
  registerChain({
    id: 'weepstoneToLoamiron', a: 'weepstone', b: 'bindingclay', out: 'loamiron', cost: 3,
    name: 'The Dry Weeping',
    flavor: 'Weepstone gives up its water and what is left is closer to iron than anyone expected.',
  });
  registerChain({
    id: 'ironbloomToScale', a: 'ironbloom', b: 'bindingclay', out: 'wormsteel', cost: 3,
    name: 'The Second Bloom',
    flavor: 'Ferrite bloom, bound and re-cooked. It comes out the long way round.',
  });
  registerChain({
    id: 'sporewoodToRootglass', a: 'sporewood', b: 'sapstone', out: 'rootglass', cost: 3,
    name: 'The Green Glass',
    flavor: 'Two Verdance leftovers, pressed until the green goes out of them.',
  });
  registerChain({
    id: 'silicashToDuskflint', a: 'silicash', b: 'frostsand', out: 'duskflint', cost: 3,
    name: 'The Cold Strike',
    flavor: 'Glassmere ash and Glassmere sand. The spark still falls upward.',
  });

  // --- The refined end: truesilver, the good-tool intermediate -------------
  registerChain({
    id: 'trueFromScale', a: 'scalechip', b: 'greyflux', out: 'truesilver', cost: 5,
    name: 'The Long Cook',
    flavor: 'Five of each, and most of a day. Dovekin will not say where he learned it.',
  });
  registerChain({
    id: 'trueFromMirror', a: 'mirrorgrit', b: 'lumenshard', out: 'truesilver', cost: 4,
    name: 'The Bright Draw',
    flavor: 'Ground mirror and light-shard. It comes out of the trough already polished.',
  });
  registerChain({
    id: 'trueFromPolestar', a: 'polestar', b: 'rustmarrow', out: 'truesilver', cost: 4,
    name: 'The Turned Needle',
    flavor: 'Polestar points north until you cook it, after which it points at you.',
  });

  // --- The Hollow's sixteen orphans: the deep end of the graph -------------
  registerChain({
    id: 'voidFromNothing', a: 'nothingstone', b: 'quietchalk', out: 'voidresidue', cost: 3,
    name: 'The Absent Reaction',
    flavor: 'Nothing and quiet, combined. The trough is emptier afterwards than the inputs account for.',
  });
  registerChain({
    id: 'voidFromUmbral', a: 'umbralite', b: 'hushmetal', out: 'voidresidue', cost: 3,
    name: 'The Hushed Pour',
    flavor: 'Makes no sound at all, which is how you know it worked.',
  });
  registerChain({
    id: 'voidFromEcho', a: 'greyecho', b: 'stillstar', out: 'voidresidue', cost: 3,
    name: 'The Last Echo',
    flavor: 'The echo goes in. The echo does not come out. Something else does.',
  });
  registerChain({
    id: 'silenceFromVoid', a: 'voidresidue', b: 'silencesteel', out: 'temperash', cost: 2,
    name: 'The Quenching Ash',
    flavor: 'Residue and silence-steel, burnt down to the grey powder the quench troughs want.',
  });

  // --- Aleph: the chain that files back ------------------------------------
  registerChain({
    id: 'lawFromAxiom', a: 'axiomdust', b: 'sigilstone', out: 'lawfiling', cost: 3,
    name: 'The Filed Rule',
    flavor: 'You are cutting something that should not have been cuttable. It files back.',
  });
  registerChain({
    id: 'lawFromWorldseed', a: 'worldseed', b: 'paradoxa', out: 'lawfiling', cost: 3,
    name: 'The Contradiction',
    flavor: 'A seed and a paradox. The result is filings, and the filings are warm.',
  });

  // --- Temper ash, the cheaper way -----------------------------------------
  registerChain({
    id: 'ashFromChar', a: 'charstone', b: 'emberflake', out: 'temperash', cost: 3,
    name: 'The Trough Bottom',
    flavor: 'Char and ember, banked and left. Every smith has a bucket of this and no idea it is worth anything.',
  });
  registerChain({
    id: 'ashFromThorn', a: 'thornmind', b: 'mosscoal', out: 'temperash', cost: 3,
    name: 'The Green Burn',
    flavor: 'Verdance burns badly and leaves a very particular ash.',
  });

  // --- The export spine (Part B): Loam's last word in every Ferrite pour ---
  // Palegold had one consumer (the binder chain) and marl had none the audit
  // could see past its curing. One firing yields a BATCH of six: the flawless
  // stone is an outing, not a per-pour toll — and Serra sells the flux
  // ready-made once you are past Loam, so the Crucible can gate but never
  // starve.
  registerChain({
    id: 'kilnFiring', a: 'palegold', b: 'marl', out: 'kilnflux', cost: 1, yield: 6,
    name: 'The Kiln Firing',
    flavor: 'Gold that lost its colour, fired into clay that remembers the sea. What comes out makes every other stone agree to melt.',
  });

  /*
   * ── THE SHALLOW BOARD (A.71) ────────────────────────────────────────────
   *
   * MEASURED, then fixed: a Loam+Ferrite player could FIRE exactly three of the
   * nineteen chains. Twelve want inputs from Verdance and deeper, three more
   * want `bindingclay`, which is itself an output — so the bench a shallow
   * player meets had almost nothing on it, and the reported "2497 runs, nothing
   * found" was the honest arithmetic of that rather than a fault anywhere.
   *
   * WHY THESE INPUTS AND NOT ORPHANS. The founding rule is that a chain should
   * pull an orphan back into the economy, and the audit says the only orphans
   * left in these two shells are five alloy CASTINGS (crafted, never dropped)
   * and Starmarl, which rolls eleven times in nine thousand. None of them can
   * carry a shallow board. So these five earn their place by the rule's OTHER
   * route, the one the test already accepts: every one REACHES UP a rarity gate,
   * turning stone that drops constantly into stone the depth gates withhold.
   * That is the same job — reach — by the arm that is actually available here.
   *
   * Every input below drops in the hundreds in Loam/Ferrite (measured), so the
   * board is made of what a shallow player is already holding.
   */

  // Two commons the whole game ignored become the universal binder — the same
  // move `ashgritBinder` makes in Cinder, finally available in Loam.
  registerChain({
    id: 'bonemeal', a: 'bonechalk', b: 'graveclay', out: 'bindingclay', cost: 4,
    name: 'The Bonemeal',
    flavor: 'Ground chalk and grave clay, worked wet. It sets harder than either had any right to.',
  });
  // ...and the other commons pair fires the kiln, so a player who found one
  // binder route is not told the other is the only one.
  registerChain({
    id: 'ochreFiring', a: 'ochre', b: 'bonechalk', out: 'kilnflux', cost: 3, yield: 4,
    name: 'The Ochre Firing',
    flavor: 'The yellow burns off first and takes the chalk with it. What is left will melt anything.',
  });
  // Rich + rich -> pure: the first time the bench reaches a band the rock has
  // not started dropping yet.
  registerChain({
    id: 'lodeknitting', a: 'loamiron', b: 'lodestone', out: 'magnetile', cost: 3,
    name: 'The Lode Knitting',
    flavor: 'Iron from the soil and iron from the drift, and neither will lie flat again.',
  });
  registerChain({
    id: 'rimeworking', a: 'rimeiron', b: 'bluesteel', out: 'wormsteel', cost: 3,
    name: 'The Rime Working',
    flavor: 'Cold iron folded into blue, over and over, until it moves like something alive.',
  });
  registerChain({
    id: 'flintstaining', a: 'duskflint', b: 'ochre', out: 'umberjade', cost: 3,
    name: 'The Flint Staining',
    flavor: 'The ochre goes into the flint and does not come out. It goes green about a week later.',
  });

  /*
   * ── THE REMAINS BOARD (A.84) ────────────────────────────────────────────
   *
   * The five above earn their place by REACH and rescue nothing — measured,
   * not assumed: `material-audit.ts` now prints a rescue attribution per chain
   * and all five come back "rescues nothing". That was honest at A.71, whose
   * own comment says so, because the only Loam orphans left were castings and
   * Starmarl and neither could carry a board.
   *
   * That is no longer true. Loam's six combat-stranded stones are REMAINS now
   * (`materials.ts`, `remainsAt`) and five of them are genuine orphans by every
   * route the audit can see. So this board goes back to §16.4's actual rule:
   * ONE ORPHAN EACH, none of them twice, and an output something really wants.
   *
   * Two of the five close a gap rather than adding a lane. TEMPERASH and
   * TRUESILVER each had three routes and not one a Loam player could run —
   * every one wanted Cinder, Verdance, Glassmere or Hollow stock — so the
   * quench trough and the good-tool intermediate were both Ferrite-era
   * furniture in a Loam-era room.
   *
   * The trait heuristic (§17) is kept honest here: every pair below SHARES a
   * trait, and four of the five outputs inherit the pair's traits exactly. A
   * player working the rule out gets these; a player pairing at random does not.
   */

  // chitinshard (tough+springy) + loamiron (keen+SPRINGY) -> wormsteel
  // (springy+tough): both of the input traits, and a common+rich pair reaching
  // two gates up into `pure`.
  registerChain({
    id: 'plateFolding', a: 'chitinshard', b: 'loamiron', out: 'wormsteel', cost: 3,
    name: 'The Plate Folding',
    flavor: 'Plate off something long dead, folded through soil-iron until it stops flaking and starts flexing.',
  });
  // gravemote (light+HOLLOW) + ochre (HOLLOW+tough) -> temperash (warm+hollow).
  // THE FIRST TEMPERASH ROUTE A LOAM PLAYER CAN RUN — the other three want
  // Hollow, Cinder and Verdance stock, so the quench trough opened on nothing.
  registerChain({
    id: 'risingAsh', a: 'gravemote', b: 'ochre', out: 'temperash', cost: 3,
    name: 'The Rising Ash',
    flavor: 'The motes go up, the yellow burns off, and what settles in the bottom of the trough remembers both.',
  });
  // burrowertooth (KEEN+tough) + duskflint (KEEN+dense) -> truesilver
  // (keen+trueseated): the shared edge goes through and the rest burns off.
  // THE FIRST SHALLOW TRUESILVER — the other three want Ferrite and Glassmere
  // stone, so the good-tool intermediate was Ferrite-era furniture until now.
  registerChain({
    id: 'toothDrawing', a: 'burrowertooth', b: 'duskflint', out: 'truesilver', cost: 3,
    name: 'The Tooth Drawing',
    flavor: 'Something spent its whole life going forward through this. Drawn out against flint, it comes back silver.',
  });
  // marrowglass (BRITTLE+keen) + rootglass (charged+BRITTLE) -> umberjade
  // (brittle+charged): again exactly the pair's traits.
  registerChain({
    id: 'marrowSetting', a: 'marrowglass', b: 'rootglass', out: 'umberjade', cost: 3,
    name: 'The Marrow Setting',
    flavor: 'Glass grown inside a body, set against glass grown around a root. Neither of them was ever stone until now.',
  });
  /*
   * THE FLOOR CHAIN, and the only one here a shallow player cannot run.
   * Taproot is buried at DEEPGRAVE and nowhere else — the Tapmother's roots do
   * not come up — so this is the pair you can only hold by standing at the
   * bottom of the world. Cost two, batch of three: both stones are scarce and a
   * per-unit toll on scarce stock is a bottleneck, not a decision.
   *
   * FIRST DRAFT WAS taproot + SABLEQUARTZ, and the trait test refused it:
   * springy+charged against trueseated+keen is nothing in common, which §17
   * says gives grog. The rule the player infers is the rule the author obeys.
   * Starmarl shares `charged` and hands `trueseated` straight to the output —
   * and it is itself an orphan the A.71 board named and could not use.
   */
  registerChain({
    id: 'deepgraveDraw', a: 'taproot', b: 'starmarl', out: 'truesilver', cost: 2, yield: 3,
    name: 'The Deepgrave Draw',
    flavor: 'A root out of the floor of the world and marl with a light still in it. Between them they draw longer than anything down here has a right to.',
  });
}
