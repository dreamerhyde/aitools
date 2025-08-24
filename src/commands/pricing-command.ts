import { PricingCache } from '../utils/pricing-cache.js';
import { PricingFetcher } from '../utils/pricing-fetcher.js';
import chalk from 'chalk';

export class PricingCommand {
  private pricingCache: PricingCache;
  private pricingFetcher: PricingFetcher;

  constructor() {
    this.pricingCache = new PricingCache();
    this.pricingFetcher = new PricingFetcher();
  }

  async execute(options: any): Promise<void> {
    if (options.refresh) {
      await this.refreshCache();
    } else if (options.clear) {
      await this.clearCache();
    } else if (options.info) {
      await this.showCacheInfo();
    } else if (options.test) {
      await this.testModelPricing(options.test);
    } else {
      await this.showCacheInfo();
    }
  }

  private async refreshCache(): Promise<void> {
    console.log(chalk.yellow('Refreshing pricing cache...'));
    try {
      await this.pricingCache.refreshCache();
      console.log(chalk.green('✓ Pricing cache refreshed successfully'));
    } catch (error: any) {
      console.error(chalk.red('✗ Failed to refresh cache:'), error.message);
      process.exit(1);
    }
  }

  private async clearCache(): Promise<void> {
    console.log(chalk.yellow('Clearing pricing cache...'));
    this.pricingCache.clearCache();
    console.log(chalk.green('✓ Pricing cache cleared'));
  }

  private async showCacheInfo(): Promise<void> {
    console.log(chalk.bold('Pricing Cache Information'));
    console.log('─'.repeat(50));

    const info = this.pricingCache.getCacheInfo();
    
    if (!info.exists) {
      console.log(chalk.yellow('No pricing cache found'));
      console.log(chalk.gray('Run with --refresh to create initial cache'));
      return;
    }

    console.log(`Status: ${chalk.green('Cached')}`);
    console.log(`Age: ${chalk.cyan(info.age!)}`);
    console.log(`Size: ${chalk.cyan(info.size!)}`);
    console.log(`Location: ${chalk.gray('~/.aitools/model_pricing.json')}`);
    
    // Show next refresh time
    const maxAge = '24h 0m';
    console.log(`Next refresh: ${chalk.gray('in ' + this.calculateTimeUntilRefresh(info.age!))}`);
    console.log(`Cache duration: ${chalk.gray(maxAge)}`);
  }

  private async testModelPricing(modelName: string): Promise<void> {
    console.log(chalk.bold(`Testing Model Pricing: ${modelName}`));
    console.log('─'.repeat(50));

    try {
      const pricing = await this.pricingFetcher.getModelPricing(modelName);
      
      if (!pricing) {
        console.log(chalk.red('✗ No pricing found for model'));
        return;
      }

      console.log(chalk.green('✓ Pricing found:'));
      console.log(`Input: ${chalk.cyan(`$${(pricing.input_cost_per_token || 0).toFixed(8)}`)} per token`);
      console.log(`Output: ${chalk.cyan(`$${(pricing.output_cost_per_token || 0).toFixed(8)}`)} per token`);
      
      if (pricing.cache_creation_input_token_cost) {
        console.log(`Cache Creation: ${chalk.cyan(`$${pricing.cache_creation_input_token_cost.toFixed(8)}`)} per token`);
      }
      
      if (pricing.cache_read_input_token_cost) {
        console.log(`Cache Read: ${chalk.cyan(`$${pricing.cache_read_input_token_cost.toFixed(8)}`)} per token`);
      }

      // Test cost calculation
      console.log('\n' + chalk.bold('Sample Cost Calculation:'));
      const sampleTokens = {
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_input_tokens: 2000,
        cache_read_input_tokens: 5000,
      };

      const cost = await this.pricingFetcher.calculateCostFromTokens(sampleTokens, modelName);
      console.log(`1K input + 500 output + 2K cache create + 5K cache read = ${chalk.green(`$${cost.toFixed(4)}`)}`);

    } catch (error: any) {
      console.error(chalk.red('✗ Error testing model pricing:'), error.message);
    }
  }

  private calculateTimeUntilRefresh(currentAge: string): string {
    // Parse current age (e.g., "5h 30m")
    const match = currentAge.match(/(\d+)h (\d+)m/);
    if (!match) return 'unknown';

    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const totalMinutes = hours * 60 + minutes;
    const remaining = (24 * 60) - totalMinutes;

    if (remaining <= 0) return 'now (overdue)';

    const remainingHours = Math.floor(remaining / 60);
    const remainingMinutes = remaining % 60;

    return `${remainingHours}h ${remainingMinutes}m`;
  }
}