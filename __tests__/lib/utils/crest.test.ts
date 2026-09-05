import { describe, it, expect } from 'vitest';
import { getContrastRatio } from '@mui/material/styles';
import {
  CREST_PALETTE,
  crestColorForId,
  crestInitials,
  resolveCrestColor,
} from '@/lib/utils/crest';

describe('crestColorForId', () => {
  it('is stable for the same id', () => {
    expect(crestColorForId('cku1abcd0000xyz')).toBe(crestColorForId('cku1abcd0000xyz'));
  });

  it('always returns a color from the palette', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(CREST_PALETTE).toContain(crestColorForId(`team-${i}`));
    }
  });

  it('spreads a realistic roster across most of the palette', () => {
    // A division of twenty teams collapsing onto two or three colors would
    // defeat the whole point of deriving one.
    const colors = new Set(
      Array.from({ length: 20 }, (_, index) => crestColorForId(`cku1team${index}0000abc`)),
    );
    expect(colors.size).toBeGreaterThanOrEqual(7);
  });

  it('falls back to the first palette entry for an empty id', () => {
    expect(crestColorForId('')).toBe(CREST_PALETTE[0]);
  });
});

describe('CREST_PALETTE', () => {
  it('carries white text at WCAG AA for normal text', () => {
    // The palette exists so the monogram is legible without measuring every
    // entry at render time; that promise has to hold for every entry.
    for (const color of CREST_PALETTE) {
      expect(getContrastRatio(color, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('has no duplicate entries', () => {
    expect(new Set(CREST_PALETTE).size).toBe(CREST_PALETTE.length);
  });
});

describe('resolveCrestColor', () => {
  it('prefers a valid brand color', () => {
    expect(resolveCrestColor('team-1', '#123456')).toBe('#123456');
  });

  it('accepts 3-digit hex', () => {
    expect(resolveCrestColor('team-1', '#abc')).toBe('#abc');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveCrestColor('team-1', '  #123456 ')).toBe('#123456');
  });

  it.each([null, undefined, '', 'red', '#12345', 'javascript:alert(1)'])(
    'falls back to the derived color for %p',
    (value) => {
      expect(resolveCrestColor('team-1', value)).toBe(crestColorForId('team-1'));
    },
  );
});

describe('crestInitials', () => {
  it('takes one letter per word for multi-word names', () => {
    expect(crestInitials('Ice Breakers')).toBe('IB');
  });

  it('takes two letters for a single-word name', () => {
    expect(crestInitials('Storm')).toBe('ST');
  });

  it('ignores a leading age bracket that carries no letters', () => {
    expect(crestInitials('18U Storm')).toBe('ST');
  });

  it('uses the first two words only', () => {
    expect(crestInitials('Boston Junior Terriers')).toBe('BJ');
  });

  it('splits on hyphens and slashes', () => {
    expect(crestInitials('Wolves-Rangers')).toBe('WR');
  });

  it('strips punctuation', () => {
    expect(crestInitials("St. Mary's")).toBe('SM');
  });

  it('falls back to a placeholder for a name with nothing to read', () => {
    expect(crestInitials('   ')).toBe('?');
  });

  it('handles non-Latin names without mangling them', () => {
    expect(crestInitials('Медведи')).toBe('МЕ');
  });
});
