import { Command } from 'commander';
import { CheckCommand } from '../commands/lint-command-impl.js';
import { UIHelper } from '../utils/ui.js';

export function setupLintCommand(program: Command): void {
  program
    .command('lint')
    .description('Run TypeScript and ESLint checks')
    .option('-t, --typescript', 'Run only TypeScript type checking')
    .option('-e, --eslint', 'Run only ESLint checks')
    .option('-b, --build', 'Also test build compilation')
    .option('--fix', 'Auto-fix ESLint issues where possible')
    .option('--json', 'Output results as JSON')
    .option('-q, --quick', 'Quick check mode (less verbose, for hooks)')
    .action(async (options) => {
      try {
        const command = new CheckCommand();
        
        // If no specific check is selected, run both TypeScript and ESLint
        if (!options.typescript && !options.eslint && !options.build) {
          options.typescript = true;
          options.eslint = true;
        }
        
        await command.execute(options);
      } catch (error) {
        if (error instanceof Error) {
          UIHelper.showError(error.message);
        }
        process.exit(1);
      }
    });
}