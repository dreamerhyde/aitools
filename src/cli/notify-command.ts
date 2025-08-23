import { Command } from 'commander';
import { NotificationManager } from '../utils/notification-manager.js';
import { UIHelper } from '../utils/ui.js';
import chalk from 'chalk';

export function setupNotifyCommand(program: Command): void {
  program
    .command('notify')
    .description('Send notifications for AI Tools events')
    .option('--task-complete', 'Send task completion notification')
    .option('--task-error <message>', 'Send error notification')
    .option('--message <text>', 'Custom message to include')
    .option('--silent', 'Suppress console output')
    .action(async (options) => {
      try {
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
}