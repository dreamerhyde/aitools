#!/usr/bin/env node

import { Command } from 'commander';
import { setupBasicCommands } from './cli/basic-commands.js';
import { setupHooksCommand } from './cli/hooks-command.js';
import { setupPsCommand } from './cli/ps-command.js';
import { setupGitCommand } from './cli/git-command.js';
import { setupUsageCommand } from './cli/usage-command.js';
import { setupCompletionCommand } from './cli/completion-command.js';
import { setupCheckCommand } from './cli/check-command.js';
import { setupTreeCommand } from './cli/tree-command.js';
import { AutoUpdateChecker } from './utils/auto-update.js';
import { UIHelper } from './utils/ui.js';
import { HelpFormatter } from './utils/help-formatter.js';

const program = new Command();

// Check for updates in background (non-blocking)
AutoUpdateChecker.checkInBackground();

program
  .name('aitools')
  .description('Vibe Coding Toolkit - Keep your AI-assisted development flow smooth')
  .version('1.0.0')
  .configureHelp({
    formatHelp: () => HelpFormatter.formatRootHelpAligned(program)
  });

// Setup all commands using the extracted modules
setupHooksCommand(program);
setupPsCommand(program);
setupGitCommand(program);
setupUsageCommand(program);
setupCompletionCommand(program);
setupCheckCommand(program);
setupTreeCommand(program);
setupBasicCommands(program);

// Help command with examples
program
  .command('help [command]')
  .description('Show help for a specific command')
  .action((cmdName) => {
    if (cmdName) {
      const cmd = program.commands.find(c => c.name() === cmdName || c.aliases().includes(cmdName));
      if (cmd) {
        cmd.outputHelp();
      } else {
        UIHelper.showError(`Unknown command: ${cmdName}`);
        console.log('\nAvailable commands: ' + program.commands.map(c => c.name()).join(', '));
      }
    } else {
      console.log(HelpFormatter.formatRootHelpAligned(program));
    }
  });

// Error handling
program.on('command:*', () => {
  UIHelper.showError(`Unknown command: ${program.args.join(' ')}`);
  console.log('\nUse "aitools help" to see available commands');
  process.exit(1);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  UIHelper.showError(`Unhandled error: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  UIHelper.showError(`Unhandled Promise rejection: ${reason}`);
  process.exit(1);
});

// If no arguments provided, show help and exit with success
if (process.argv.length === 2) {
  console.log(HelpFormatter.formatRootHelpAligned(program));
  process.exit(0);
}

// Parse command line arguments
program.parse();