import { Command } from 'commander';
import { GitStatsCommand } from '../commands/git-stats.js';
import { UIHelper } from '../utils/ui.js';

export function setupGitCommand(program: Command): void {
  const gitCommand = program
    .command('git')
    .alias('g')
    .alias('diff')
    .alias('d')
    .description('Git repository statistics and change analysis');

  // Default git action (show stats)
  gitCommand
    .action(async () => {
      try {
        const gitStats = new GitStatsCommand();
        await gitStats.execute();
      } catch (error) {
        UIHelper.showError(`Git command failed: ${error}`);
        process.exit(1);
      }
    });

  // Future subcommands can be added here
  // gitCommand.command('commit')...
  // gitCommand.command('status')...
}