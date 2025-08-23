import { ConfigManager } from '../utils/config-manager.js';
import { UIHelper } from '../utils/ui.js';
import { defaultConfig } from '../types/config.js';
import chalk from 'chalk';
import inquirer from 'inquirer';

export class InitCommand {
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
  }


  async execute(options: { global?: boolean; force?: boolean; yes?: boolean } = {}): Promise<void> {
    try {
      // Check if trying to create local config when one already exists
      if (!options.force && !options.global) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const localPath = path.join(process.cwd(), '.aitools', 'config.toml');
        try {
          await fs.access(localPath);
          UIHelper.showError(`Local configuration already exists at: ${localPath}`);
          console.log(chalk.yellow('Use --force to overwrite existing configuration'));
          return;
        } catch {
          // Local config doesn't exist, proceed
        }
      }
      
      // Check if trying to create global config when one already exists
      if (!options.force && options.global) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const globalPath = path.join(process.env.HOME || '', '.aitools', 'config.toml');
        try {
          await fs.access(globalPath);
          UIHelper.showError(`Global configuration already exists at: ${globalPath}`);
          console.log(chalk.yellow('Use --force to overwrite existing configuration'));
          return;
        } catch {
          // Global config doesn't exist, proceed
        }
      }

      console.log(chalk.bold.blue('\n● AI Tools Configuration Setup\n'));

      // Check if running in non-interactive mode or with --yes flag
      const isNonInteractive = !process.stdout.isTTY || options.yes;
      
      let answers: any;
      if (isNonInteractive) {
        // Use all defaults
        console.log(chalk.yellow('Using default values (non-interactive mode)\n'));
        answers = {
          global: options.global || false,
          auto_update: true,
          completion: true,
          line_limit: 500,
          setup_hooks: true,
          notification: true  // Default to true as requested
        };
        
        // Show what will be created
        console.log('Configuration settings:');
        console.log(`  Scope: ${answers.global ? 'Global' : 'Project-level'}`);
        console.log(`  Auto update: ${answers.auto_update}`);
        console.log(`  Shell completion: ${answers.completion}`);
        console.log(`  AI Model: gpt-5 (Latest OpenAI GPT-5 - Best for coding)`);
        console.log(`  Line limit: ${answers.line_limit}`);
        console.log(`  Hooks: ${answers.setup_hooks}`);
        console.log(`  Slack notifications: ${answers.notification}`);
        console.log('');
      } else {
        // Interactive setup with better defaults
        answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'global',
            message: 'Create global configuration? (No = project-level)',
            default: options.global || false
          },
          {
            type: 'confirm',
            name: 'auto_update',
            message: 'Enable automatic updates?',
            default: true
          },
          {
            type: 'confirm',
            name: 'completion',
            message: 'Enable shell completion?',
            default: true
          },
          {
            type: 'number',
            name: 'line_limit',
            message: 'Maximum lines per file:',
            default: 500,
            validate: (input) => (input && input > 0) || 'Must be a positive number'
          },
          {
            type: 'confirm',
            name: 'setup_hooks',
            message: 'Setup hooks for quality checks?',
            default: true
          },
          {
            type: 'confirm',
            name: 'notification',
            message: 'Enable Slack notifications?',
            default: true,  // Changed default to true
            when: (answers) => answers.setup_hooks
          },
          {
            type: 'list',
            name: 'model',
            message: 'Select OpenAI model for AI features:',
            choices: [
              { name: 'GPT-5 (Latest & Recommended - Best for Coding)', value: 'gpt-5' },
              { name: 'GPT-5 Mini (Balanced Performance)', value: 'gpt-5-mini' },
              { name: 'GPT-5 Nano (Fastest & Most Economical)', value: 'gpt-5-nano' },
              { name: 'GPT-4o (Previous Gen - Multimodal)', value: 'gpt-4o' },
              { name: 'GPT-4o Mini (Faster & Cheaper)', value: 'gpt-4o-mini' },
              { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
              { name: 'GPT-3.5 Turbo (Legacy - Fast & Cost-effective)', value: 'gpt-3.5-turbo' }
            ],
            default: 'gpt-5'
          }
        ]);
      }

      // Build configuration with environment variable references
      const config: any = {
        ...defaultConfig,
        auto_update: answers.auto_update,
        completion: answers.completion,
        model: answers.model || 'gpt-5',
        line_limit: answers.line_limit,
        lint_on_hook: answers.setup_hooks,
        lines_on_hook: answers.setup_hooks,
        // API keys use environment variables by default
        openai_api_key: 'env(OPENAI_API_KEY)',
        slack_webhook_url: answers.notification ? 'env(SLACK_WEBHOOK_URL)' : undefined,
        hooks: {
          global: answers.global,
          notification: answers.notification || false,
          auto_fix: false
        },
        notifications: {
          enabled: answers.notification || false,
          on_success: true,
          on_error: true,
          include_changes: true,
          include_summary: true
        }
      };

      // Save configuration
      await this.configManager.save(config, answers.global);

      const configPath = answers.global 
        ? '~/.aitools/config.toml'
        : './.aitools/config.toml';


      console.log('');
      UIHelper.showSuccess(`Configuration saved to: ${configPath}`);
      
      // Show environment variables setup reminder
      console.log(chalk.yellow('\n▪ Environment Variables:'));
      console.log(chalk.gray('  The config uses environment variables for API keys:'));
      console.log('');
      console.log(chalk.cyan('  Required:'));
      console.log(chalk.gray('  - OPENAI_API_KEY: Your OpenAI API key'));
      if (answers.notification) {
        console.log(chalk.gray('  - SLACK_WEBHOOK_URL: Your Slack webhook URL'));
      }
      console.log('');
      console.log(chalk.gray('  Set them in your shell or .env file'));
      
      // Show next steps
      console.log(chalk.bold('\n▪ Next Steps:\n'));
      
      let stepNum = 1;
      
      console.log(`${stepNum}. Set environment variables:`);
      console.log(chalk.gray('   export OPENAI_API_KEY="your-key"'));
      if (answers.notification) {
        console.log(chalk.gray('   export SLACK_WEBHOOK_URL="your-webhook-url"'));
      }
      stepNum++;
      
      if (answers.setup_hooks) {
        console.log(`\n${stepNum}. Initialize hooks:`);
        console.log(chalk.gray('   ai hooks init'));
        stepNum++;
      }
      
      console.log(`\n${stepNum}. Check your setup:`);
      console.log(chalk.gray('   ai status'));
      
      console.log('');

    } catch (error) {
      if (error instanceof Error) {
        UIHelper.showError(`Failed to initialize configuration: ${error.message}`);
      }
      process.exit(1);
    }
  }
}