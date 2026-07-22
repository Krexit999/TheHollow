/**
 * The hand-authored half of the Compendium: mechanics, the reset ladder,
 * combat, and the short essays that give each system a paragraph instead of a
 * line. Everything else is generated from the registries (data.ts).
 *
 * VOICE: the game's own. Someone who has been down there, writing for someone
 * who is about to be. Plain, specific, occasionally dry. Not a manual.
 *
 * PILLAR 5: formulas and rules, never answers. "A Chord is three of the same
 * shape in a line" is a rule. A list of the forty Chords is an answer, and it
 * is not in here.
 */

export interface ConceptPage {
  id: string;
  title: string;
  summary: string;
  group: string;
  keywords: string[];
  paragraphs: string[];
  facts?: Array<[string, string]>;
}

export const CONCEPT_PAGES: ConceptPage[] = [
  {
    id: 'start', title: 'How to play this', group: 'Start here',
    summary: 'The whole game in six sentences.',
    keywords: ['start', 'begin', 'new', 'help', 'tutorial', 'how do i play'],
    paragraphs: [
      'You are digging down through a world made of shells. At the bottom of one shell you fall into the next, and there are seven.',
      'Tap the rock. It gives up charge as Dust. Left alone it fills back on its own, which means you can walk away from this game and it keeps working — that is a promise the whole design is built around, not a feature.',
      'Dust buys upgrades to the face. The Kiln turns Dust into Brick, and Brick builds machines. Machines dig while you are gone. Depth makes everything worth more and eventually demands better tools.',
      'When the shaft stops being worth working, you Collapse it on purpose: you lose the depth and keep something permanent. That is the first of four reset layers, and every one of them trades something you have for something you keep.',
      'Nothing in this game expires. No timer punishes you for leaving, nothing is missable, and no system is a daily chore. If something looks like it wants you to hurry, read it again.',
      'If you only remember one thing: your income has a hard ceiling, and the game is about raising the ceiling rather than working harder under it. The next page explains it.',
    ],
  },
  {
    id: 'ceiling', title: 'The field ceiling', group: 'How it works',
    summary: 'The hard cap on income, and why it exists.',
    keywords: ['ceiling', 'cap', 'capped', 'income', 'limit', 'why is my income capped', 'regen', 'pillar 2', 'dps'],
    paragraphs: [
      'The face is a grid of cells. Each cell holds charge, up to a cap, and refills at a fixed rate. Chipping takes the charge that is there — it does not create any.',
      'So everything you earn comes out of what the rock grows back, and the most you can possibly earn per second is:',
      'CEILING  =  Width × Height × Regen-per-cell × Yield-per-charge',
      'That is the number shown as "Field ceiling" on the Face. Drills, idle income, seepage — everything presses up against it and nothing exceeds it. A hundred drills on a field that grows one charge a second still earn one charge a second.',
      'This is why the game can let you be offline forever without breaking: production is RATE-limited, not exponential. It is also why raising the ceiling — capacity, regen, yield, width — is the only real progress. Buying more drills past the point where they are already harvesting everything does nothing at all, and the game will let you do it.',
      'When a system claims to make you rich, check which term it moves. If it moves none of them, it is not income; it is convenience.',
    ],
    facts: [
      ['Formula', 'W × H × regen × yield'],
      ['What beats it', 'Nothing. That is the point.'],
      ['What raises it', 'Cell capacity, regen, yield, and face width'],
    ],
  },
  {
    id: 'chipping', title: 'Chipping, regen, and idling', group: 'How it works',
    summary: 'What a tap actually does, and why leaving is fine.',
    keywords: ['chip', 'tap', 'click', 'regen', 'idle', 'offline', 'afk'],
    paragraphs: [
      'A manual chip empties one cell of everything it holds and pays you its charge times your yield. A drill does the same thing on a timer, weaker, forever.',
      'Cells refill continuously whether the tab is open or not. Offline, the game computes what the field would have produced and pays it at an efficiency (0.55 at base, up to 0.95 with Persistence, 1.00 with the right Axiom). There is no cap on how long you can be away.',
      'Depth does NOT advance while you are away until you buy Auto-Descend. The rock produces; the descent waits for you.',
      'Active play is worth roughly five times idle at the very start and converges toward about 1.3× by mid-game. Hands matter most when you have least, which is deliberate: the early game rewards attention and the late game rewards machinery.',
    ],
  },
  {
    id: 'purity', title: 'Purity', group: 'How it works',
    summary: 'Why two of the same ore are not the same ore.',
    keywords: ['purity', 'quality', 'band', 'clean', 'ore'],
    paragraphs: [
      'Every material find rolls a purity from 0 to 100. Purity sorts into bands, and the Hold stacks them separately — a hundred filthy Marl and a hundred clean Marl are two different piles.',
      'Purity carries through everything downstream. A tool forged from clean metal chips harder and strikes harder; an alloy poured from clean inputs sockets stronger. Nothing converts purity into quantity, so hoarding does not substitute for finding better.',
      'The Assay Table tells you what a depth contains before you commit time to it, and doubles your finds for a while afterward. It costs time and Insight, never wear — tools in this game never break.',
    ],
  },
  {
    id: 'walls', title: 'Hardness walls', group: 'How it works',
    summary: 'Why the rock suddenly refuses you.',
    keywords: ['wall', 'hardness', 'blocked', 'too hard', 'tier', 'tool', 'stuck'],
    paragraphs: [
      'Each shell has depths where the rock demands a tool tier. Below a wall without the tier, you simply cannot descend — the bar tells you which tier and the Forge tells you what it needs.',
      'This is the spine of the pacing. A wall is not a soft slowdown; it is a stop, and it is always visible before you reach it.',
      'The materials a wall-tier tool needs are always minable in that wall\'s own shell, at or before the wall itself. You will never be asked for something the one-way stair has already closed behind you — that rule is enforced by an audit, not by hope.',
    ],
  },
  {
    id: 'ladder', title: 'The reset ladder', group: 'The ladder',
    summary: 'All four layers: what goes, what stays, what you get.',
    keywords: ['reset', 'ladder', 'collapse', 'breach', 'recursion', 'spiral', 'prestige', 'when should i'],
    paragraphs: [
      'Four layers, each one trading what you have for something that outlives it. Every layer keeps your DEPTH RECORDS, your Delver levels and skills, your achievements, and every Codex — knowledge is never taken.',
      'COLLAPSE — drop the shaft on purpose. You lose face upgrades, shell currencies and depth. You gain Cores, which buy permanent nodes. Do it when the Cores on offer are worth more than the climb back, which is usually sooner than it feels. Four to twelve minutes a cycle; you will do this thirty to sixty times a shell.',
      'BREACH — reach the shell floor and fall through. You lose Cores, all that shell\'s systems and the Core tree. You gain Echoes AND you keep that shell\'s signature mechanic forever, weakened, in every world after. By the sixth shell the face is running five stacked mechanics at once. This is the emotional centre of the game and its payoff is qualitative, not a multiplier.',
      'RECURSION — reach the Core of the World. Everything goes back to Shell I. You gain Axioms, and an Axiom rewrites a RULE rather than a number: cells never empty, a drill stroke works two cells, offline runs at full efficiency. Your tools survive as heirlooms, blunted but yours.',
      'SPIRAL — after a Recursion. The laws you wrote wash away and you are paid capacity instead: slots for machines that play a world without you, and licences for worlds to run beside this one. Below the Spiral you play a world. At the Spiral you administrate several. It is a change of job, not a bigger number.',
      'When to pull each: Collapse constantly, Breach when the floor is reachable, Recurse when the Core is, Spiral when you would rather design than dig.',
    ],
    facts: [
      ['Collapse', 'Loses depth + shell currency → Cores'],
      ['Breach', 'Loses the shell → Echoes + its mechanic, forever'],
      ['Recursion', 'Loses all shells → Axioms (rule rewrites)'],
      ['Spiral', 'Loses your Axioms → automation capacity'],
      ['Always kept', 'Depth records, Delver, achievements, every Codex'],
    ],
  },
  {
    id: 'combat', title: 'Combat', group: 'How it works',
    summary: 'Telegraphs, auto-resolve, and where strike power comes from.',
    keywords: ['combat', 'fight', 'strike', 'telegraph', 'auto', 'warden', 'deepwrought'],
    paragraphs: [
      'Things live down here and occasionally interrupt you. A fight is five lanes and a handful of turns. What is about to happen is TELEGRAPHED a beat before it lands — a hatched lane is a lane that is about to be dangerous — so every fight is readable rather than random.',
      'Your strike power comes from your MINING gear. A tool has two faces, one for rock and one for teeth, and so does every piece of equipment; purity raises both. There is no separate combat build to maintain, which is on purpose.',
      'AUTO-RESOLVE hands the fight to the crew. They win or lose on your stats, quieter, and forfeit the bonus a skilled hand would have earned — roughly half the spoils. An unanswered encounter auto-resolves after thirty seconds regardless, so combat can never block an idle player.',
      'WARDENS sit on shell floors and each one is an argument rather than a stat block: one punishes reveal-gear, one scales with your heat, one is fought half-blind. They are the only fights that are compulsory, and even then an Axiom exists that makes them optional.',
    ],
  },
  {
    id: 'signatures', title: 'The seven signatures', group: 'How it works',
    summary: 'What each shell does differently, and what you keep.',
    keywords: ['signature', 'shell', 'polarity', 'growth', 'refraction', 'pressure', 'absence', 'seepage', 'carry'],
    paragraphs: [
      'Each shell runs a different physics, and Breaching keeps it. Carried mechanics run weaker than native ones but they never leave.',
      'SEEPAGE (Loam) — a full cell keeps producing and the overflow leaks out as income. Your idle floor.',
      'POLARITY (Ferrite) — cells carry a sign. Chipping the same sign in a row builds a chain; the chain is the yield.',
      'GROWTH (Verdance) — vines capture overflow regen and pay it back later. Not acting is a strategy here, which is the joke and also the mechanic.',
      'REFRACTION (Glassmere) — a beam is routed through the face with mirrors. Purely spatial; no timing at all.',
      'PRESSURE (Cinder) — heat rises as you work and is worth money, convexly, right up until it floods the shaft. The only failure state in the game, and it is strictly opt-in.',
      'ABSENCE (the Hollow) — there is no rock. Income is the five carried signatures operating on nothing, plus the Silence, which you farm by letting it build and then listening.',
      'THE CORE (Aleph) — the shell that is short on purpose. A large idea and a forty-deep floor.',
    ],
  },
  {
    id: 'pressure', title: 'Pressure and the flood', group: 'How it works',
    summary: 'Cinder\'s heat, the Governor, and the only way to lose.',
    keywords: ['pressure', 'heat', 'flood', 'cinder', 'vent', 'choke', 'klaxon', 'governor', 'overpressure'],
    paragraphs: [
      'Heat runs 0 to 100 and multiplies yield by (1 + (heat/100)³ × 1.9) — convex, so the last ten degrees hold most of the money.',
      'At 100 held, the shaft FLOODS: the run ends and pays nothing. It costs you the run and never permanent progress — records, Codex, materials, tools and rep all survive a flood exactly as they survive a Collapse.',
      'You cannot flood by accident. The DAMPER governs any shaft nobody has touched, converging idle heat to a hold-line that is always below 100. The GOVERNOR caps open-vent heat at hold-line + 15, never above 90. Flooding requires deliberately CHOKING the vents or running Array overdrive — both explicit, both labelled, both released by walking away.',
      'The VENT NETWORK is plumbing: route pipe from the shaft mouth to the outlets. Shorter runs vent harder. Better routing raises the safe line, which is what buys you headroom for the greedy play.',
    ],
  },
  {
    id: 'discovery', title: 'Discovery, and what this book will not tell you', group: 'How it works',
    summary: 'Chords, alloys, weaves, runes, brews — the rules, not the answers.',
    keywords: ['discovery', 'chord', 'alloy', 'weave', 'rune', 'brew', 'codex', 'recipe', 'secret', 'spoiler'],
    paragraphs: [
      'Several systems here are found rather than unlocked, and this book will explain every one of them without telling you a single answer. That is deliberate and it is not going to change.',
      'THE LATTICE — place motifs on a board of old sockets. Three of the SAME SHAPE in a line ring a Chord, permanently. Nobody wrote down which patterns work.',
      'THE CRUCIBLE — pour metals in whole-number ratios. Most ratios make slag, which costs the metal and teaches you the space. The Codex remembers each alloy that holds.',
      'THE LOOM — assign threads to rows and columns and commit. A knot forms where twists OPPOSE. Shapes among the knots carry the power.',
      'RUNES — letters found on Warren walls, etched in sequence. ORDER IS THE GRAMMAR: Kel-Thur is not Thur-Kel. Some orderings are dissonant and fail the inscription — never the tool.',
      'THE STILL — mix ratios of what the green shell sheds and drink the result. Brews are spikes, not engines.',
      'THE BENCH — route a beam through every target with a few mirrors. Solutions become Lenses you can equip.',
      'In every case: the Codex fills in as you find things, and a locked list is never shown. If you want to be told the answers, the Insight branch of the Delver tree sells hints — that is what it is for, and you pay for it.',
    ],
  },
  {
    id: 'craft', title: 'Craft-systems and Passive Rank', group: 'How it works',
    summary: 'Why you can skip a board without falling behind.',
    keywords: ['craft', 'passive rank', 'board', 'skip', 'mandatory', 'grind'],
    paragraphs: [
      'There are seven boards — Lattice, Crucible, Loom, Bench, Ember Array, Echo Chamber, Automation Grid — and none of them is a mandatory grind.',
      'Each accrues a PASSIVE RANK that pays roughly half of what engaged play pays, without you being there. A player who never opens a board still advances; a player who opens it, finds the three things they need, and leaves is playing it correctly.',
      'What boards gate is UNLOCKS — a specific recipe, a specific door — rather than raw multipliers. That is why skipping one costs you a thing rather than a percentage.',
    ],
  },
  {
    id: 'offline', title: 'Being away', group: 'How it works',
    summary: 'What happens while the tab is shut.',
    keywords: ['offline', 'away', 'sleep', 'overnight', 'afk', 'idle', 'timer', 'expire'],
    paragraphs: [
      'Everything rate-based keeps running: the field refills, drills harvest, the converter burns, craft boards accrue passive rank, expeditions walk, observatory exposures finish, and the Guild clock turns.',
      'On return the game computes the interval and pays it at your offline efficiency. There is no cap on the interval. A year works; it has been tested.',
      'Nothing expires while you are gone. Expedition hauls wait at the gate forever, Well results wait forever, contracts never time out, and an anomaly you miss settles on its own and still pays a little. If you find something in this game that punishes you for being away, it is a bug — report it.',
    ],
  },
  {
    id: 'refining', title: 'Refining', group: 'How it works',
    summary: 'Turning a bad stone into a slower good one.',
    keywords: ['refine', 'refinery', 'purity', 'band', 'upgrade', 'slag', 'trough', 'bad roll'],
    paragraphs: [
      'Purity used to be a number you received and lived with. The Refinery makes it workable: three units of a purity band cook down to ONE unit of the band above.',
      'The refined unit lands at the BOTTOM of its new band. This is deliberate — refining should be worth doing and never better than finding a genuinely clean stone. A refined Fine is the worst Fine in the game, and it is still a Fine.',
      'The two units you lose are not destroyed. They come back as Slag, which is itself an input. Nothing at this bench is a pure sink.',
      'The point of the whole arrangement: a bad roll is now slow rather than wasted. You never have to go and mine the same seam again to fix luck.',
    ],
    facts: [['Ratio', '3 in, 1 out'], ['Lands at', 'the bottom of the new band'], ['The loss', 'returns as Slag']],
  },
  {
    id: 'transmutation', title: 'Transmutation', group: 'How it works',
    summary: 'Materials are a graph, not a hundred separate buckets.',
    keywords: ['transmute', 'chain', 'convert', 'material', 'graph', 'reaction', 'bench', 'one-way stair'],
    paragraphs: [
      'The far half of the Refinery takes TWO materials and gives back a third. Which two, and what comes out, is not written down anywhere — you feed them in and find out.',
      'Order does not matter here. This is the opposite of the rune wall, where sequence is the entire mechanic; a reaction is a set of two things in a trough, and the trough does not care which went in first.',
      'A miss costs one of each and pays Slag. That is the price of the verb, and it is never a dead end, because Slag is an input to reactions of its own.',
      'What this is FOR: the one-way stair means a shell you have left is behind you forever, and its materials with it. A chain makes those materials expensive rather than unreachable. It is also why the stones nobody ever wanted are worth picking up.',
      'What you work out is recorded in the Codex at the bench. This book will not do it for you.',
    ],
    facts: [['Inputs', 'two, order-independent'], ['A miss', 'costs the inputs, pays Slag'], ['Recorded in', 'the Codex, once found']],
  },
  {
    id: 'tempering', title: 'Tempering', group: 'How it works',
    summary: 'A tool matched to a situation, not given another number.',
    keywords: ['temper', 'quench', 'medium', 'affinity', 'condition', 'trough', 'sap', 'ember', 'void', 'frost'],
    paragraphs: [
      'A finished tool can be cooled in a medium, and it takes an affinity from whatever it was cooled in. There are six media.',
      'A temper is a CONDITION, and that is what makes it different from the other two ways of modifying a tool. Runes are a positional grammar — sequence and adjacency, order is meaning. Alloys accumulate — slot three in, get three effects. A temper does neither: it pays when your situation matches it and idles when it does not.',
      'The card for each medium says plainly WHEN it pays, because the whole verb is planning around it. One medium wants a hot shaft; another wants eventful weather; another wants the quiet seasons; another wants the deep half of a shell. They are not six versions of the same idea.',
      'An idle temper is weak, never dead. A tool cooled for a shell you have since left still carries a trickle of what it learned there.',
      'Re-tempering costs less than the first quench. You are meant to change your mind when you move — there is no roll here, nothing to farm, and no bad outcome to re-roll away.',
    ],
    facts: [['Media', 'six'], ['Pays', 'while its condition holds'], ['Otherwise', 'a small idle trickle'], ['Re-quenching', 'cheaper than the first']],
  },
  {
    id: 'salvage', title: 'Salvage', group: 'How it works',
    summary: 'The exit path fifteen tiers of tools never had.',
    keywords: ['salvage', 'break down', 'scrap', 'obsolete', 'old tool', 'extract', 'recover', 'dust'],
    paragraphs: [
      'A tool you have outgrown can be broken back into materials. About half the recipe comes back, at the TOOL\'s own purity — a tool made of clean stone salvages into clean stone.',
      'The decision is what to do with the settings. Paying the fee draws the runes and gems out intact and returns them to you; skipping it is cheaper and loses them. That is the whole choice, and it is a real one when the tool has three good gems in it.',
      'What does not come back as material comes back as Salvage Dust, which the bench has uses for.',
      'You cannot break down the tool in your hands, and you cannot break down your last one. The game will not let you stand at the face with nothing.',
    ],
    facts: [['Returns', 'about half the recipe'], ['At', 'the tool\'s own purity'], ['Settings', 'recovered only if you pay'], ['Refuses', 'your equipped and your last tool']],
  },
  {
    id: 'traits', title: 'Material traits', group: 'How it works',
    summary: 'Why a material is a character, not just a tier.',
    keywords: ['trait', 'traits', 'keen', 'tough', 'dense', 'light', 'brittle', 'material', 'character', 'edge', 'heft'],
    paragraphs: [
      'Every material carries two or three TRAITS — plain, opinionated properties. Loamiron is keen and springy. Umberjade is brittle and charged. You read them in the Hold and on the forge bench, and they are the same everywhere: a trait is a fact about the stone, not a puzzle.',
      'Traits TRADE. Keen takes a savage edge and loses it fast. Dense hits like the floor of the shaft and swings slow. Tough will not crack and will not sharpen. Nothing is good at everything, which is the rule that keeps a common relevant forever: a keen common out-edges a tough rare, at any hour of the game.',
      'This is the one place discovery does not apply — a trait is visible, always. What is NOT written down is what traits do TOGETHER. Some pairings shatter, some sing. You find those by building, and the Codex writes them down when you do. This book never will.',
    ],
    facts: [['Per material', 'two or three'], ['Always', 'visible'], ['In combination', 'discovered']],
  },
  {
    id: 'parts', title: 'Tools from parts', group: 'How it works',
    summary: 'A tool is a head, a haft and a binding — and you choose all three.',
    keywords: ['part', 'parts', 'head', 'haft', 'binding', 'forge', 'compose', 'build', 'tool', 'assembly', 'variant'],
    paragraphs: [
      'A tool is not a recipe any more. It is an assembly: a HEAD, a HAFT and a BINDING, each made from a material you pick, and each reading DIFFERENT traits from it.',
      'The HEAD meets the rock — it reads edge (which makes chip) and force (which makes strike). The HAFT is what you swing — it reads heft (strike) and cadence (chip). The BINDING holds it together — it reads grip (which seats gems) and hold. So the same stone is everything in one part and almost nothing in another: Dense is a whole haft and a wasted binding.',
      'The tool\'s character emerges from what you chose. A keen head on a light haft is a fast Pick; a dense head on a dense haft is a heavy Cleaver. Same tier, nothing alike — and every tier gets that choice, for free, because the variants are not written by hand.',
      'The HEAD still gates the tier: it meets the rock, so its material decides the hardest wall the tool can break. A haft and binding can be anything — a Marl handle on a deep pick is a legitimate, very fast, very weak choice.',
      'Parts are replaceable one at a time. Upgrade the head, keep the haft you like. And salvage returns the haft and binding whole — the head is spent, but the rest comes back for the next tool.',
    ],
    facts: [['A tool is', 'head + haft + binding'], ['Tier gated by', 'the head'], ['Everything else', 'the composition'], ['Replaceable', 'one part at a time']],
  },
  {
    id: 'workbench', title: 'The bench: crafting is a process', group: 'How it works',
    summary: 'Making a thing is something you do, not something you buy.',
    keywords: ['bench', 'workbench', 'craft', 'crafting', 'process', 'forge', 'carve', 'cut', 'cast', 'quality', 'delegate', 'by hand', 'stages'],
    paragraphs: [
      'There are four things you make with your hands at the bench, and each is a DIFFERENT act — not the same button under four names. You FORGE a tool: heat it, shape it, set it. You CARVE a rune into a piece: steady the hand, then draw the line. You CUT a gem: read where it will part, then cleave it. You CAST a rune out of raw material: mix, then pour.',
      'Every act runs in stages, and each stage is a real motion you perform — a press held to the right heat, a line traced in one pass, a plane chosen. QUALITY is earned across those stages and nothing is rolled: the same inputs worked the same way give the same result, every time. There is no dice here to re-roll, and no perfect craft you are farming for. A steady hand simply makes a better thing than a shaky one, within a band narrow enough that skill pays and never dominates.',
      'The MATERIAL changes the doing, not only the result. A brittle stone is unforgiving and wants a light touch; a tough one takes a beating and forgives a clumsy one; a springy one fights the shape back. The bench tells you which before you start, because planning around the stone is the whole craft.',
      'Failure here costs MATERIAL, never the piece. Nothing is spent until the last stage lands, so setting a job down mid-way costs you nothing at all. A carve that goes badly burns the runes you were setting and fouls the surface — the tool itself is never harmed. You lose the work, never the thing you were working on.',
      'And you never have to do it yourself. Every act can be handed to someone who does it for a living — Marrow at the forge, Old Quill over a rune, Ilma with a stone. What they hand back is safe, guaranteed, and a shade short of a clean job of your own. It gets better the better they know you: this is a favour between people, so standing is part of the price.',
      'CASTING is the newest act and the one this book will say least about. You can pour a rune out of a mix of materials — WHICH rune depends on what the materials ARE, read off their traits. Finding out which mixes cast which runes is the discovery, and it writes itself into your Codex as you make it. You will not find the table in here.',
    ],
    facts: [
      ['Acts', 'forge, carve, cut, cast'],
      ['Quality', 'earned across stages, never rolled'],
      ['The material', 'changes the process, not just the result'],
      ['Failure costs', 'material, never the piece'],
      ['Every act', 'can be handed to an NPC — safe, a shade worse, and social'],
    ],
  },
  {
    id: 'caches', title: 'Caches, curing and the lift', group: 'How it works',
    summary: 'Storage on the column, and time as an ingredient.',
    keywords: ['cache', 'caches', 'cure', 'curing', 'lift', 'storage', 'shaft', 'patience', 'time', 'deposit'],
    paragraphs: [
      'A CACHE is storage you shore up at a depth, with Cores. Like the rail, it outlives the Collapse — you leave something in it and the cave-in does not take it. A cache moves material in SPACE, from the Hold down into the deep; it never changes how MUCH you have, so it is a convenience and never a source of more.',
      'The point of leaving a stone in the deep is CURING. Some stones improve if you simply let them alone — the deep does the work, over real hours or real days, including the hours you are not playing. What comes out is BETTER in character, never GREATER in count: leave twenty, collect twenty. Curing is upside on patience, not a second income; it converts what you already earned under the ceiling, and mints nothing.',
      'Which stones change, into what, and how long it takes, is not written anywhere — it is FOUND, by leaving things at depth and seeing what they become. Your Codex fills in as you discover each one. A stone needs the conditions of the deep to change at all, so a cache must be sunk deep enough for what you put in it.',
      'Nothing here can be missed or spoiled. A finished cure waits forever — leaving it a year is never worse than leaving it a week — and you may pull a stone out early to get exactly what you put in, uncured. A Breach empties every cache back to the Hold rather than stranding it.',
      'The LIFT rides the rail you laid. Once fitted, it carries you down to the rail head in a single move, paying every depth its (discounted) toll on the way — the tedium of the climb back, gone. It stops dead at the rail head: like the rail itself, it never makes NEW ground free, so the first descent into the unknown is exactly as hard as it ever was.',
    ],
    facts: [
      ['A cache', 'storage at a depth, survives Collapse'],
      ['Curing', 'converts a stone over real time — better, never more'],
      ['Found, not listed', 'which stone cures into what is a discovery'],
      ['Never lost', 'nothing spoils; a Breach surfaces it all'],
      ['The lift', 'rides the rail to its head; never past it'],
    ],
  },
  {
    id: 'excavations', title: 'The buried things', group: 'How it works',
    summary: 'Some things are too big to chip out.',
    keywords: ['excavation', 'excavations', 'buried', 'dig', 'fossil', 'clear', 'uncover'],
    paragraphs: [
      'Not everything in the rock comes out in your hand. Some things are too big to chip — a shape in the wall you can only clear AROUND, a shift at a time, and only one shift each time you come to it, so you finish them by returning as you pass.',
      'What they turn out to be is not written here. You uncover them the slow way, shape before name, and the uncovering is the whole of the point. A few sit in every shell, at depths that never move. You will pass one eventually, and know it when you do.',
    ],
  },
  {
    id: 'unmineable', title: 'The unmineable', group: 'How it works',
    summary: 'A wall no tool marks. One per shell.',
    keywords: ['unmineable', 'wall', 'shell wall', 'boundary', 'sable', 'the wall'],
    paragraphs: [
      'There is one place in each shell that no tool has ever marked, and none ever will. You will know it when you reach it.',
      'It is the wall of the shell — the edge of the world, where you can lay a hand on it. That is as much as this book will say. Stand at it and read; it tells you more than a page could, and the more of the deep you have seen, the more of it there is.',
    ],
  },
  {
    id: 'implements', title: 'Tools that learn, and remember', group: 'How it works',
    summary: 'Affinity, opinions, and the marks a tool earns.',
    keywords: ['tool', 'implement', 'affinity', 'opinion', 'temperament', 'heirloom', 'history', 'favourite', 'sulk', 'settle'],
    paragraphs: [
      'A tool you carry keeps a record of every rock it has worked. Out of that record it grows an AFFINITY — a small, capped edge in a shell it knows well — and, once the record is long enough, an OPINION on top of it.',
      'An opinionated tool favours the rock it knows and works a stranger rock a little worse. It only ever bends that same small edge; it never touches the field ceiling, so a tool with a bad opinion of where you are is slightly less lucky, never less powerful. This lives in your drops, not your income.',
      'A tool also SULKS briefly when you first pick it up — a settling-in, not a tax — and a tool that already knows the shell settles almost at once. That is the point of the whole system: three tools rotated in and out never grow strong opinions and never punish the switch, while one tool carried for a very long time becomes a favourite that feels like one. If you like swapping, keep swapping; nothing here charges you for it.',
      'And a storied tool earns MARKS: it stood in the hand that felled a Warden, it came whole through a Recursion, it cracked a great many geodes, it fell through a floor still swinging. Each distinct mark is a touch of luck in the rock, capped low — a record you can read, not a build you chase. An idle player simply never earns them and is no worse for it.',
    ],
    facts: [
      ['What affinity feeds', 'Your drops, never the ceiling'],
      ['Who earns strong opinions', 'One tool carried a long while'],
      ['Cost of switching tools', 'Nothing but a brief settling-in'],
      ['What a mark is worth', 'A small, capped touch of luck'],
    ],
  },
  {
    id: 'inscription', title: 'The depth of inscription', group: 'How it works',
    summary: 'Practice, longer sequences, and the slowest carvings.',
    keywords: ['rune', 'inscription', 'carve', 'practice', 'scrap', 'triple', 'slot', 'temporal', 'order', 'cast', 'casting'],
    paragraphs: [
      'The rune grammar rewards patience past the first pair. You can PRACTISE a join on scrap for a little Silica: it tells you only the SHAPE of what you set — how many joins rang and how many fought — and never which ones, never what they do, never a word to your Codex. It teaches that adjacency and order matter; which orderings pay is still yours to commit to a real surface and find.',
      'A better tool carries a longer sequence. Gear holds three runes; a fine implement earns more room as its tier climbs — and a longer sequence is the only place a TRIPLE can live, where three runes in a row say a third thing on top of the two pairs inside it. A triple is found the same way everything here is found: by carving it.',
      'The slowest discovery in the game is carved across TIME. A few sequences complete only when their runes are cut into the same tool IN ORDER, with a long stretch of real play between each — meant to span sessions, not minutes. You will not stumble into one in an afternoon; you will look up one day and find it finished.',
      'Finally, a rune can be CAST from raw material at the bench as well as FOUND in the deep. The two are the same rune to a socket, but the tool remembers which came from the crucible — a small, honest distinction between what the world gave you and what you made.',
    ],
    facts: [
      ['What practice teaches', 'The shape of a join, never the answer'],
      ['Where triples live', 'In sequences longer than a pair'],
      ['How the slowest carvings complete', 'In order, across long real time'],
      ['Cast vs found', 'Same rune; the tool remembers the difference'],
    ],
  },
];

