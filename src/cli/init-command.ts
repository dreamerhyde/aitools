import { Command } from 'commander';
import { InitCommand } from '../commands/init-command.js';

export function setupInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize AI Tools configuration (.aitools/config.toml)')
    .option('-g, --global', 'Create global configuration instead of project-level')
    .option('-f, --force', 'Overwrite existing configuration')
    .option('-y, --yes', 'Use all default values (non-interactive)')
    .action(async (options) => {
      const command = new InitCommand();
      await command.execute(options);
    });
}