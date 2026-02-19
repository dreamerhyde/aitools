import { describe, expect, test } from 'bun:test';
import { filterBase, hasEmojis, countEmojis, extractEmojis } from '../../src/utils/text-formatter.js';

describe('filterBase', () => {
  test('removes zero-width joiners', () => {
    expect(filterBase('a\u200Db')).toBe('ab');
  });

  test('removes variation selectors', () => {
    expect(filterBase('a\uFE0Fb')).toBe('ab');
  });

  test('collapses whitespace by default', () => {
    expect(filterBase('  hello   world  ')).toBe('hello world');
  });

  test('preserves whitespace when option set', () => {
    expect(filterBase('  hello   world  ', true)).toBe('  hello   world  ');
  });

  test('removes skin tone modifiers', () => {
    const result = filterBase('test\u{1F3FB}text');
    expect(result).toBe('testtext');
  });
});

describe('hasEmojis', () => {
  // Note: hasEmojis uses a /gu regex, so lastIndex state can leak between calls.
  // Each test uses a fresh call to avoid this issue.
  test('detects face emojis', () => {
    expect(hasEmojis('Hello 😀 world')).toBe(true);
  });

  test('returns false for plain text', () => {
    expect(hasEmojis('Hello world')).toBe(false);
  });

  test('returns false for excluded symbols', () => {
    expect(hasEmojis('✓ ✗')).toBe(false);
  });
});

describe('countEmojis', () => {
  test('counts emojis in text', () => {
    expect(countEmojis('🎉🎉🎉')).toBe(3);
  });

  test('returns 0 for no emojis', () => {
    expect(countEmojis('hello')).toBe(0);
  });
});

describe('extractEmojis', () => {
  test('extracts unique emojis', () => {
    const result = extractEmojis('🎉 hello 🎉 world 🌍');
    expect(result).toContain('🎉');
    expect(result).toContain('🌍');
    // Should deduplicate
    expect(result.filter(e => e === '🎉')).toHaveLength(1);
  });

  test('returns empty array for no emojis', () => {
    expect(extractEmojis('hello world')).toEqual([]);
  });
});
