import { Command } from 'commander';
import { ConfigManager } from '../utils/config-manager.js';
import { UIHelper } from '../utils/ui.js';
import chalk from 'chalk';
import inquirer from 'inquirer';

export function setupConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage AI Tools configuration');

  // Subcommand to set API keys
  config
    .command('set-keys')
    .description('Set API keys in configuration')
    .action(async () => {
      const configManager = new ConfigManager();
      
      try {
        // Load existing config
        await configManager.load();
        const currentConfig = configManager.getConfig();
        
        // Ask for API keys
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'openai_api_key',
            message: 'OpenAI API Key (leave empty to skip):',
            default: currentConfig.openai_api_key || '',
            validate: (input) => {
              if (!input) return true; // Allow empty
              return input.startsWith('sk-') || 'Invalid OpenAI API key format';
            }
          },
          {
            type: 'input',
            name: 'slack_webhook_url',
            message: 'Slack Webhook URL (leave empty to skip):',
            default: currentConfig.slack_webhook_url || '',
            validate: (input) => {
              if (!input) return true; // Allow empty
              return input.startsWith('https://hooks.slack.com/') || 'Invalid Slack webhook URL';
            }
          }
        ]);
        
        // Update config with new keys
        const updatedConfig = { ...currentConfig };
        if (answers.openai_api_key) {
          updatedConfig.openai_api_key = answers.openai_api_key;
        }
        if (answers.slack_webhook_url) {
          updatedConfig.slack_webhook_url = answers.slack_webhook_url;
        }
        
        // Save updated config
        const isGlobal = configManager.isGlobalConfig();
        await configManager.save(updatedConfig, isGlobal);
        
        UIHelper.showSuccess('API keys updated successfully');
        
        // Show security reminder
        if (answers.openai_api_key || answers.slack_webhook_url) {
          console.log(chalk.yellow('\n⚠ Security Reminder:'));
          console.log(chalk.gray('  Your API keys are stored in the config file.'));
          console.log(chalk.gray('  Make sure .aitools/ is in your .gitignore'));
        }
        
      } catch (error) {
        if (error instanceof Error) {
          UIHelper.showError(`Failed to update configuration: ${error.message}`);
        }
        process.exit(1);
      }
    });
    
  // Subcommand to show current config
  config
    .command('show')
    .description('Show current configuration')
    .option('--show-keys', 'Also display API keys (hidden by default)')
    .action(async (options) => {
      const configManager = new ConfigManager();
      
      try {
        await configManager.load();
        const currentConfig = configManager.getConfig();
        const configPath = configManager.getConfigPath();
        
        console.log(chalk.bold('\nCurrent Configuration:'));
        console.log(chalk.gray(`Path: ${configPath}`));
        console.log(chalk.hex('#303030')('─'.repeat(30)));
        
        // Display config with masked API keys by default
        const displayConfig = { ...currentConfig };
        if (!options.showKeys) {
          if (displayConfig.openai_api_key) {
            displayConfig.openai_api_key = 'sk-***' + displayConfig.openai_api_key.slice(-4);
          }
          if (displayConfig.slack_webhook_url) {
            displayConfig.slack_webhook_url = 'https://hooks.slack.com/***';
          }
        }
        
        console.log(JSON.stringify(displayConfig, null, 2));
        
      } catch (error) {
        if (error instanceof Error) {
          UIHelper.showError(`No configuration found. Run 'ai init' to create one.`);
        }
        process.exit(1);
      }
    });
}