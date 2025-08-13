#!/usr/bin/env node

import { Command } from 'commander';
import { setupBasicCommands } from './cli/basic-commands.js';
import { setupHooksCommand } from './cli/hooks-command.js';
import { setupPsCommand } from './cli/ps-command.js';
import { setupGitCommand } from './cli/git-command.js';
import { AutoUpdateChecker } from './utils/auto-update.js';
import { UIHelper } from './utils/ui.js';

const program = new Command();

// Check for updates in background (non-blocking)
AutoUpdateChecker.checkInBackground();

program
  .name('aitools')
  .description('Vibe Coding Toolkit - Keep your AI-assisted development flow smooth')
  .version('1.0.0');

// Setup all commands using the extracted modules
setupHooksCommand(program);
setupPsCommand(program);
setupGitCommand(program);
setupBasicCommands(program);

// Help command with examples
program
  .command('help [command]')
  .description('Show help for a specific command')
  .action((cmdName) => {
    if (cmdName) {
      const cmd = program.commands.find(c => c.name() === cmdName);
      if (cmd) {
        cmd.outputHelp();
      } else {
        UIHelper.showError(`Unknown command: ${cmdName}`);
      }
    } else {
      console.log(`

AI Tools CLI - Usage Guide

Common Workflows:

1. Check AI development environment health:
   aitools status

2. Manage Claude Code hooks:
   aitools hooks              # View all hooks
   aitools hooks -i           # Interactive management
   aitools hooks -k           # Kill all hooks

3. Fix common issues automatically:
   aitools fix                # Standard fix
   aitools fix --aggressive   # Aggressive fix

4. Monitor system performance:
   aitools monitor            # One-time check
   aitools monitor -w         # Continuous monitoring

5. View processes:
   aitools processes          # All processes
   aitools processes --hooks  # Only hook processes

6. Terminate specific processes:
   aitools kill -p 1234       # Kill by PID
   aitools kill --hooks       # Kill all hooks
   aitools kill -i            # Interactive selection

${program.helpInformation()}
`);
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

// Parse command line arguments
program.parse();