import { Command } from 'commander';
import { ClaudeUsageCommand } from '../commands/claude-usage.js';

export function setupCostCommand(program: Command) {
  const cost = program
    .command('cost')
    .description('Claude Code 30-day cost trend and analysis')
    .option('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .option('--path <path>', 'Custom log directory path')
    .option('--timezone <tz>', 'Timezone for date grouping (e.g., UTC, America/New_York)', 'system')
    .option('--offline', 'Use static pricing instead of fetching from LiteLLM')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      // Default to showing last 30 days with chart and summary
      if (!options.from && !options.to) {
        const today = new Date();
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000); // Add one day to include full today
        options.from = monthAgo.toISOString().split('T')[0];
        options.to = tomorrow.toISOString().split('T')[0];
      }
      
      const timezone = options.timezone === 'system' ? undefined : options.timezone;
      const useDynamicPricing = !options.offline;
      const command = new ClaudeUsageCommand(options.path, timezone, useDynamicPricing);
      
      // Show trend chart and summary (no detailed table by default)
      await command.execute({
        ...options,
        daily: true,
        showDetail: false
      });
    });

  // Subcommand for detailed table
  cost
    .command('detail')
    .description('Show detailed daily cost table')
    .option('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .option('--path <path>', 'Custom log directory path')
    .option('--timezone <tz>', 'Timezone for date grouping', 'system')
    .option('--offline', 'Use static pricing')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      // Default to last 30 days
      if (!options.from && !options.to) {
        const today = new Date();
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000); // Add one day to include full today
        options.from = monthAgo.toISOString().split('T')[0];
        options.to = tomorrow.toISOString().split('T')[0];
      }
      
      const timezone = options.timezone === 'system' ? undefined : options.timezone;
      const useDynamicPricing = !options.offline;
      const command = new ClaudeUsageCommand(options.path, timezone, useDynamicPricing);
      
      // Show detailed table
      await command.execute({
        ...options,
        daily: true,
        showDetail: true
      });
    });
}