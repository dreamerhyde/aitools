import { Command } from 'commander';
import chalk from 'chalk';
import { HooksCommand } from '../commands/hooks.js';
import { UIHelper } from '../utils/ui.js';
import { HooksInitCommand } from '../commands/hooks-init-command.js';

export function setupHooksCommand(program: Command): void {
  const hooksCommand = program
    .command('hooks')
    .alias('h')
    .description('Manage AI development hooks (Claude, Git, etc.)');

  // Default hooks action
  hooksCommand
    .option('-i, --interactive', 'Interactive mode for hook management')
    .option('-k, --kill', 'Terminate all detected hooks')
    .option('-w, --watch', 'Watch hooks in real-time')
    .action(async (options) => {
      try {
        const hooks = new HooksCommand();
        await hooks.execute(options);
      } catch (error) {
        UIHelper.showError(`Hooks command failed: ${error}`);
        process.exit(1);
      }
    });

  // hooks clean subcommand - clean abnormal hooks only
  hooksCommand
    .command('clean')
    .description('Clean up abnormal hooks (high CPU while sleeping)')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (options) => {
      try {
        UIHelper.showHeader();
        console.log(chalk.red.bold('▪ Hook Cleanup'));
        console.log('─'.repeat(30));
        
        const processMonitor = new (await import('../utils/process-monitor.js')).ProcessMonitor({
          cpuThreshold: 1.0
        });
        
        const processes = await processMonitor.getAllProcesses();
        
        // Only abnormal hooks
        const abnormalHooks = processes.filter(proc => {
          if (!proc.isHook) return false;
          const isClaudeHook = proc.command.includes('.claude/hooks/');
          const isSleepingWithCPU = proc.status === 'sleeping' && proc.cpu > 1;
          return isClaudeHook && isSleepingWithCPU;
        });
        
        if (abnormalHooks.length === 0) {
          UIHelper.showSuccess('No abnormal hooks to clean!');
          return;
        }
        
        console.log(chalk.red(`Found ${abnormalHooks.length} abnormal hook(s):`));
        abnormalHooks.forEach(proc => {
          const shortCmd = proc.command.split('/').pop() || proc.command;
          console.log(chalk.red(`   ● PID ${proc.pid} (${proc.cpu.toFixed(1)}% CPU) - ${shortCmd}`));
        });
        
        if (!options.yes) {
          const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          const answer = await new Promise<string>(resolve => {
            readline.question(chalk.bold('\nClean these hooks? (y/N): '), resolve);
          });
          readline.close();
          
          if (answer.toLowerCase() !== 'y') {
            console.log(chalk.gray('Cancelled.'));
            return;
          }
        }
        
        let cleaned = 0;
        for (const proc of abnormalHooks) {
          if (await processMonitor.killProcess(proc.pid)) {
            console.log(chalk.green(`   ✓ Terminated PID ${proc.pid}`));
            cleaned++;
          } else {
            console.log(chalk.red(`   ✗ Failed PID ${proc.pid}`));
          }
        }
        
        console.log();
        UIHelper.showSuccess(`Cleaned ${cleaned} abnormal hook(s)!`);
        console.log(chalk.green(' Your hooks are clean and ready to vibe!'));
      } catch (error) {
        UIHelper.showError(`Hook cleanup failed: ${error}`);
        process.exit(1);
      }
    });

  // hooks init subcommand - Setup Claude Code hooks
  hooksCommand
    .command('init')
    .description('Initialize project-level Claude Code hooks')
    .option('-g, --global', 'Setup global hooks instead of project hooks')
    .option('-f, --force', 'Overwrite existing hooks')
    .action(async (options) => {
      try {
        const hooksInit = new HooksInitCommand();
        await hooksInit.execute({
          global: options.global,
          force: options.force
        });
      } catch (error) {
        UIHelper.showError(`Hook initialization failed: ${error}`);
        process.exit(1);
      }
    });

  // hooks list subcommand - List all hooks
  hooksCommand
    .command('list')
    .description('List all active hooks')
    .action(async () => {
      try {
        const hooks = new HooksCommand();
        await hooks.execute({});
      } catch (error) {
        UIHelper.showError(`Failed to list hooks: ${error}`);
        process.exit(1);
      }
    });

  // hooks notify subcommand - Send notifications
  hooksCommand
    .command('notify')
    .description('Send Slack notifications for AI Tools events')
    .option('--task-complete', 'Send task completion notification')
    .option('--task-error <message>', 'Send error notification')
    .option('--message <text>', 'Custom message to include')
    .option('--silent', 'Suppress console output')
    .action(async (options) => {
      try {
        const { NotificationManager } = await import('../utils/notification-manager.js');
        const notificationManager = new NotificationManager();
        
        if (options.taskComplete) {
          // This is called by the Claude Code hook
          const message = options.message || 'Task completed successfully';
          await notificationManager.sendTaskComplete(message);
          
          if (!options.silent) {
            console.log(chalk.gray('✓ Task completion notification sent'));
          }
        } else if (options.taskError) {
          // Send error notification
          await notificationManager.sendTaskError(options.taskError);
          
          if (!options.silent) {
            console.log(chalk.gray('✓ Error notification sent'));
          }
        } else {
          // Default: send a generic notification
          const message = options.message || 'AI Tools notification';
          await notificationManager.sendTaskComplete(message);
          
          if (!options.silent) {
            console.log(chalk.gray('✓ Notification sent'));
          }
        }
      } catch (error) {
        if (!options.silent) {
          // Don't fail loudly in hooks
          console.error(chalk.gray(`Notification failed: ${error}`));
        }
        // Exit gracefully
        process.exit(0);
      }
    });

  // hooks lint subcommand - AI-readable lint output
  hooksCommand
    .command('lint')
    .description('Run lint checks and output AI-readable format')
    .action(async () => {
      try {
        const { CheckCommand } = await import('../commands/check-command.js');
        const checkCommand = new CheckCommand();
        await checkCommand.executeForAI();
      } catch (error) {
        UIHelper.showError(`Lint check failed: ${error}`);
        process.exit(1);
      }
    });

  // hooks lines subcommand - AI-readable lines check output
  hooksCommand
    .command('lines')
    .description('Check file line counts and output AI-readable format')
    .option('-l, --limit <lines>', 'Line limit threshold', '500')
    .action(async (options) => {
      try {
        const { LinesCommand } = await import('../commands/lines-command.js');
        const linesCommand = new LinesCommand();
        await linesCommand.executeForAI({
          limit: parseInt(options.limit)
        });
      } catch (error) {
        UIHelper.showError(`Lines check failed: ${error}`);
        process.exit(1);
      }
    });
}