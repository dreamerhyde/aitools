import { promises as fs } from 'fs';
import path from 'path';
import { UIHelper } from '../utils/ui.js';
import { ConfigManager } from '../utils/config-manager.js';
import chalk from 'chalk';

export class HooksInitCommand {
  private configManager: ConfigManager;
  private projectClaudeDir: string;

  constructor() {
    this.configManager = new ConfigManager();
    this.projectClaudeDir = path.join(process.cwd(), '.claude');
  }

  async execute(options: { 
    global?: boolean;
    force?: boolean;
  } = {}): Promise<void> {
    try {
      UIHelper.showHeader();
      console.log(chalk.bold('▪ AI Tools Hooks Setup'));
      console.log(chalk.hex('#303030')('─'.repeat(30)));
      console.log();

      // Load config
      await this.configManager.load();
      const config = this.configManager.getConfig();

      const isGlobal = options.global || false;
      const targetDir = isGlobal 
        ? path.join(process.env.HOME || '', '.claude')
        : this.projectClaudeDir;

      // Check if .claude directory exists
      try {
        await fs.mkdir(targetDir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }

      // Update or create settings.json
      const settingsPath = path.join(targetDir, 'settings.json');
      await this.updateClaudeSettings(settingsPath, config, options);

      console.log();
      UIHelper.showSuccess(`${isGlobal ? 'Global' : 'Project'} hooks configured successfully!`);
      
      console.log();
      console.log(chalk.bold('Hooks configured:'));
      console.log(chalk.gray(`  • Quality checks on file changes (ai lint & ai lines)`));
      console.log(chalk.gray(`  • Smart notifications on task completion`));
      
      if (config.slack_webhook_url && !config.slack_webhook_url.includes('YOUR/WEBHOOK/URL')) {
        console.log(chalk.green(`  • Slack notifications enabled`));
      } else {
        console.log(chalk.yellow(`  • Slack webhook not configured (run "ai config set-keys")`));
      }

      console.log();
      console.log(chalk.bold('How it works:'));
      console.log(chalk.gray(`1. When you edit files, Claude Code will run:`));
      console.log(chalk.cyan(`   ai lint --quick`));
      console.log(chalk.cyan(`   ai lines --check`));
      console.log();
      console.log(chalk.gray(`2. When tasks complete, Claude Code will run:`));
      console.log(chalk.cyan(`   ai notify --task-complete`));
      console.log();
      console.log(chalk.gray(`Settings location: ${settingsPath}`));

      if (!isGlobal) {
        console.log();
        console.log(chalk.yellow('Note: Project hooks override global hooks'));
      }

    } catch (error) {
      UIHelper.showError(`Failed to initialize hooks: ${error}`);
      process.exit(1);
    }
  }

  private async updateClaudeSettings(settingsPath: string, config: any, options: any): Promise<void> {
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

    // Add quality check hooks (directly call aitools commands)
    const qualityHooks = [
      {
        type: 'command',
        command: 'ai lint --quick 2>/dev/null || true'
      },
      {
        type: 'command',
        command: 'ai lines --check 2>/dev/null || true'
      }
    ];

    // Remove existing aitools hooks if force flag is set
    if (options.force) {
      postToolEntry.hooks = postToolEntry.hooks.filter((hook: any) => 
        !hook.command?.includes('ai lint') && 
        !hook.command?.includes('ai lines') &&
        !hook.command?.includes('aitools')
      );
    }

    // Add quality hooks if they don't exist
    for (const hook of qualityHooks) {
      const exists = postToolEntry.hooks.some((h: any) => 
        h.command?.includes(hook.command.split(' ')[1])
      );
      
      if (!exists) {
        postToolEntry.hooks.push(hook);
      }
    }

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

    // Add notification hook (directly call aitools command)
    const notificationHook = {
      type: 'command',
      command: 'ai notify --task-complete 2>/dev/null || true'
    };

    // Remove existing notification hook if force flag is set
    if (options.force) {
      stopEntry.hooks = stopEntry.hooks.filter((hook: any) => 
        !hook.command?.includes('ai notify')
      );
    }

    // Add notification hook if it doesn't exist
    const notifyExists = stopEntry.hooks.some((h: any) => 
      h.command?.includes('ai notify')
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
  }
}