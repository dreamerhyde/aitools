import { Command } from 'commander';
import { LinesCommand } from '../commands/lines-command.js';

export function setupLinesCommand(program: Command): void {
  program
    .command('lines')
    .description('Check files exceeding line limit (default: 500 lines)')
    .option('-l, --limit <number>', 'Custom line limit', parseInt)
    .option('-a, --all', 'Show all files, not just those exceeding limit')
    .option('--json', 'Output as JSON for AI processing')
    .option('-p, --path <path>', 'Target path to check')
    .option('-c, --check', 'Quick check mode (less verbose, for hooks)')
    .action(async (options) => {
      const command = new LinesCommand();
      await command.execute(options);
    });
}