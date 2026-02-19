import { Command } from 'commander';
import { TreeCommand } from '../commands/tree-command.js';
import { UIHelper } from '../utils/ui.js';

function treeAction(filesOnly: boolean) {
  return async (options: { ignore?: string[]; path?: string; depth?: number; gitignore?: boolean }) => {
    try {
      const treeCommand = new TreeCommand();
      await treeCommand.execute({
        filesOnly,
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
  };
}

function addTreeOptions(cmd: Command): Command {
  return cmd
    .option('-i, --ignore <patterns...>', 'Additional patterns to ignore')
    .option('-p, --path <path>', 'Target path (default: current directory)')
    .option('-d, --depth <number>', 'Maximum depth to traverse', parseInt)
    .option('--no-gitignore', 'Ignore .gitignore file patterns');
}

export function setupTreeCommand(program: Command): void {
  addTreeOptions(
    program
      .command('files')
      .description('Display directory tree with all files')
  ).action(treeAction(true));

  addTreeOptions(
    program
      .command('folders')
      .alias('tree')
      .description('Display directory structure (folders only)')
  ).action(treeAction(false));
}
