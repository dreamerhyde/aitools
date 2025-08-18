import { MODEL_PRICING } from '../types/claude-usage.js';

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
  private lastFetch: number = 0;
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 小時快取
  private readonly RATE_LIMIT = 1000; // 1 秒速率限制

  constructor(offline = false) {
    this.offline = offline;
  }

  /**
   * Load pricing data from LiteLLM or fallback to static pricing
   */
  async fetchModelPricing(): Promise<Map<string, ModelPricing>> {
    // 檢查快取是否仍然有效
    const now = Date.now();
    if (this.cachedPricing && (now - this.lastFetch) < this.CACHE_DURATION) {
      return this.cachedPricing;
    }

    // 速率限制檢查
    if ((now - this.lastFetch) < this.RATE_LIMIT) {
      return this.cachedPricing || this.loadStaticPricing();
    }

    if (this.offline) {
      return this.loadStaticPricing();
    }

    try {
      // Silently fetch pricing - no console output during spinner
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 秒超時
      
      const response = await fetch('https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json', {
        headers: {
          'User-Agent': 'aitools-cli/1.0.0'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.warn(`LiteLLM API returned ${response.status}, using static pricing`);
        return this.loadStaticPricing();
      }

      const data = await response.json() as Record<string, any>;
      const pricing = new Map<string, ModelPricing>();

      for (const [modelName, modelData] of Object.entries(data)) {
        if (typeof modelData === 'object' && modelData !== null) {
          pricing.set(modelName, {
            input_cost_per_token: modelData.input_cost_per_token,
            output_cost_per_token: modelData.output_cost_per_token,
            cache_creation_input_token_cost: modelData.cache_creation_input_token_cost,
            cache_read_input_token_cost: modelData.cache_read_input_token_cost,
            max_input_tokens: modelData.max_input_tokens,
            max_tokens: modelData.max_tokens,
          });
        }
      }

      this.cachedPricing = pricing;
      this.lastFetch = now;
      // Silently loaded pricing - no console output
      return pricing;
    } catch (error) {
      // Silently fallback to static pricing
      return this.loadStaticPricing();
    }
  }

  /**
   * Load static pricing as fallback
   */
  private loadStaticPricing(): Map<string, ModelPricing> {
    // Using static pricing fallback
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
    this.lastFetch = Date.now();
    // Loaded static model prices
    return pricing;
  }

  /**
   * Get pricing for a specific model with fallback matching
   */
  async getModelPricing(modelName: string): Promise<ModelPricing | null> {
    const pricing = await this.fetchModelPricing();

    // Direct match
    const directMatch = pricing.get(modelName);
    if (directMatch) {
      return directMatch;
    }

    // Try with provider prefix variations for Claude models
    const variations = [
      modelName,
      `anthropic/${modelName}`,
      `claude-4-${modelName}`,
      `claude-${modelName}`,
      `claude-3-5-${modelName}`,
      `claude-3-${modelName}`,
      // LiteLLM 中的實際 Claude 4 模型名稱（優先匹配）
      'claude-4-sonnet-20250514',
      'claude-4-opus-20250514',
      // Claude 3.x 模型名稱
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ];

    for (const variant of variations) {
      const match = pricing.get(variant);
      if (match) {
        return match;
      }
    }

    // Try partial matching for Claude models
    const lowerModel = modelName.toLowerCase();
    for (const [key, value] of pricing) {
      const lowerKey = key.toLowerCase();
      if (
        (lowerModel.includes('opus') && lowerKey.includes('opus')) ||
        (lowerModel.includes('sonnet') && lowerKey.includes('sonnet')) ||
        (lowerModel.includes('haiku') && lowerKey.includes('haiku'))
      ) {
        // Further check for version compatibility
        if (
          (lowerModel.includes('4') && lowerKey.includes('4')) ||
          (lowerModel.includes('3.5') && lowerKey.includes('3.5')) ||
          (lowerModel.includes('3-5') && lowerKey.includes('3-5'))
        ) {
          return value;
        }
      }
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