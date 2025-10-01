import { MODEL_PRICING } from '../types/claude-usage.js';
import { PricingCache } from './pricing-cache.js';

export interface ModelPricing {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  max_input_tokens?: number;
  max_tokens?: number;
}

export class PricingFetcher {
  private cachedPricing: Map<string, ModelPricing> | null = null;
  private readonly offline: boolean;
  private pricingCache: PricingCache;

  constructor(offline = false) {
    this.offline = offline;
    this.pricingCache = new PricingCache();
  }

  /**
   * Load pricing data using the 24-hour cache system
   */
  async fetchModelPricing(): Promise<Map<string, ModelPricing>> {
    // Return cached pricing if already loaded in memory
    if (this.cachedPricing) {
      return this.cachedPricing;
    }

    if (this.offline) {
      return this.loadStaticPricing();
    }

    try {
      // Use the 24-hour cache system
      const rawData = await this.pricingCache.getPricingData();
      // LiteLLM cache has structure: { timestamp, data: { model_name: pricing } }
      const data = rawData.data || rawData; // Support both formats
      const pricing = new Map<string, ModelPricing>();

      for (const [modelName, modelData] of Object.entries(data)) {
        if (typeof modelData === 'object' && modelData !== null) {
          const typedModelData = modelData as ModelPricing;
          pricing.set(modelName, {
            input_cost_per_token: typedModelData.input_cost_per_token,
            output_cost_per_token: typedModelData.output_cost_per_token,
            cache_creation_input_token_cost: typedModelData.cache_creation_input_token_cost,
            cache_read_input_token_cost: typedModelData.cache_read_input_token_cost,
            max_input_tokens: typedModelData.max_input_tokens,
            max_tokens: typedModelData.max_tokens,
          });
        }
      }

      this.cachedPricing = pricing;
      return pricing;
    } catch (error) {
      // Fallback to static pricing if cache system fails
      console.warn('Failed to load pricing from cache, using static pricing');
      return this.loadStaticPricing();
    }
  }

  /**
   * Load static pricing as fallback
   */
  private loadStaticPricing(): Map<string, ModelPricing> {
    const pricing = new Map<string, ModelPricing>();
    
    for (const [modelName, modelPricing] of Object.entries(MODEL_PRICING)) {
      pricing.set(modelName, {
        input_cost_per_token: modelPricing.input / 1_000_000,
        output_cost_per_token: modelPricing.output / 1_000_000,
        cache_creation_input_token_cost: modelPricing.cache_creation / 1_000_000,
        cache_read_input_token_cost: modelPricing.cache_read / 1_000_000,
      });
    }

    this.cachedPricing = pricing;
    return pricing;
  }

  /**
   * Get pricing for a specific model with intelligent fallback matching
   */
  async getModelPricing(modelName: string): Promise<ModelPricing | null> {
    const pricing = await this.fetchModelPricing();

    // Direct match
    const directMatch = pricing.get(modelName);
    if (directMatch) {
      return directMatch;
    }

    // Normalize the model name by removing date stamps and version suffixes
    const normalizedModel = this.normalizeModelName(modelName);
    const normalizedMatch = pricing.get(normalizedModel);
    if (normalizedMatch) {
      return normalizedMatch;
    }

    // Try common LiteLLM variations
    const variations = this.generateModelVariations(modelName);
    for (const variant of variations) {
      const match = pricing.get(variant);
      if (match) {
        return match;
      }
    }

    // Intelligent fuzzy matching for Claude models
    return this.findBestFuzzyMatch(modelName, pricing);
  }

  /**
   * Normalize model names by removing only date stamps (8 digits at end)
   * Preserves version numbers like -4-5 or -4-1
   */
  private normalizeModelName(modelName: string): string {
    return modelName.replace(/-\d{8}$/, ''); // Remove only date stamps like -20250805
  }

