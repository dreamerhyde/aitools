import { describe, expect, test } from 'bun:test';
import { isLikelyHook, parseProcessStatus, parseElapsedSeconds } from '../../src/utils/process-monitor.js';

describe('isLikelyHook', () => {
  test('detects hook-related commands', () => {
    expect(isLikelyHook('bash .claude/hooks/pre-commit.sh')).toBe(true);
    expect(isLikelyHook('/usr/bin/git hook run')).toBe(true);
    expect(isLikelyHook('node pre-commit')).toBe(true);
    expect(isLikelyHook('npx husky run')).toBe(true);
    expect(isLikelyHook('npx lint-staged')).toBe(true);
  });

  test('excludes aitools itself', () => {
    expect(isLikelyHook('node aitools/dist/cli.js')).toBe(false);
    expect(isLikelyHook('ai ps hooks')).toBe(false);
    expect(isLikelyHook('ai process hooks')).toBe(false);
  });

  test('returns false for non-hook commands', () => {
    expect(isLikelyHook('node server.js')).toBe(false);
    expect(isLikelyHook('python main.py')).toBe(false);
    expect(isLikelyHook('/usr/bin/bash')).toBe(false);
  });
});

describe('parseProcessStatus', () => {
  test('maps R to running', () => {
    expect(parseProcessStatus('R')).toBe('running');
    expect(parseProcessStatus('R+')).toBe('running');
  });

  test('maps S to sleeping', () => {
    expect(parseProcessStatus('S')).toBe('sleeping');
    expect(parseProcessStatus('Ss')).toBe('sleeping');
  });

  test('maps Z to zombie', () => {
    expect(parseProcessStatus('Z')).toBe('zombie');
  });

  test('maps T to stopped', () => {
    expect(parseProcessStatus('T')).toBe('stopped');
  });

  test('defaults to running for unknown', () => {
    expect(parseProcessStatus('X')).toBe('running');
  });
});

describe('parseElapsedSeconds', () => {
  test('parses MM:SS format', () => {
    expect(parseElapsedSeconds('05:30')).toBe(330);
    expect(parseElapsedSeconds('00:01')).toBe(1);
  });

  test('parses HH:MM:SS format', () => {
    expect(parseElapsedSeconds('01:30:00')).toBe(5400);
    expect(parseElapsedSeconds('00:05:30')).toBe(330);
  });

  test('parses DD-HH:MM:SS format', () => {
    expect(parseElapsedSeconds('1-00:00:00')).toBe(86400);
    expect(parseElapsedSeconds('2-12:30:45')).toBe(2 * 86400 + 12 * 3600 + 30 * 60 + 45);
  });

  test('returns 0 for empty or invalid input', () => {
    expect(parseElapsedSeconds('')).toBe(0);
  });
});
