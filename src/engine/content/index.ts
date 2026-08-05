import { ensurePyreBath } from './reductions';
import { registerAxioms } from './axioms';
/**
 * Content bootstrap. Registration is explicit (not import side effects) so
 * tests and the sim can rebuild registries deterministically. Adding a shell
 * later = adding one register call here (see stubs/shell.ts for the shape).
 */
import { clearCurrencies } from '../resources';
import { clearUpgrades } from '../upgrades';
import { clearModifiers, assertModifierIntegrity } from '../modifiers';
import { clearChains } from '../systems/refinery';
import { clearCraftSystems } from '../craft';
import { clearShells } from '../shells';
import { clearSignatures } from '../signatures';
import { clearTechniques } from '../techniques';
import { clearKeystones, registerReferenceKeystones } from '../systems/keystones';
import { registerShell2Upgrades, registerShell2UpgradeModifiers } from './shell2/upgrades';
import { registerShellContent, registerFerriteCurrencies, registerVerdanceCurrencies, registerGlassmereShell, registerCinderShell, registerHollowShell, registerAlephShell } from './shells';
import { registerPressure } from '../systems/pressure';
import { registerAbsence } from '../systems/absence';
import { clearLaws } from '../laws';
import { registerRelicModifiers } from '../systems/relics';
import { registerSocketModifiers } from '../systems/toolSockets';
import { registerConfluenceModifiers } from '../systems/confluence';
import { registerChains } from './shell2/chains';
import { registerTemperModifiers } from '../systems/tempering';
import { registerRefraction } from '../systems/refraction';
import { registerTraps } from './traps';
import { registerRuneModifiers, registerTemporalModifiers } from './shell4/runes';
import { registerGrowth } from '../systems/growth';
import { registerShell1Currencies } from './shell1/currencies';
import { registerShell1Upgrades, registerShell1UpgradeModifiers } from './shell1/upgrades';
import { registerCoreTreeModifiers } from './shell1/coreTree';
import { registerSkillModifiers } from './shell1/skillTree';
import { registerAchievementModifiers } from './shell1/achievements';
import { registerForgeModifiers } from '../systems/forge';
import { registerPolarity } from '../systems/polarity';
import { registerSeepage } from '../systems/face';
import { registerAffinity } from '../systems/affinity';
import { opinionMult } from '../systems/opinions';
import { registerHeirloomModifier } from '../systems/heirloom';
import { registerCurrency } from '../resources';

/** Phase 12: the Spiral's currency. */
function registerSpiralContent(): void {
  registerCurrency({
    id: 'spiral', name: 'Spiral', tier: 'reset', color: '#c9b8f0',
    description:
      'What a wound world pays out. It buys capacity — grid slots, licences for worlds to run beside yours — and nothing else. There is never much of it.',
    resetsOnCollapse: false,
  });
}

function registerGuildCurrencies(): void {
  registerCurrency({
    id: 'renown', name: 'Renown', tier: 'meta', color: '#e0b054',
    description: 'Your name, as the Lamphouse says it. Earned, never spent — standing opens doors coin cannot.',
    resetsOnCollapse: false,
  });
  registerCurrency({
    id: 'scrip', name: 'Caravan Scrip', tier: 'meta', color: '#c9a86a',
    description: 'The Guild\'s working money — contracts, stalls, translations, wages of the road.',
    resetsOnCollapse: false,
  });
  registerCurrency({
    id: 'charter', name: 'Charter', tier: 'meta', color: '#d8ccf0',
    description: 'The Guild\'s trust, stamped. Nan Verge does not print many.',
    resetsOnCollapse: false,
  });
}

let loaded = false;

export function ensureContentLoaded(): void {
  if (loaded) return;
  loaded = true;
  registerShellContent();
  // The Retort's Pyre-bath (§17). Registered at LOAD rather than on build:
  //  names it as a medium, and a def-lookup that throws inside a
  // render path is the class that black-screened the Refinery at A.36.
  ensurePyreBath();
  registerShell1Currencies();
  registerFerriteCurrencies();
  registerShell1Upgrades();
  registerShell1UpgradeModifiers();
  registerCoreTreeModifiers();
  registerSkillModifiers();
  registerAchievementModifiers();
  registerForgeModifiers();
  registerAffinity(opinionMult); // the equipped tool's affinity, bent by its opinions
  registerHeirloomModifier();
  registerSeepage();
  registerPolarity();
  registerGuildCurrencies();
  registerVerdanceCurrencies();
  registerGlassmereShell();
  registerGrowth();
  registerRefraction();
  // TRAP MATERIALS (§16.3) — the Still's tutorial, registered here so their
  // STILLED forms exist before anything can ask for one.
  registerTraps();
  registerRuneModifiers();
  registerTemporalModifiers();
  registerCinderShell();
  registerPressure();
  registerHollowShell();
  registerAlephShell();
  registerAbsence();
  registerSpiralContent();
  registerRelicModifiers();
  registerSocketModifiers();
  registerConfluenceModifiers();
  registerChains();
  registerTemperModifiers();
  registerReferenceKeystones();
  // THE AXIOMS (§21).  has had live readers and no writer since
  // Phase 10 — this is the writer. Registered at LOAD, the same way seals are.
  registerAxioms();
  registerShell2Upgrades();
  registerShell2UpgradeModifiers();

  // Every registrar has run. Fail loudly NOW if anything registered into a
  // bucket no system reads — a silent no-op is the failure this whole phase
  // started from, and it is cheaper to catch at boot than in a balance sim.
  assertModifierIntegrity();
}

/** Test-only: wipe and reload all registries. */
export function reloadContent(): void {
  clearCurrencies();
  clearUpgrades();
  clearModifiers();
  clearCraftSystems();
  clearShells();
  clearSignatures();
  clearTechniques();
  clearKeystones();
  clearLaws();
  clearChains();
  loaded = false;
  ensureContentLoaded();
}
