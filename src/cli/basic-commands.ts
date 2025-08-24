import { Command } from 'commander';
import chalk from 'chalk';
import { UpgradeCommand } from '../commands/upgrade.js';
import { UIHelper } from '../utils/ui.js';
import { AutoUpdateChecker } from '../utils/auto-update.js';

export function setupBasicCommands(program: Command): void {

  // Upgrade command - Self-update functionality
  program
    .command('upgrade')
    .alias('update')
    .description('Upgrade AI Tools to the latest version')
    .option('--check', 'Only check for updates without installing')
    .option('--force', 'Force upgrade even if on latest version')
    .option('--channel <channel>', 'Update channel (stable|beta|canary)', 'stable')
    .action(async (options) => {
      try {
        const upgrade = new UpgradeCommand();
        await upgrade.execute(options);
      } catch (error) {
        UIHelper.showError(`Upgrade failed: ${error}`);
        process.exit(1);
      }
    });

}