  /**
   * Generate common model name variations for LiteLLM
   */
  private generateModelVariations(modelName: string): string[] {
    const lowerModel = modelName.toLowerCase();
    const variations: string[] = [];

    // Add anthropic prefix variations
    variations.push(`anthropic/${modelName}`);

    // Handle Claude 4 Sonnet variations (should try exact match first via normalize)
    // Only add Sonnet 4.5 if it's actually a Sonnet 4.5 model
    if (lowerModel.includes('claude-sonnet-4-5')) {
      variations.push(
        'claude-sonnet-4-5',  // Try without date stamp
        'anthropic/claude-sonnet-4-5'
      );
    }

    // Handle Claude 4 Sonnet (non-4.5 versions)
    if (lowerModel.includes('claude-sonnet-4') && !lowerModel.includes('4-5')) {
      variations.push(
        'claude-sonnet-4-20250514',   // Common Sonnet 4 version
        'anthropic/claude-sonnet-4-20250514'
      );
    }

    // Handle new Claude 4 Opus format: claude-opus-4-1-20250805
    if (lowerModel.includes('claude-opus-4')) {
      variations.push(
        'claude-opus-4-1-20250805',   // Try common Opus 4.1 version
        'anthropic/claude-opus-4-1-20250805'
      );
    }

    // Legacy Claude 3 fallbacks - only as last resort
    if (lowerModel.includes('opus') && !lowerModel.includes('4')) {
      variations.push(
        'claude-3-opus-20240229',
        'anthropic/claude-3-opus-20240229'
      );
    }

    if (lowerModel.includes('sonnet') && !lowerModel.includes('4')) {
      variations.push(
        'claude-3-5-sonnet-20241022',
        'anthropic/claude-3-5-sonnet-20241022'
      );
    }

    if (lowerModel.includes('haiku')) {
      variations.push(
        'claude-3-5-haiku-20241022',
        'anthropic/claude-3-5-haiku-20241022'
      );
    }

    return variations;
  }

  /**
   * Find the best fuzzy match based on model characteristics
   */
  private findBestFuzzyMatch(modelName: string, pricing: Map<string, ModelPricing>): ModelPricing | null {
    const lowerModel = modelName.toLowerCase();
    
    // Create scoring system for matches
    const candidates: Array<{ key: string; value: ModelPricing; score: number }> = [];

    for (const [key, value] of pricing) {
      const lowerKey = key.toLowerCase();
      let score = 0;

      // Model type matching (highest priority)
      if (lowerModel.includes('opus') && lowerKey.includes('opus')) score += 100;
      if (lowerModel.includes('sonnet') && lowerKey.includes('sonnet')) score += 100;
      if (lowerModel.includes('haiku') && lowerKey.includes('haiku')) score += 100;

      // Version matching (high priority)
      if (lowerModel.includes('4') && lowerKey.includes('4')) score += 50;
      if (lowerModel.includes('3.5') && lowerKey.includes('3.5')) score += 45;
      if (lowerModel.includes('3-5') && lowerKey.includes('3-5')) score += 45;
      if (lowerModel.includes('3') && lowerKey.includes('3')) score += 40;

      // Claude brand matching (medium priority)
      if (lowerModel.includes('claude') && lowerKey.includes('claude')) score += 20;
      if (lowerKey.includes('anthropic')) score += 10;

      // Only consider candidates with meaningful similarity
      if (score >= 100) {
        candidates.push({ key, value, score });
      }
    }

    // Return the highest scoring match
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].value;
    }

    return null;
  }

  /**
   * Calculate cost from token usage and model name
   */
  async calculateCostFromTokens(
    tokens: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    },
    modelName: string,
  ): Promise<number> {
    const pricing = await this.getModelPricing(modelName);
    
    if (!pricing) {
      // Fallback to static pricing calculation
      const staticPricing = MODEL_PRICING['sonnet-4']; // Default fallback
      return this.calculateCostFromStaticPricing(tokens, staticPricing);
    }

    return this.calculateCostFromPricing(tokens, pricing);
  }

  /**
   * Calculate cost from pricing information
   */
  calculateCostFromPricing(
    tokens: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    },
    pricing: ModelPricing,
  ): number {
    let cost = 0;

    if (pricing.input_cost_per_token) {
      cost += tokens.input_tokens * pricing.input_cost_per_token;
    }

    if (pricing.output_cost_per_token) {
      cost += tokens.output_tokens * pricing.output_cost_per_token;
    }

    if (tokens.cache_creation_input_tokens && pricing.cache_creation_input_token_cost) {
      cost += tokens.cache_creation_input_tokens * pricing.cache_creation_input_token_cost;
    }

    if (tokens.cache_read_input_tokens && pricing.cache_read_input_token_cost) {
      cost += tokens.cache_read_input_tokens * pricing.cache_read_input_token_cost;
    }

    return cost;
  }

  /**
   * Calculate cost using static pricing (fallback)
   */
  private calculateCostFromStaticPricing(
    tokens: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    },
    pricing: any,
  ): number {
    const inputCost = (tokens.input_tokens / 1_000_000) * pricing.input;
    const outputCost = (tokens.output_tokens / 1_000_000) * pricing.output;
    const cacheCreationCost = ((tokens.cache_creation_input_tokens || 0) / 1_000_000) * pricing.cache_creation;
    const cacheReadCost = ((tokens.cache_read_input_tokens || 0) / 1_000_000) * pricing.cache_read;

    return inputCost + outputCost + cacheCreationCost + cacheReadCost;
  }
}