/**
 * A short essay per system: why it exists and how it touches everything else.
 * Layer 1 (the purpose line) is generated from systemCopy; this is the extra
 * paragraph the Compendium gives it room for. Systems without an essay still
 * render — they just show their purpose and where to find them.
 */
export const SYSTEM_ESSAYS: Record<string, string[]> = {
  dig: [
    'Everything in this game is downstream of the face. Every currency, every machine, every reset layer is ultimately a way of making these cells worth more or refill faster.',
    'The four numbers on the Field card are the whole economy: capacity, regen, yield, and the ceiling they multiply into. When you are unsure what to buy, buy the one that moves the ceiling most.',
    'The hand has more than a tap. HOLD to chip a cell without hammering it. And SWEEP is a drag that clears a swathe for stamina, which fills fast on its own and gates nothing but the sweep. Neither lifts the ceiling; they only change how the hand reaches it.',
    'And the rock answers a deliberate hand. Strike cells into certain shapes and the face gives something back — never Dust, which would be income the ceiling forbids, but XP, a better roll at a drop, and your sweep-arm returned. What the shapes are is not written anywhere; the face will glow faintly a beat before one closes, and the rest you find by doing. The Codex keeps the ones you have cut.',
  ],
  kiln: [
    'The converter is the spine of the early economy: it turns the thing you gather into the thing you build with. Every shell has one under a different name, and the pattern never changes.',
    'Heat is efficiency, not speed. A cold kiln swallows Dust and gives back almost nothing, which is why feeding it steadily beats feeding it in bursts.',
    'A FUEL is a choice, not a ladder. Each one trades how fast it brings the kiln to temperature against how well it holds that heat when the feed stutters — a hot, fast fuel spikes and fades; a slow one is patient and forgiving. There is no strictly-best; there is the one that suits how attentively you feed. Heat you have built now BANKS while you are away, so you come back to a warm kiln, not a cold one.',
    'OVERSTOKE forces the fire to full for a short window, at a cost in Dust and a cooldown after. It is the one thing that pushes past the heat cap — but only briefly, and only when you choose it. The Dust it burns was field-bound already, so it changes when bricks land, never how many the field can ultimately feed.',
  ],
  drills: [
    'Drills are the promise that this game runs without you. They harvest the same field your hands do, so they are bound by the same ceiling — past a point, more drills change nothing and the game will happily sell them to you anyway.',
    'Each drill is an INDIVIDUAL — it has a name, it WEARS with use, and it learns. A worn drill is visibly in trouble long before it fails, and it never dies: at its worst it limps at a fraction of its bite until you repair it, so an away player never comes back to a dead bay. Wear only accrues while you are actually here striking; leave and it waits, unchanging.',
    'A drill that has worked one shell for a long time develops an AFFINITY for it — a small, capped edge that reads as history, not a grind. It feeds the drill\'s power, so it only ever reaches the field ceiling a little sooner; it cannot raise it. Affinity never fades, so switching a drill to a new shell costs it nothing it had.',
    'A drill is CONFIGURED, not just levelled. A HEAD sets how it hunts the face and where its strength leans; a BIT, cut from a material, tunes power, speed, and how fast the head wears the way a tool reads its parts. Head × bit is a drill unlike the one beside it.',
  ],
  forge: [
    'The Forge is where a tool becomes yours rather than merely owned. It starts as a stat block; it ends as a thing with a shell it prefers, a temper suited to where you stand, runes cut across whole sessions, and a short list of what it has survived.',
    'A carried tool learns the rock it works and grows an opinion about it, sulks for a breath when you first pick it up, and earns marks for the deeds it was in your hand for. None of it lifts the ceiling — it is all history, read in your drops and on the tool itself. Rotate freely if you like rotating; carry one for forty hours if you want a favourite. The design is built to make either feel right.',
    'When a rack of old tools has outlived its use, break them all down at once — and pay a little to keep the runes and gems if the fittings are worth more than the metal.',
  ],
  shaft: [
    'The Shaft is a picture of your column and a way to move through it. Everything on it is drawn from what you have actually done: the walls you broke, the floods you weathered, the Wardens you felled, the rail you laid, the depth you have ever reached. Read long enough and it is a diary you did not write.',
    'Two rules keep it honest. Moving to cleared rock is free in either direction — it is access, and access is never income: a shallower face simply earns less, so climbing up costs you nothing and pays you nothing. And the rail, which alone survives the Collapse, only ever DISCOUNTS the climb back — it never makes new depth free. The deepest, newest step always pays full freight, so the Collapse loop turns at exactly the pace it always did.',
  ],
  lattice: [
    'The first discovery system, and the template for the rest: a board, a rule nobody wrote down, and a Codex that fills in as you find things.',
    'Chords are permanent and survive Collapse AND Breach. It is the one board whose progress never washes.',
  ],
  guild: [
    'Thirty people who remember you. Standing opens things coin cannot: stock, contracts, crew, translations, and a few doors that only ever open for someone the Lamphouse trusts.',
    'Nothing here is timed and nothing is missable. Contracts wait, stock rotates on a clock that turns whether you watch it or not, and forgetting a job costs nothing but the work already done.',
  ],
  collapse: [
    'The fastest loop in the game and the one most players under-use. If you are wondering whether to Collapse, you probably should have already.',
  ],
  rewrite: [
    'Axioms are the only things in the game that change RULES. Everything else is a number. Read them before you spend — you will own a handful, not all twenty, and the world you build out of them is the one you play next.',
  ],
  spiral: [
    'The top of the ladder, and a different job. Challenges are the part you still play with your hands; the Grid is the part that plays without them.',
    'A full board plays a world exactly as well as a patient idle player and never better. That ceiling is deliberate: automation buys your attention back, it does not out-earn you.',
  ],
  hollow: [
    'There is no rock in the Hollow. Everything you earn is the five signatures you carried operating on nothing at all, which is either a profound statement about the game or a very dry joke, depending on the hour.',
  ],
};
