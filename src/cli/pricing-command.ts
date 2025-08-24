import { Command } from 'commander';
import { PricingCommand } from '../commands/pricing-command.js';

export function setupPricingCommand(program: Command) {
  const pricingCommand = program
    .command('pricing')
    .description('Manage model pricing cache')
    .option('--refresh', 'Force refresh pricing cache')
    .option('--clear', 'Clear pricing cache')
    .option('--info', 'Show cache information (default)')
    .option('--test <model>', 'Test pricing for a specific model')
    .action(async (options) => {
      const cmd = new PricingCommand();
      await cmd.execute(options);
    });

  return pricingCommand;
}