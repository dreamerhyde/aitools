import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const execAsync = promisify(exec);

export class AutoUpdateChecker {
  private static CONFIG_PATH = join(homedir(), '.aitools', 'update.json');
  private static CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  
  static async checkInBackground(): Promise<void> {
    // Don't check in CI environments
    if (process.env.CI || process.env.NO_UPDATE_CHECK) {
      return;
    }
    
    // Check if we should check for updates
    if (!this.shouldCheck()) {
      return;
    }
    
    // Run check in background, don't block main process
    this.performBackgroundCheck().catch(() => {
      // Silently ignore errors in background check
    });
  }
  
  private static shouldCheck(): boolean {
    try {
      if (!existsSync(this.CONFIG_PATH)) {
        return true;
      }
      
      const config = JSON.parse(readFileSync(this.CONFIG_PATH, 'utf-8'));
      const lastCheck = new Date(config.lastCheck);
      const now = new Date();
      
      return (now.getTime() - lastCheck.getTime()) > this.CHECK_INTERVAL;
    } catch {
      return true;
    }
  }
  
  private static async performBackgroundCheck(): Promise<void> {
    try {
      // Get current version
      const packagePath = join(__dirname, '../../package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
      const currentVersion = packageJson.version;
      
      // Check latest version from npm
      const { stdout } = await execAsync('npm view aitools version 2>/dev/null', {
        timeout: 5000 // 5 second timeout
      });
      
      const latestVersion = stdout.trim();
      
      if (!latestVersion) {
        return;
      }
      
      // Save check timestamp
      this.saveCheckTimestamp(currentVersion, latestVersion);
      
      // Compare versions
      if (this.isNewerVersion(latestVersion, currentVersion)) {
        this.showUpdateNotification(currentVersion, latestVersion);
      }
      
    } catch {
      // Silently fail - this is a background check
    }
  }
  
  private static saveCheckTimestamp(current: string, latest: string): void {
    try {
      const configDir = join(homedir(), '.aitools');
      if (!existsSync(configDir)) {
        const { mkdirSync } = require('fs');
        mkdirSync(configDir, { recursive: true });
      }
      
      const config = {
        lastCheck: new Date().toISOString(),
        currentVersion: current,
        latestVersion: latest,
        notified: false
      };
      
      writeFileSync(this.CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch {
      // Ignore save errors
    }
  }
  
  private static showUpdateNotification(current: string, latest: string): void {
    // Only show notification once per version
    try {
      const config = JSON.parse(readFileSync(this.CONFIG_PATH, 'utf-8'));
      if (config.notified && config.latestVersion === latest) {
        return;
      }
      
      // Update notified flag
      config.notified = true;
      writeFileSync(this.CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch {
      // Continue with notification
    }
    
    // Show subtle notification
    console.log();
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.yellow('▪'), chalk.bold('Update Available for AI Tools'));
    console.log(chalk.gray(`  Current: ${current} → Latest: ${chalk.green(latest)}`));
    console.log(chalk.gray(`  Run ${chalk.cyan('ai upgrade')} to update`));
    console.log(chalk.dim('─'.repeat(50)));
    console.log();
  }
  
  private static isNewerVersion(v1: string, v2: string): boolean {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 > part2) return true;
      if (part1 < part2) return false;
    }
    
    return false;
  }
  
  static async disableAutoCheck(): Promise<void> {
    try {
      const config = existsSync(this.CONFIG_PATH) 
        ? JSON.parse(readFileSync(this.CONFIG_PATH, 'utf-8'))
        : {};
      
      config.disabled = true;
      
      const configDir = join(homedir(), '.aitools');
      if (!existsSync(configDir)) {
        const { mkdirSync } = require('fs');
        mkdirSync(configDir, { recursive: true });
      }
      
      writeFileSync(this.CONFIG_PATH, JSON.stringify(config, null, 2));
      console.log(chalk.green('✓ Auto-update check disabled'));
      console.log(chalk.gray('  You can re-enable it with: ai config --enable-updates'));
    } catch (error) {
      console.log(chalk.red('Failed to disable auto-update check'));
    }
  }
  
  static async enableAutoCheck(): Promise<void> {
    try {
      const config = existsSync(this.CONFIG_PATH) 
        ? JSON.parse(readFileSync(this.CONFIG_PATH, 'utf-8'))
        : {};
      
      config.disabled = false;
      
      const configDir = join(homedir(), '.aitools');
      if (!existsSync(configDir)) {
        const { mkdirSync } = require('fs');
        mkdirSync(configDir, { recursive: true });
      }
      
      writeFileSync(this.CONFIG_PATH, JSON.stringify(config, null, 2));
      console.log(chalk.green('✓ Auto-update check enabled'));
    } catch (error) {
      console.log(chalk.red('Failed to enable auto-update check'));
    }
  }
}