import { describe, expect, test } from 'bun:test';
import { formatNumber, formatCost, formatBytes, formatDuration, formatPercent } from '../../src/utils/formatters.js';

describe('formatNumber', () => {
  test('formats integer with locale separators', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  test('handles zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  test('handles small numbers', () => {
    expect(formatNumber(42)).toBe('42');
  });
});

describe('formatCost', () => {
  test('formats cost with dollar sign and 2 decimals', () => {
    expect(formatCost(1.5)).toBe('$1.50');
    expect(formatCost(0)).toBe('$0.00');
    expect(formatCost(100)).toBe('$100.00');
  });

  test('rounds to 2 decimal places', () => {
    expect(formatCost(1.999)).toBe('$2.00');
    expect(formatCost(0.001)).toBe('$0.00');
    expect(formatCost(0.125)).toBe('$0.13');
  });
});

describe('formatBytes', () => {
  test('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  test('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  test('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  test('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
  });

  test('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });
});

describe('formatDuration', () => {
  test('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(0)).toBe('0ms');
  });

  test('formats seconds', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
  });

  test('formats minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
  });

  test('formats hours and minutes', () => {
    expect(formatDuration(3600000)).toBe('1h 0m');
    expect(formatDuration(5400000)).toBe('1h 30m');
  });
});

describe('formatPercent', () => {
  test('formats with default 1 decimal', () => {
    expect(formatPercent(50)).toBe('50.0%');
    expect(formatPercent(99.9)).toBe('99.9%');
  });

  test('formats with custom decimals', () => {
    expect(formatPercent(33.333, 2)).toBe('33.33%');
    expect(formatPercent(100, 0)).toBe('100%');
  });
});
