import { Command } from 'commander';
import { ClaudeUsageCommand } from '../commands/claude-usage.js';

export function setupUsageCommand(program: Command) {
  const usage = program
    .command('usage')
    .alias('cost')
    .description('Analyze Claude usage and costs from logs')
    .option('-d, --daily', 'Show daily usage breakdown')
    .option('-m, --monthly', 'Show monthly aggregated costs')
    .option('-s, --session', 'Analyze by conversation session')
    .option('-b, --blocks', 'Show 5-hour billing blocks')
    .option('--live', 'Live monitoring mode (with --blocks)')
    .option('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .option('--path <path>', 'Custom log directory path')
    .option('--timezone <tz>', 'Timezone for date grouping (e.g., UTC, America/New_York)', 'system')
    .option('--offline', 'Use static pricing instead of fetching from LiteLLM')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      // If no options specified, default to showing last 30 days with chart and summary only
      if (!options.daily && !options.monthly && !options.session && !options.blocks && !options.from && !options.to) {
        const today = new Date();
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        options.from = monthAgo.toISOString().split('T')[0];
        options.daily = true;
        options.showDetail = false; // Show chart and summary only, no table
      }
      
      const timezone = options.timezone === 'system' ? undefined : options.timezone;
      const useDynamicPricing = !options.offline;
      const command = new ClaudeUsageCommand(options.path, timezone, useDynamicPricing);
      await command.execute(options);
    });

  // Quick access subcommands
  usage
    .command('detail')
    .description('Show detailed daily usage table')
    .action(async () => {
      const command = new ClaudeUsageCommand();
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await command.execute({ 
        from: monthAgo.toISOString().split('T')[0],
        daily: true,
        showDetail: true
      });
    });

  usage
    .command('today')
    .description('Show today\'s usage')
    .action(async () => {
      const command = new ClaudeUsageCommand();
      const today = new Date().toISOString().split('T')[0];
      await command.execute({ from: today, daily: true });
    });

  usage
    .command('week')
    .description('Show this week\'s usage')
    .action(async () => {
      const command = new ClaudeUsageCommand();
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      await command.execute({ 
        from: weekAgo.toISOString().split('T')[0],
        daily: true 
      });
    });

  usage
    .command('month')
    .description('Show this month\'s usage')
    .action(async () => {
      const command = new ClaudeUsageCommand();
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      await command.execute({ 
        from: firstDay.toISOString().split('T')[0],
        monthly: true 
      });
    });

  usage
    .command('live')
    .description('Start live usage monitoring')
    .action(async () => {
      const command = new ClaudeUsageCommand();
      await command.execute({ blocks: true, live: true });
    });

  usage
    .command('pricing-info')
    .description('Show information about pricing sources and LiteLLM integration')
    .action(async () => {
      console.log(`
📊 aitools 使用成本計算

🌐 動態定價 (預設)
• 資料來源：LiteLLM (https://litellm.ai)
• 模型數量：1300+ 個最新模型
• 更新頻率：即時從 GitHub 獲取
• 準確性：★★★★★ (反映最新官方定價)

💾 靜態定價 (--offline)
• 資料來源：內建定價表
• 模型數量：主要 Claude 模型
• 更新頻率：手動更新
• 準確性：★★★☆☆ (可能過期)

🔄 使用方式
• aitools usage --daily           # 使用 LiteLLM 動態定價
• aitools usage --daily --offline # 使用靜態定價
• aitools usage models --search claude # 查看 Claude 模型定價

ℹ️ LiteLLM 是免費開源項目，我們僅使用其公開的定價資料 API
`);
    });

  usage
    .command('models')
    .description('Show available models and pricing from LiteLLM')
    .option('--search <pattern>', 'Search for specific model names')
    .action(async (options) => {
      const { PricingFetcher } = await import('../utils/pricing-fetcher.js');
      const fetcher = new PricingFetcher(false);
      
      try {
        console.log('🔍 Fetching model pricing from LiteLLM...');
        const pricing = await fetcher.fetchModelPricing();
        
        let models = Array.from(pricing.keys());
        
        if (options.search) {
          const searchPattern = options.search.toLowerCase();
          models = models.filter(name => 
            name.toLowerCase().includes(searchPattern)
          );
        }
        
        console.log(`\n📊 Found ${models.length} models${options.search ? ` matching "${options.search}"` : ''}:`);
        
        models.slice(0, 50).forEach(modelName => {
          const modelPricing = pricing.get(modelName);
          if (modelPricing) {
            const input = modelPricing.input_cost_per_token ? 
              (modelPricing.input_cost_per_token * 1_000_000).toFixed(2) : 'N/A';
            const output = modelPricing.output_cost_per_token ? 
              (modelPricing.output_cost_per_token * 1_000_000).toFixed(2) : 'N/A';
            console.log(`  ${modelName}: $${input}/$${output} per 1M tokens`);
          }
        });
        
        if (models.length > 50) {
          console.log(`  ... and ${models.length - 50} more models`);
        }
      } catch (error) {
        console.error('❌ Failed to fetch model pricing:', error);
      }
    });
}