import { describe, expect, test } from 'bun:test';
import { normalizeModelName, generateModelVariations, PricingFetcher } from '../../src/utils/pricing-fetcher.js';

describe('normalizeModelName', () => {
  test('removes date stamps', () => {
    expect(normalizeModelName('claude-sonnet-4-5-20250514')).toBe('claude-sonnet-4-5');
    expect(normalizeModelName('claude-opus-4-1-20250805')).toBe('claude-opus-4-1');
  });

  test('preserves version numbers', () => {
    expect(normalizeModelName('claude-sonnet-4-5')).toBe('claude-sonnet-4-5');
    expect(normalizeModelName('claude-opus-4-1')).toBe('claude-opus-4-1');
  });

  test('returns unchanged if no date stamp', () => {
    expect(normalizeModelName('gpt-4')).toBe('gpt-4');
  });
});

describe('generateModelVariations', () => {
  test('always adds anthropic prefix', () => {
    const variations = generateModelVariations('claude-sonnet-4');
    expect(variations).toContain('anthropic/claude-sonnet-4');
  });

  test('generates sonnet 4 variations', () => {
    const variations = generateModelVariations('claude-sonnet-4-20250514');
    expect(variations).toContain('claude-sonnet-4-20250514');
    expect(variations).toContain('anthropic/claude-sonnet-4-20250514');
  });

  test('generates opus 4 variations', () => {
    const variations = generateModelVariations('claude-opus-4-1-20250805');
    expect(variations).toContain('claude-opus-4-1-20250805');
  });

  test('generates haiku variations', () => {
    const variations = generateModelVariations('claude-haiku');
    expect(variations).toContain('claude-3-5-haiku-20241022');
  });

  test('generates sonnet 4.5 variations', () => {
    const variations = generateModelVariations('claude-sonnet-4-5-20250514');
    expect(variations).toContain('claude-sonnet-4-5');
    expect(variations).toContain('anthropic/claude-sonnet-4-5');
  });
});

describe('PricingFetcher.calculateCostFromPricing', () => {
  const fetcher = new PricingFetcher(true); // offline mode

  test('calculates cost from token counts', () => {
    const cost = fetcher.calculateCostFromPricing(
      { input_tokens: 1000, output_tokens: 500 },
      { input_cost_per_token: 0.003, output_cost_per_token: 0.015 }
    );
    expect(cost).toBeCloseTo(1000 * 0.003 + 500 * 0.015);
  });

  test('includes cache costs when provided', () => {
    const cost = fetcher.calculateCostFromPricing(
      {
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 100
      },
      {
        input_cost_per_token: 0.003,
        output_cost_per_token: 0.015,
        cache_creation_input_token_cost: 0.001,
        cache_read_input_token_cost: 0.0005
      }
    );
    expect(cost).toBeCloseTo(
      1000 * 0.003 + 500 * 0.015 + 200 * 0.001 + 100 * 0.0005
    );
  });

  test('handles zero tokens', () => {
    const cost = fetcher.calculateCostFromPricing(
      { input_tokens: 0, output_tokens: 0 },
      { input_cost_per_token: 0.003, output_cost_per_token: 0.015 }
    );
    expect(cost).toBe(0);
  });

  test('handles missing pricing fields', () => {
    const cost = fetcher.calculateCostFromPricing(
      { input_tokens: 1000, output_tokens: 500 },
      {}
    );
    expect(cost).toBe(0);
  });
});
