import { Command } from 'commander';
import { GitStatsCommand } from '../commands/git-stats.js';

export function setupChangesCommand(program: Command): void {
  program
    .command('changes')
    .description('Git change analysis and statistics')
    .option('-c, --compact', 'Show only summary statistics')
    .option('-d, --detailed', 'Show detailed file-by-file changes')
    .option('-s, --staged', 'Show only staged changes')
    .option('-u, --unstaged', 'Show only unstaged changes')
    .option('--since <date>', 'Show changes since date (e.g., "1 week ago")')
    .option('--author <name>', 'Filter by author')
    .option('--no-color', 'Disable colored output')
    .action(async () => {
      const command = new GitStatsCommand();
      await command.execute();
    });
}