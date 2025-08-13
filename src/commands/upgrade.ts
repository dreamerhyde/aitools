import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { UIHelper } from '../utils/ui.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

export interface UpgradeOptions {
  check?: boolean;
  force?: boolean;
  channel?: 'stable' | 'beta' | 'canary';
}

export class UpgradeCommand {
  private currentVersion: string;
  private packageName = 'aitools';
  
  constructor() {
    // Read current version from package.json
    try {
      // Try different paths to find package.json
      const possiblePaths = [
        join(__dirname, '../../package.json'),
        join(process.cwd(), 'package.json'),
        join(__dirname, '../../../package.json'),
      ];
      
      let packageJson: any;
      for (const path of possiblePaths) {
        if (existsSync(path)) {
          packageJson = JSON.parse(readFileSync(path, 'utf-8'));
          break;
        }
      }
      
      this.currentVersion = packageJson?.version || '1.0.0';
    } catch {
      this.currentVersion = '1.0.0';
    }
  }

  async execute(options: UpgradeOptions = {}): Promise<void> {
    UIHelper.showHeader();
    
    if (options.check) {
      await this.checkForUpdates();
      return;
    }

    await this.performUpgrade(options);
  }

  private async checkForUpdates(): Promise<boolean> {
    const spinner = ora('Checking for updates...').start();
    
    try {
      // Check npm registry for latest version
      const { stdout } = await execAsync(`npm view ${this.packageName} version 2>/dev/null`);
      const latestVersion = stdout.trim();
      
      spinner.stop();
      
      if (!latestVersion) {
        console.log(chalk.yellow('▪ Update Check'));
        console.log('  Package not yet published to npm registry');
        console.log('  Current version: ' + chalk.cyan(this.currentVersion));
        return false;
      }
      
      const isUpdateAvailable = this.compareVersions(latestVersion, this.currentVersion) > 0;
      
      console.log(chalk.bold.cyan('▪ Version Information'));
      console.log('─'.repeat(30));
      console.log(`  Current version: ${chalk.cyan(this.currentVersion)}`);
      console.log(`  Latest version:  ${chalk.green(latestVersion)}`);
      
      if (isUpdateAvailable) {
        console.log();
        console.log(chalk.green('✓ Update available!'));
        console.log(`  Run ${chalk.cyan('ai upgrade')} to update`);
        return true;
      } else {
        console.log();
        console.log(chalk.green('✓ You are on the latest version'));
        return false;
      }
      
    } catch (error) {
      spinner.stop();
      
      // If npm registry check fails, try GitHub
      return await this.checkGitHubVersion();
    }
  }

  private async checkGitHubVersion(): Promise<boolean> {
    const spinner = ora('Checking GitHub for updates...').start();
    
    try {
      // Check GitHub releases API
      const { stdout } = await execAsync(
        `curl -s https://api.github.com/repos/yourusername/aitools/releases/latest | grep '"tag_name"' | cut -d'"' -f4`
      );
      
      const latestTag = stdout.trim().replace('v', '');
      spinner.stop();
      
      if (latestTag) {
        const isUpdateAvailable = this.compareVersions(latestTag, this.currentVersion) > 0;
        
        console.log(chalk.bold.cyan('▪ Version Information (GitHub)'));
        console.log('─'.repeat(30));
        console.log(`  Current version: ${chalk.cyan(this.currentVersion)}`);
        console.log(`  Latest version:  ${chalk.green(latestTag)}`);
        
        if (isUpdateAvailable) {
          console.log();
          console.log(chalk.green('✓ Update available on GitHub!'));
          console.log(`  Run ${chalk.cyan('ai upgrade')} to update`);
          return true;
        }
      }
      
      console.log(chalk.green('✓ You are on the latest version'));
      return false;
      
    } catch (error) {
      spinner.stop();
      console.log(chalk.yellow('Could not check for updates'));
      console.log(`  Current version: ${chalk.cyan(this.currentVersion)}`);
      return false;
    }
  }

  private async performUpgrade(options: UpgradeOptions): Promise<void> {
    console.log(chalk.bold.cyan('▪ AI Tools Upgrade'));
    console.log('─'.repeat(30));
    
    // First check if update is available
    const hasUpdate = await this.checkForUpdates();
    
    if (!hasUpdate && !options.force) {
      return;
    }
    
    if (options.force) {
      console.log(chalk.yellow('\n⚠ Force upgrade requested'));
    }
    
    const spinner = ora('Upgrading AI Tools...').start();
    
    try {
      // Detect package manager
      const packageManager = await this.detectPackageManager();
      
      let command: string;
      switch (packageManager) {
        case 'bun':
          command = `bun upgrade -g ${this.packageName}`;
          break;
        case 'npm':
          command = `npm update -g ${this.packageName}`;
          break;
        case 'yarn':
          command = `yarn global upgrade ${this.packageName}`;
          break;
        case 'pnpm':
          command = `pnpm update -g ${this.packageName}`;
          break;
        default:
          // Fallback to self-update via GitHub
          command = 'bun install -g github:yourusername/aitools';
      }
      
      spinner.text = `Running: ${command}`;
      await execAsync(command);
      
      spinner.succeed('Upgrade completed successfully!');
      
      // Verify new version
      await this.verifyUpgrade();
      
    } catch (error) {
      spinner.fail('Upgrade failed');
      
      // Provide fallback instructions
      console.log();
      console.log(chalk.yellow('▪ Manual Upgrade Instructions:'));
      console.log('─'.repeat(30));
      console.log('  Option 1 (Bun):');
      console.log(chalk.cyan('    bun upgrade -g aitools'));
      console.log();
      console.log('  Option 2 (NPM):');
      console.log(chalk.cyan('    npm update -g aitools'));
      console.log();
      console.log('  Option 3 (From GitHub):');
      console.log(chalk.cyan('    bun install -g github:yourusername/aitools'));
      
      throw error;
    }
  }

  private async detectPackageManager(): Promise<string> {
    // Check which package manager was used for global install
    const checks = [
      { cmd: 'bun pm ls -g 2>/dev/null | grep aitools', manager: 'bun' },
      { cmd: 'npm ls -g aitools 2>/dev/null', manager: 'npm' },
      { cmd: 'yarn global list 2>/dev/null | grep aitools', manager: 'yarn' },
      { cmd: 'pnpm ls -g aitools 2>/dev/null', manager: 'pnpm' }
    ];
    
    for (const check of checks) {
      try {
        await execAsync(check.cmd);
        return check.manager;
      } catch {
        // Continue to next check
      }
    }
    
    // Default to bun if can't detect
    return 'bun';
  }

  private async verifyUpgrade(): Promise<void> {
    try {
      const { stdout } = await execAsync('ai --version 2>/dev/null || aitools --version 2>/dev/null');
      const newVersion = stdout.trim().split(' ').pop();
      
      if (newVersion && newVersion !== this.currentVersion) {
        console.log();
        console.log(chalk.green(`✓ Successfully upgraded from ${this.currentVersion} to ${newVersion}`));
        console.log();
        console.log(chalk.cyan(' Your vibe coding toolkit is now up to date!'));
      }
    } catch {
      // Version check failed, but upgrade might still be successful
      console.log();
      console.log(chalk.green('✓ Upgrade completed'));
      console.log(chalk.gray('  Restart your terminal to use the new version'));
    }
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }
    
    return 0;
  }
}