import { describe, expect, it } from 'vitest';
import { matchesPath } from '../src/core/pathMatch.js';

describe('pathMatch', () => {
  it('matches paths correctly with wildcard segments', () => {
    expect(matchesPath('a.b.c', 'a.*.c')).toBe(true);
    expect(matchesPath('a.b.c', 'a.b.*')).toBe(true);
    expect(matchesPath('a.b.c', 'a.b.d')).toBe(false);
  });

  it('handles case-insensitivity options', () => {
    expect(matchesPath('a.B.c', 'a.b.c')).toBe(false);
    expect(matchesPath('a.B.c', 'a.b.c', { caseInsensitive: true })).toBe(true);
  });

  it('escapes literal * inside segments to avoid regex quantifier behavior', () => {
    // If literal * is escaped correctly, "a*b" will only match the literal key "a*b", not "ab", "aab", "aaab", etc.
    expect(matchesPath('ab', 'a*b')).toBe(false);
    expect(matchesPath('a*b', 'a*b')).toBe(true);

    // Previously, diff.ts did not escape * in escapeRegex, meaning "a*b" would treat * as a quantifier.
    // Let's assert it doesn't treat it as a quantifier matching multiple 'a's:
    expect(matchesPath('aaab', 'a*b')).toBe(false);
  });
});
