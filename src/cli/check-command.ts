import { Command } from 'commander';
import { CheckCommand } from '../commands/check-command-v2.js';

export function setupCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Run code quality checks (TypeScript, ESLint, Build)')
    .option('-t, --typescript', 'Run TypeScript type check only')
    .option('-e, --eslint', 'Run ESLint check only')
    .option('-a, --all', 'Run all available checks (default)')
    .option('-f, --fix', 'Automatically fix ESLint issues where possible')
    .action(async (options) => {
      const checker = new CheckCommand();
      await checker.execute(options);
    });
}