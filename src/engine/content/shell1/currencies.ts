/**
 * Shell I currencies + reset currency. Adding a currency is one
 * registerCurrency() line — balances, totals, saves, and the UI currency bar
 * all pick it up from the registry.
 */
import { registerCurrency } from '../../resources';

export function registerShell1Currencies(): void {
  registerCurrency({
    id: 'dust',
    name: 'Dust',
    tier: 'shell',
    color: '#d4a86a',
    description: 'Pulverized loam. The first thing the dark gives up.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'brick',
    name: 'Brick',
    tier: 'shell',
    color: '#c96f4a',
    description: 'Dust, fired until it remembers being stone.',
    resetsOnCollapse: true,
  });
  registerCurrency({
    id: 'core',
    name: 'Cores',
    tier: 'reset',
    color: '#8be9fd',
    description: 'What survives a collapse. Cold, dense, patient.',
    resetsOnCollapse: false,
  });
  registerCurrency({
    id: 'motif',
    name: 'Motifs',
    tier: 'craft',
    color: '#9fd8c0',
    description: 'Shapes the Lattice will accept. It is particular.',
    resetsOnCollapse: false, // craft-tier: the board and its coin outlive the shaft
  });
}
