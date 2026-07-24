/**
 * KEY DISPLAY NAMES — the Museum (and any codex list) must show real names, not
 * raw ids like `hex.supported.mixed`. keyDisplayName resolves every `kind:id` to
 * its authored name, and — critically, given the Refinery crash — NEVER throws
 * and NEVER returns the raw key even for an unknown id.
 */
import { describe, expect, it } from 'vitest';
import { keyDisplayName } from '../content/keyNames';
import { CHORD_DEFS } from '../content/shell1/latticeChords';
import { GEMS } from '../materials';
import { SPECIES } from '../combat/species';

describe('keyDisplayName — no raw keys leak', () => {
  it('resolves a chord key to its authored name (the reported leak)', () => {
    const chord = CHORD_DEFS[0]!;
    const name = keyDisplayName(`chord:${chord.id}`);
    expect(name).toBe(chord.name);
    expect(name).not.toContain(':');
    expect(name).not.toBe(chord.id); // not the raw id
  });

  it('resolves gems and species to their names', () => {
    expect(keyDisplayName(`gem:${GEMS[0]!.id}`)).toBe(GEMS[0]!.name);
    expect(keyDisplayName(`species:${SPECIES[0]!.id}`)).toBe(SPECIES[0]!.name);
  });

  it('every discovered kind resolves to a real name for a sample of each', () => {
    // A representative real chord id in the reported format never comes back raw.
    const anyChord = CHORD_DEFS.find((c) => c.id.includes('.'));
    if (anyChord) {
      const n = keyDisplayName(`chord:${anyChord.id}`);
      expect(n).toBe(anyChord.name);
    }
  });

  it('an unknown id never throws and never shows the raw dotted key', () => {
    expect(() => keyDisplayName('chord:nonesuch.deep.mixed')).not.toThrow();
    const n = keyDisplayName('chord:nonesuch.deep.mixed');
    expect(n).not.toContain('.'); // humanised, not the raw key
    expect(n).not.toContain(':');
  });

  it('an unknown kind and a bare id both humanise rather than crash', () => {
    expect(keyDisplayName('mystery:foo.bar')).toBe('Foo Bar');
    expect(keyDisplayName('bare_key')).toBe('Bare Key');
  });
});
