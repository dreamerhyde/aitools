import { describe, expect, test } from 'bun:test';
import { deepMerge, processEnvVars } from '../../src/utils/config-manager.js';

describe('deepMerge', () => {
  test('merges flat objects', () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  test('source overrides target', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  test('deeply merges nested objects', () => {
    const target = { nested: { a: 1, b: 2 } };
    const source = { nested: { b: 3, c: 4 } };
    expect(deepMerge(target, source)).toEqual({ nested: { a: 1, b: 3, c: 4 } });
  });

  test('does not merge arrays (replaces)', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3, 4] })).toEqual({ a: [3, 4] });
  });

  test('ignores undefined and null values in source', () => {
    expect(deepMerge({ a: 1, b: 2 }, { a: undefined, b: null })).toEqual({ a: 1, b: 2 });
  });

  test('creates nested key from empty target', () => {
    expect(deepMerge({}, { nested: { a: 1 } })).toEqual({ nested: { a: 1 } });
  });
});

describe('processEnvVars', () => {
  test('resolves env() references from process.env', () => {
    process.env.__TEST_VAR = 'hello';
    const result = processEnvVars({ key: 'env(__TEST_VAR)' });
    expect(result.key).toBe('hello');
    delete process.env.__TEST_VAR;
  });

  test('uses default value when env var missing', () => {
    delete process.env.__MISSING_VAR;
    const result = processEnvVars({ key: 'env(__MISSING_VAR, "fallback")' });
    expect(result.key).toBe('fallback');
  });

  test('returns undefined when no env var and no default', () => {
    delete process.env.__MISSING_VAR;
    const result = processEnvVars({ key: 'env(__MISSING_VAR)' });
    expect(result.key).toBeUndefined();
  });

  test('passes through non-env strings', () => {
    const result = processEnvVars({ key: 'regular value' });
    expect(result.key).toBe('regular value');
  });

  test('recursively processes nested objects', () => {
    process.env.__NESTED_VAR = 'nested_val';
    const result = processEnvVars({
      level1: {
        level2: 'env(__NESTED_VAR)'
      }
    });
    expect(result.level1.level2).toBe('nested_val');
    delete process.env.__NESTED_VAR;
  });

  test('passes through non-string values', () => {
    const result = processEnvVars({ num: 42, bool: true, arr: [1, 2] });
    expect(result).toEqual({ num: 42, bool: true, arr: [1, 2] });
  });
});
