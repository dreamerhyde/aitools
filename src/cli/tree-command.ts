import { Command } from 'commander';
import { TreeCommand } from '../commands/tree-command.js';
import { UIHelper } from '../utils/ui.js';

export function setupTreeCommand(program: Command): void {
  const tree = program
    .command('tree')
    .description('Display directory tree structure (respects .gitignore by default)')
    .option('-f, --files', 'Show files and directories (default: directories only)')
    .option('-i, --ignore <patterns...>', 'Additional patterns to ignore')
    .option('-p, --path <path>', 'Target path (default: current directory)')
    .option('-d, --depth <number>', 'Maximum depth to traverse', parseInt)
    .option('--no-gitignore', 'Ignore .gitignore file patterns')
    .action(async (options) => {
      try {
        const treeCommand = new TreeCommand();
        await treeCommand.execute({
          filesOnly: options.files,
          addIgnore: options.ignore,
          path: options.path,
          maxDepth: options.depth,
          respectGitignore: options.gitignore !== false
        });
      } catch (error) {
        if (error instanceof Error) {
          UIHelper.showError(error.message);
        }
        process.exit(1);
      }
    });

  // Add files command
  program
    .command('files')
    .description('Display full directory tree with files (respects .gitignore by default)')
    .option('-i, --ignore <patterns...>', 'Additional patterns to ignore')
    .option('-p, --path <path>', 'Target path (default: current directory)')
    .option('-d, --depth <number>', 'Maximum depth to traverse', parseInt)
    .option('--no-gitignore', 'Ignore .gitignore file patterns')
    .action(async (options) => {
      try {
        const treeCommand = new TreeCommand();
        await treeCommand.execute({
          filesOnly: true,
          addIgnore: options.ignore,
          path: options.path,
          maxDepth: options.depth,
          respectGitignore: options.gitignore !== false
        });
      } catch (error) {
        if (error instanceof Error) {
          UIHelper.showError(error.message);
        }
        process.exit(1);
      }
    });
}