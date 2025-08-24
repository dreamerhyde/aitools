import { Command } from 'commander';
import chalk from 'chalk';
import { UIHelper } from '../utils/ui.js';
import { HooksInitCommand } from '../commands/hooks-init-command.js';

export function setupHooksCommand(program: Command): void {
  const hooksCommand = program
    .command('hooks')
    .alias('h')
    .description('Manage Claude Code hooks configuration');

  // Default hooks action - show current hook configuration
  hooksCommand
    .action(async () => {
      try {
        // Show current hook configuration
        const fs = await import('fs/promises');
        const path = await import('path');
        
        console.log(chalk.bold.cyan('Claude Code Hooks Configuration'));
        console.log('─'.repeat(50));
        
        let hasHooks = false;
        
        // Check project settings
        const projectSettings = path.join(process.cwd(), '.claude', 'settings.json');
        const projectLocalSettings = path.join(process.cwd(), '.claude', 'settings.local.json');
        
        console.log(chalk.green('\n● Project Configuration:'));
        try {
          const settings = JSON.parse(await fs.readFile(projectSettings, 'utf-8'));
          if (settings.hooks && Object.keys(settings.hooks).length > 0) {
            hasHooks = true;
            console.log(`  → ${chalk.cyan('.claude/settings.json')}`);
            for (const hookType of Object.keys(settings.hooks)) {
              console.log(`     ${chalk.gray('▪')} ${hookType}`);
            }
          }
        } catch {
          // No project settings
        }
        
        try {
          const localSettings = JSON.parse(await fs.readFile(projectLocalSettings, 'utf-8'));
          if (localSettings.hooks && Object.keys(localSettings.hooks).length > 0) {
            hasHooks = true;
            console.log(`  → ${chalk.cyan('.claude/settings.local.json')}`);
            for (const hookType of Object.keys(localSettings.hooks)) {
              console.log(`     ${chalk.gray('▪')} ${hookType}`);
            }
          }
        } catch {
          // No local project settings
        }
        
        if (!hasHooks) {
          console.log(chalk.gray('  ○ No project hooks configured'));
        }
        
        
        console.log(chalk.gray('\nAvailable Hook Types:'));
        console.log('  PreToolUse, PostToolUse, UserPromptSubmit, Stop,');
        console.log('  SubagentStop, SessionEnd, PreCompact, SessionStart');
        console.log(chalk.yellow('\n▪ Tip: Use "ai hooks init" to set up Claude Code hooks'));
      } catch (error) {
        UIHelper.showError(`Failed to show hooks configuration: ${error}`);
        process.exit(1);
      }
    });

  // hooks init subcommand - Setup Claude Code hooks
  hooksCommand
    .command('init')
    .description('Initialize Claude Code hooks for current project')
    .option('-f, --force', 'Overwrite existing hooks')
    .action(async (options) => {
      try {
        const hooksInit = new HooksInitCommand();
        await hooksInit.execute({
          force: options.force
        });
      } catch (error) {
        UIHelper.showError(`Hook initialization failed: ${error}`);
        process.exit(1);
      }
    });

  // hooks list subcommand - List configured hooks in detail
  hooksCommand
    .command('list')
    .description('List all configured Claude Code hooks')
    .option('-v, --verbose', 'Show hook commands and matchers')
    .action(async (_options) => {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        console.log(chalk.bold.cyan('Claude Code Hooks Details'));
        console.log('─'.repeat(50));
        
        let totalHooks = 0;
        
        // Helper to display hooks
        const displayHooks = (hooks: any, prefix: string = '') => {
          for (const [hookType, hookConfigs] of Object.entries(hooks)) {
            totalHooks++;
            console.log(`${prefix}${chalk.yellow(hookType)}:`);
            if (Array.isArray(hookConfigs)) {
              hookConfigs.forEach((config: any) => {
                if (config.matcher) {
                  console.log(`${prefix}  Matcher: ${chalk.gray(config.matcher || '(all)')}`);
                }
                if (config.hooks && Array.isArray(config.hooks)) {
                  config.hooks.forEach((hook: any) => {
                    if (hook.type === 'command') {
                      console.log(`${prefix}    → ${chalk.cyan(hook.command)}`);
                    }
                  });
                }
              });
            }
          }
        };
        
        // Check project settings
        console.log(chalk.green('\n● Project Hooks:'));
        let hasProjectHooks = false;
        
        const projectSettings = path.join(process.cwd(), '.claude', 'settings.json');
        try {
          const settings = JSON.parse(await fs.readFile(projectSettings, 'utf-8'));
          if (settings.hooks && Object.keys(settings.hooks).length > 0) {
            hasProjectHooks = true;
            console.log(`  ${chalk.blue('From .claude/settings.json:')}`);
            displayHooks(settings.hooks, '    ');
          }
        } catch {
          // No project settings
        }
        
        const projectLocalSettings = path.join(process.cwd(), '.claude', 'settings.local.json');
        try {
          const settings = JSON.parse(await fs.readFile(projectLocalSettings, 'utf-8'));
          if (settings.hooks && Object.keys(settings.hooks).length > 0) {
            hasProjectHooks = true;
            console.log(`  ${chalk.blue('From .claude/settings.local.json:')}`);
            displayHooks(settings.hooks, '    ');
          }
        } catch {
          // No local settings
        }
        
        if (!hasProjectHooks) {
          console.log(chalk.gray('  ○ No project hooks configured'));
        }
        
        if (totalHooks === 0) {
          console.log(chalk.yellow('\n▪ Tip: Use "ai hooks init" to set up Claude Code hooks'));
        } else {
          console.log(chalk.gray(`\nTotal: ${totalHooks} hook type(s) configured`));
        }
      } catch (error) {
        UIHelper.showError(`Failed to list hooks: ${error}`);
        process.exit(1);
      }
    });

  // hooks notify subcommand - Send task completion notification from hooks
  hooksCommand
    .command('notify')
    .description('Send task completion notification to Slack (for Claude Code hooks)')
    .option('--message <text>', 'Custom message to include')
    .option('--error', 'Send as error notification instead')
    .action(async (options) => {
      try {
        const { NotificationManager } = await import('../utils/notification-manager.js');
        const notificationManager = new NotificationManager();
        
        // Debug stdin availability
        if (process.env.DEBUG) {
          console.error(chalk.gray(`[DEBUG] stdin.isTTY: ${process.stdin.isTTY}`));
          console.error(chalk.gray(`[DEBUG] stdin.readable: ${process.stdin.readable}`));
        }
        
        // Try to read stdin JSON from Claude Code hook
        let aiSummary: string | undefined;
        let taskDuration: number | undefined;
        
        // Check if stdin is available (not TTY)
        if (!process.stdin.isTTY) {
          try {
            // Set timeout for stdin reading
            const timeoutPromise = new Promise<string>((_, reject) => {
              setTimeout(() => reject(new Error('Stdin read timeout')), 1000);
            });
            
            const readPromise = (async () => {
              const chunks: Buffer[] = [];
              process.stdin.setEncoding('utf8');
              
              for await (const chunk of process.stdin) {
                chunks.push(Buffer.from(chunk));
                if (process.env.DEBUG) {
                  console.error(chalk.gray(`[DEBUG] Received chunk: ${chunk.length} bytes`));
                }
              }
              
              return Buffer.concat(chunks).toString();
            })();
            
            const stdinData = await Promise.race([readPromise, timeoutPromise]) as string;
            
            if (process.env.DEBUG) {
              console.error(chalk.gray(`[DEBUG] Raw stdin data (${stdinData.length} bytes): ${stdinData.substring(0, 200)}...`));
            }
            
            if (stdinData.trim()) {
              const hookData = JSON.parse(stdinData);
              
              if (process.env.DEBUG) {
                console.error(chalk.gray(`[DEBUG] Parsed hook data keys: ${Object.keys(hookData).join(', ')}`));
                if (hookData.transcript_path) {
                  console.error(chalk.gray(`[DEBUG] Transcript path: ${hookData.transcript_path}`));
                }
              }
              
              // Extract AI summary and timing from transcript if available
              if (hookData.transcript_path) {
                const result = await notificationManager.extractAISummaryAndTiming(hookData.transcript_path);
                aiSummary = result.summary;
                taskDuration = result.duration;
                
                if (process.env.DEBUG) {
                  if (aiSummary) {
                    console.error(chalk.gray(`[DEBUG] Extracted AI summary: ${aiSummary.substring(0, 100)}...`));
                  }
                  if (taskDuration) {
                    console.error(chalk.gray(`[DEBUG] Task duration: ${Math.round(taskDuration / 1000)}s`));
                  }
                }
              }
            }
          } catch (stdinError) {
            if (process.env.DEBUG) {
              console.error(chalk.gray(`[DEBUG] Failed to read stdin: ${stdinError}`));
            }
          }
        } else {
          if (process.env.DEBUG) {
            console.error(chalk.gray('[DEBUG] Stdin is TTY, skipping stdin read'));
          }
        }
        
        if (options.error) {
          // Send error notification
          const message = options.message || 'Task encountered an error';
          await notificationManager.sendTaskError(message);
        } else {
          // Use AI summary if available, otherwise use provided message or default
          const message = aiSummary || options.message || 'Task completed successfully';
          await notificationManager.sendTaskComplete(message, taskDuration);
        }
        // Silent by default for hooks - no output
      } catch (error) {
        // Hooks should never fail - just log if DEBUG is set
        if (process.env.DEBUG) {
          console.error(chalk.gray(`[DEBUG] Notification: ${error}`));
        }
      }
      // Always exit successfully for hooks
      process.exit(0);
    });

  // hooks lint subcommand - AI-readable lint output for hooks
  hooksCommand
    .command('lint')
    .description('Run lint checks for Claude Code hooks (AI-readable, always succeeds)')
    .action(async () => {
      try {
        // Try to read tool input from stdin to get the edited file
        let editedFile: string | undefined;
        if (!process.stdin.isTTY) {
          try {
            const chunks: Buffer[] = [];
            process.stdin.setEncoding('utf8');
            
            const timeoutPromise = new Promise<string>((_, reject) => {
              setTimeout(() => reject(new Error('Stdin read timeout')), 100);
            });
            
            const readPromise = (async () => {
              for await (const chunk of process.stdin) {
                chunks.push(Buffer.from(chunk));
              }
              return Buffer.concat(chunks).toString();
            })();
            
            const stdinData = await Promise.race([readPromise, timeoutPromise]) as string;
            if (stdinData.trim()) {
              const toolData = JSON.parse(stdinData);
              editedFile = toolData.tool_input?.file_path || toolData.file_path;
            }
          } catch {
            // Ignore stdin errors
          }
        }

        const { CheckCommand } = await import('../commands/lint-command-impl.js');
        const checkCommand = new CheckCommand();
        await checkCommand.executeForAI({ targetFile: editedFile });
      } catch (error) {
        // Hooks should never fail - just log if DEBUG is set
        if (process.env.DEBUG) {
          console.error(chalk.gray(`[DEBUG] Lint check: ${error}`));
        }
      }
      // Always exit successfully for hooks
      process.exit(0);
    });

  // hooks lines subcommand - AI-readable lines check for hooks
  hooksCommand
    .command('lines')
    .description('Check file line counts for Claude Code hooks (AI-readable, always succeeds)')
    .option('-l, --limit <lines>', 'Line limit threshold', '500')
    .action(async (options) => {
      try {
        // Try to read tool input from stdin to get the edited file
        let editedFile: string | undefined;
        if (!process.stdin.isTTY) {
          try {
            const chunks: Buffer[] = [];
            process.stdin.setEncoding('utf8');
            
            const timeoutPromise = new Promise<string>((_, reject) => {
              setTimeout(() => reject(new Error('Stdin read timeout')), 100);
            });
            
            const readPromise = (async () => {
              for await (const chunk of process.stdin) {
                chunks.push(Buffer.from(chunk));
              }
              return Buffer.concat(chunks).toString();
            })();
            
            const stdinData = await Promise.race([readPromise, timeoutPromise]) as string;
            if (stdinData.trim()) {
              const toolData = JSON.parse(stdinData);
              editedFile = toolData.tool_input?.file_path || toolData.file_path;
            }
          } catch {
            // Ignore stdin errors
          }
        }
        
        const { LinesCommand } = await import('../commands/lines-command.js');
        const linesCommand = new LinesCommand();
        await linesCommand.executeForAI({
          limit: parseInt(options.limit),
          targetFile: editedFile
        });
      } catch (error) {
        // Hooks should never fail - just log if DEBUG is set
        if (process.env.DEBUG) {
          console.error(chalk.gray(`[DEBUG] Lines check: ${error}`));
        }
      }
      // Always exit successfully for hooks
      process.exit(0);
    });
}