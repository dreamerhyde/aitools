import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { UIHelper } from '../utils/ui.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { compareVersions } from '../utils/version.js';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

const PACKAGE_NAME = '@dreamerhyde/aitools';
const GITHUB_REPO = 'dreamerhyde/aitools';

export interface UpgradeOptions {
  check?: boolean;
  force?: boolean;
}

export class UpgradeCommand {
  private currentVersion: string;

  constructor() {
    this.currentVersion = this.readCurrentVersion();
  }

  private readCurrentVersion(): string {
    const paths = [
      join(__dirname, '../../package.json'),
      join(__dirname, '../package.json'),
    ];
    for (const p of paths) {
      try {
        if (existsSync(p)) {
          return JSON.parse(readFileSync(p, 'utf-8')).version;
        }
      } catch {
        continue;
      }
    }
    return '0.0.0';
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
      const { stdout } = await execAsync(`npm view ${PACKAGE_NAME} version 2>/dev/null`);
      const latestVersion = stdout.trim();

      spinner.stop();

      if (!latestVersion) {
        console.log(chalk.yellow('▪ Update Check'));
        console.log('  Package not yet published to npm registry');
        console.log('  Current version: ' + chalk.cyan(this.currentVersion));
        return false;
      }

      const isUpdateAvailable = compareVersions(latestVersion, this.currentVersion) > 0;

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

    } catch {
      spinner.stop();
      return await this.checkGitHubVersion();
    }
  }

  private async checkGitHubVersion(): Promise<boolean> {
    const spinner = ora('Checking GitHub for updates...').start();

    try {
      const { stdout } = await execAsync(
        `curl -sf https://api.github.com/repos/${GITHUB_REPO}/releases/latest | grep '"tag_name"' | cut -d'"' -f4`
      );

      const latestTag = stdout.trim().replace('v', '');
      spinner.stop();

      if (latestTag) {
        const isUpdateAvailable = compareVersions(latestTag, this.currentVersion) > 0;

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

    } catch {
      spinner.stop();
      console.log(chalk.yellow('Could not check for updates'));
      console.log(`  Current version: ${chalk.cyan(this.currentVersion)}`);
      return false;
    }
  }

  private async performUpgrade(options: UpgradeOptions): Promise<void> {
    console.log(chalk.bold.cyan('▪ AI Tools Upgrade'));
    console.log('─'.repeat(30));

    const hasUpdate = await this.checkForUpdates();

    if (!hasUpdate && !options.force) {
      return;
    }

    if (options.force) {
      console.log(chalk.yellow('\n! Force upgrade requested'));
    }

    const spinner = ora('Upgrading AI Tools...').start();

    try {
      const packageManager = await this.detectPackageManager();

      let command: string;
      switch (packageManager) {
        case 'bun':
          command = `bun add -g ${PACKAGE_NAME}`;
          break;
        case 'npm':
          command = `npm install -g ${PACKAGE_NAME}@latest`;
          break;
        case 'pnpm':
          command = `pnpm add -g ${PACKAGE_NAME}@latest`;
          break;
        default:
          command = `npm install -g ${PACKAGE_NAME}@latest`;
      }

      spinner.text = `Running: ${command}`;
      await execAsync(command);

      spinner.succeed('Upgrade completed successfully!');
      await this.verifyUpgrade();

    } catch {
      spinner.fail('Upgrade failed');

      console.log();
      console.log(chalk.yellow('▪ Manual Upgrade Instructions:'));
      console.log('─'.repeat(30));
      console.log('  Option 1 (npm):');
      console.log(chalk.cyan(`    npm install -g ${PACKAGE_NAME}@latest`));
      console.log();
      console.log('  Option 2 (bun):');
      console.log(chalk.cyan(`    bun add -g ${PACKAGE_NAME}`));
    }
  }

  private async detectPackageManager(): Promise<string> {
    const checks = [
      { cmd: `npm ls -g ${PACKAGE_NAME} 2>/dev/null`, manager: 'npm' },
      { cmd: `bun pm ls -g 2>/dev/null | grep aitools`, manager: 'bun' },
      { cmd: `pnpm ls -g ${PACKAGE_NAME} 2>/dev/null`, manager: 'pnpm' },
    ];

    for (const check of checks) {
      try {
        await execAsync(check.cmd);
        return check.manager;
      } catch {
        continue;
      }
    }

    return 'npm';
  }

  private async verifyUpgrade(): Promise<void> {
    try {
      const { stdout } = await execAsync('ai --version 2>/dev/null || aitools --version 2>/dev/null');
      const newVersion = stdout.trim().split(' ').pop();

      if (newVersion && newVersion !== this.currentVersion) {
        console.log();
        console.log(chalk.green(`✓ Successfully upgraded from ${this.currentVersion} to ${newVersion}`));
      }
    } catch {
      console.log();
      console.log(chalk.green('✓ Upgrade completed'));
      console.log(chalk.gray('  Restart your terminal to use the new version'));
    }
  }

}