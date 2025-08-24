import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { UIHelper } from '../utils/ui.js';
import { ConfigManager } from '../utils/config-manager.js';
import chalk from 'chalk';
import { Separator } from '../utils/separator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class HooksInitCommand {
  private configManager: ConfigManager;
  private projectClaudeDir: string;

  constructor() {
    this.configManager = new ConfigManager();
    this.projectClaudeDir = path.join(process.cwd(), '.claude');
  }

  async execute(options: { 
    force?: boolean;
  } = {}): Promise<void> {
    try {
      UIHelper.showHeader();
      console.log(chalk.bold('▪ AI Tools Hooks Setup'));
      console.log(Separator.short());
      console.log();

      // Load config
      await this.configManager.load();
      const config = this.configManager.getConfig();

      const targetDir = this.projectClaudeDir;

      // Check if .claude directory exists
      try {
        await fs.mkdir(targetDir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }

      // Update or create settings.json
      const settingsPath = path.join(targetDir, 'settings.json');
      const commandMethod = await this.updateClaudeSettings(settingsPath, config, options);

      console.log();
      UIHelper.showSuccess('Project hooks configured successfully!');
      
      console.log();
      console.log(chalk.bold('Hooks configured:'));
      console.log(chalk.gray(`  • Quality checks on file changes (lint & lines)`));
      console.log(chalk.gray(`  • Smart notifications on task completion`));
      
      const slackWebhook = this.configManager.getValue('slack_webhook_url');
      if (slackWebhook && !slackWebhook.includes('YOUR/WEBHOOK/URL')) {
        console.log(chalk.green(`  • Slack notifications enabled`));
      } else {
        console.log(chalk.yellow(`  • Slack webhook not configured (set SLACK_WEBHOOK_URL in .env)`));
      }

      console.log();
      console.log(chalk.bold('How it works:'));
      console.log(chalk.gray(`1. When session starts, Claude Code will run:`));
      console.log(chalk.cyan(`   ${commandMethod} hooks start`));
      console.log();
      console.log(chalk.gray(`2. When you edit files, Claude Code will run:`));
      console.log(chalk.cyan(`   ${commandMethod} hooks lint`));
      console.log(chalk.cyan(`   ${commandMethod} hooks lines`));
      console.log();
      console.log(chalk.gray(`3. When tasks complete, Claude Code will run:`));
      console.log(chalk.cyan(`   ${commandMethod} hooks notify`));
      console.log();
      console.log(chalk.gray(`Settings location: ${settingsPath}`));
      
      // Show installation method detected
      if (commandMethod.startsWith('node ')) {
        const scriptPath = commandMethod.replace('node ', '');
        if (scriptPath.includes('/repositories/aitools/')) {
          console.log(chalk.blue(`Using: Local development (via alias or direct execution)`));
        } else {
          console.log(chalk.blue(`Using: Direct node execution`));
        }
      } else if (commandMethod === 'aitools') {
        console.log(chalk.green(`Using: Global installation`));
      } else if (commandMethod.includes('bunx')) {
        console.log(chalk.blue(`Using: bunx (temporary execution)`));
      } else if (commandMethod.includes('npx')) {
        console.log(chalk.blue(`Using: npx (temporary execution)`));
      } else if (commandMethod.includes('bun run')) {
        console.log(chalk.blue(`Using: Development mode`));
      }


    } catch (error) {
      UIHelper.showError(`Failed to initialize hooks: ${error}`);
      process.exit(1);
    }
  }

  private async updateClaudeSettings(settingsPath: string, config: any, options: any): Promise<string> {
    let settings: any = {};
    
    try {
      const content = await fs.readFile(settingsPath, 'utf-8');
      settings = JSON.parse(content);
    } catch (error) {
      // Settings file doesn't exist or is invalid
      settings = {};
    }

    // Ensure hooks structure exists
    if (!settings.hooks) {
      settings.hooks = {};
    }

    // Configure PostToolUse hooks for quality checks
    if (!settings.hooks.PostToolUse) {
      settings.hooks.PostToolUse = [];
    }

    // Find or create entry for file editing tools
    let postToolEntry = settings.hooks.PostToolUse.find((entry: any) => 
      entry.matcher === 'Write|Edit|MultiEdit'
    );

    if (!postToolEntry) {
      postToolEntry = {
        matcher: 'Write|Edit|MultiEdit',
        hooks: []
      };
      settings.hooks.PostToolUse.push(postToolEntry);
    }

    if (!postToolEntry.hooks) {
      postToolEntry.hooks = [];
    }

    // Determine the best way to run aitools
    let aiCommand = 'aitools';
    
    // Priority order for finding aitools:
    // 1. Check for 'aitools' alias and resolve to actual path
    // 2. Check if 'aitools' is available in PATH (global install)
    // 3. Check if user ran via npx/bunx (detect from process.argv)
    // 4. Try bunx/npx as fallback
    
    const { execSync } = await import('child_process');
    
    // Helper to check if a command exists
    const commandExists = async (cmd: string): Promise<boolean> => {
      try {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    };
    
    // Helper to resolve alias to actual command
    const resolveAlias = async (aliasName: string): Promise<string | null> => {
      try {
        // Use zsh/bash to resolve alias (need to run in interactive shell mode)
        const shell = process.env.SHELL || '/bin/zsh';
        const isZsh = shell.includes('zsh');
        
        // For zsh, we need to source the rc file and then check alias
        let command = '';
        if (isZsh) {
          command = `zsh -ic "alias ${aliasName} 2>/dev/null" 2>/dev/null || true`;
        } else {
          command = `bash -ic "alias ${aliasName} 2>/dev/null" 2>/dev/null || true`;
        }
        
        const result = execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        
        if (result) {
          // Parse alias output (e.g., "ai='bun ~/repositories/aitools/dist/cli.js'")
          const match = result.match(/^[^=]+=["']?(.+?)["']?$/);
          if (match) {
            let aliasCmd = match[1].trim();
            // Expand ~ to home directory
            aliasCmd = aliasCmd.replace(/~/g, process.env.HOME || '');
            
            // Check if it's a bun/node command with a script
            if (aliasCmd.startsWith('bun ') || aliasCmd.startsWith('node ')) {
              const parts = aliasCmd.split(' ');
              if (parts.length >= 2) {
                const runtime = parts[0]; // Keep original runtime (bun or node)
                const scriptPath = parts.slice(1).join(' ');
                // Verify the script exists
                if (await fs.access(scriptPath).then(() => true).catch(() => false)) {
                  return `${runtime} ${scriptPath}`;
                }
              }
            }
            
            // For other commands (like bare script paths), prefer bun for speed
            if (aliasCmd.endsWith('.js')) {
              if (await fs.access(aliasCmd).then(() => true).catch(() => false)) {
                // Check if bun is available, otherwise fall back to node
                try {
                  execSync('which bun', { stdio: 'ignore' });
                  return `bun ${aliasCmd}`;
                } catch {
                  return `node ${aliasCmd}`;
                }
              }
            }
            
            // Return as is for other cases
            return aliasCmd;
          }
        }
      } catch (error) {
        // Alias not found or error accessing shell
      }
      return null;
    };
    
    // 1. First priority: Check for aitools alias
    const resolvedCommand = await resolveAlias('aitools');
    
    if (resolvedCommand) {
      // Found an alias, use the resolved path
      aiCommand = resolvedCommand;
    } 
    // 2. Second priority: Check if aitools is globally installed
    else if (await commandExists('aitools')) {
      // Global install via npm/bun/yarn
      const whichResult = execSync('which aitools', { encoding: 'utf-8' }).trim();
      // Check if it's a real binary (not an alias)
      if (!whichResult.includes('aliased to')) {
        aiCommand = 'aitools';
      }
    } 
    // 3. Third priority: Detect if user ran via npx/bunx
    else if (process.argv[0].includes('npx') || process.env.npm_execpath?.includes('npx')) {
      aiCommand = 'npx aitools';
    } else if (process.argv[0].includes('bunx') || process.env.BUN_INSTALL) {
      aiCommand = 'bunx aitools';
    }
    // 4. Fourth priority: Try bunx/npx as fallback
    else {
      // Check if package is available via package managers
      try {
        execSync('bunx aitools --version', { stdio: 'ignore' });
        aiCommand = 'bunx aitools';
      } catch {
        try {
          execSync('npx aitools --version', { stdio: 'ignore' });
          aiCommand = 'npx aitools';
        } catch {
          // Last resort: use the current script path
          const currentScriptPath = path.resolve(__dirname, '..', '..', 'dist', 'cli.js');
          if (await fs.access(currentScriptPath).then(() => true).catch(() => false)) {
            aiCommand = `node ${currentScriptPath}`;
          } else {
            // Default to known dev location
            const devPath = path.join(process.env.HOME || '', 'repositories', 'aitools', 'dist', 'cli.js');
            aiCommand = `node ${devPath}`;
          }
        }
      }
    }
    
    // Add quality check hooks
    const qualityHooks = [
      {
        type: 'command',
        command: `${aiCommand} hooks lint`
      },
      {
        type: 'command',
        command: `${aiCommand} hooks lines`
      }
    ];

    // Remove existing aitools hooks if force flag is set
    if (options.force) {
      postToolEntry.hooks = postToolEntry.hooks.filter((hook: any) => 
        !hook.command?.includes('hooks lint') && 
        !hook.command?.includes('hooks lines') &&
        !hook.command?.includes('/cli.js lint') &&
        !hook.command?.includes('/cli.js lines') &&
        !hook.command?.includes('aitools lint') &&
        !hook.command?.includes('aitools lines')
      );
    }

    // Add quality hooks if they don't exist
    for (const hook of qualityHooks) {
      const exists = postToolEntry.hooks.some((h: any) => 
        h.command === hook.command
      );
      
      if (!exists) {
        postToolEntry.hooks.push(hook);
      }
    }

    // SessionStart hook no longer needed - timing is calculated from transcript

    // Configure Stop hooks for notifications
    if (!settings.hooks.Stop) {
      settings.hooks.Stop = [];
    }

    // Find or create entry for all stop events
    let stopEntry = settings.hooks.Stop.find((entry: any) => 
      entry.matcher === '*'
    );

    if (!stopEntry) {
      stopEntry = {
        matcher: '*',
        hooks: []
      };
      settings.hooks.Stop.push(stopEntry);
    }

    if (!stopEntry.hooks) {
      stopEntry.hooks = [];
    }

    // Add notification hook (use the same command as determined above)
    const notificationHook = {
      type: 'command',
      command: `${aiCommand} hooks notify`
    };

    // Remove existing notification hook if force flag is set
    if (options.force) {
      stopEntry.hooks = stopEntry.hooks.filter((hook: any) => 
        !hook.command?.includes('hooks notify') &&
        !hook.command?.includes('/cli.js notify') &&
        !hook.command?.includes('aitools notify') &&
        !hook.command?.includes('--task-complete')
      );
    }

    // Add notification hook if it doesn't exist
    const notifyExists = stopEntry.hooks.some((h: any) => 
      h.command?.includes('hooks notify')
    );
    
    if (!notifyExists) {
      stopEntry.hooks.push(notificationHook);
    }

    // Save updated settings
    await fs.writeFile(
      settingsPath, 
      JSON.stringify(settings, null, 4), 
      'utf-8'
    );
    
    // Return the command method used for display
    return aiCommand;
  }
}