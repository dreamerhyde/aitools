import { describe, expect, test } from 'bun:test';
import { sanitizeText, formatActionString, sanitizeTopic } from '../../src/utils/text-sanitizer.js';

describe('sanitizeText', () => {
  test('converts known emojis to ASCII', () => {
    expect(sanitizeText('✅ Done')).toBe('✓ Done');
    expect(sanitizeText('❌ Failed')).toBe('✗ Failed');
  });

  test('removes decorative emojis', () => {
    const result = sanitizeText('Hello 🎉 World');
    expect(result).not.toContain('🎉');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  test('collapses whitespace by default', () => {
    expect(sanitizeText('  hello   world  ')).toBe('hello world');
  });

  test('preserves whitespace when option set', () => {
    const result = sanitizeText('  hello   world  ', { preserveWhitespace: true });
    expect(result).toBe('  hello   world  ');
  });

  test('applies maxLength truncation', () => {
    const long = 'a'.repeat(200);
    const result = sanitizeText(long, { maxLength: 50 });
    expect(result.length).toBeLessThanOrEqual(53); // 50 + "..."
  });

  test('skips emoji removal when disabled', () => {
    const result = sanitizeText('Hello ✅', { removeEmojis: false, convertToAscii: false });
    expect(result).toBe('Hello ✅');
  });
});

describe('formatActionString', () => {
  test('maps known actions', () => {
    expect(formatActionString('Thinking')).toBe('Thinking...');
    expect(formatActionString('Reading file')).toBe('Reading file...');
  });

  test('adds dots to -ing words', () => {
    const result = formatActionString('Processing');
    expect(result).toContain('...');
  });

  test('does not double-add dots', () => {
    const result = formatActionString('Loading...');
    expect(result).not.toContain('......');
  });
});

describe('sanitizeTopic', () => {
  test('sanitizes and truncates topic', () => {
    const result = sanitizeTopic('🚀 Launch the new feature', 20);
    expect(result).not.toContain('🚀');
    expect(result.length).toBeLessThanOrEqual(23); // 20 + "..."
  });

  test('uses default maxLength of 100', () => {
    const long = 'a'.repeat(200);
    const result = sanitizeTopic(long);
    expect(result.length).toBeLessThanOrEqual(103);
  });
});
