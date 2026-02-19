import { describe, expect, test } from 'bun:test';
import { isNewerVersion, compareVersions } from '../../src/utils/version.js';

describe('compareVersions', () => {
  test('returns 1 when v1 > v2', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
  });

  test('returns -1 when v1 < v2', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });

  test('returns 0 when versions are equal', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.0.0', '0.0.0')).toBe(0);
  });

  test('handles different segment lengths', () => {
    expect(compareVersions('1.0.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });

  test('handles large version numbers', () => {
    expect(compareVersions('10.20.30', '10.20.29')).toBe(1);
  });
});

describe('isNewerVersion', () => {
  test('returns true when latest > current', () => {
    expect(isNewerVersion('1.1.0', '1.0.0')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
  });

  test('returns false when latest <= current', () => {
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false);
    expect(isNewerVersion('0.9.0', '1.0.0')).toBe(false);
  });
});
