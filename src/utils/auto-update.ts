import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import chalk from 'chalk';
import { isNewerVersion } from './version.js';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

const PACKAGE_NAME = '@dreamerhyde/aitools';
const CONFIG_DIR = join(homedir(), '.aitools');
const CONFIG_PATH = join(CONFIG_DIR, 'update.json');
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

interface UpdateConfig {
  lastCheck: string;
  currentVersion: string;
  latestVersion: string;
  notified: boolean;
}

function readConfig(): UpdateConfig | null {
  try {
    if (!existsSync(CONFIG_PATH)) return null;
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function writeConfig(config: UpdateConfig): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch {
    // Ignore write errors
  }
}

function getCurrentVersion(): string {
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

export class AutoUpdateChecker {
  static async checkInBackground(): Promise<void> {
    if (process.env.CI || process.env.NO_UPDATE_CHECK) return;

    const config = readConfig();
    if (config) {
      const elapsed = Date.now() - new Date(config.lastCheck).getTime();
      if (elapsed < CHECK_INTERVAL) return;
    }

    this.performCheck().catch(() => {});
  }

  private static async performCheck(): Promise<void> {
    const currentVersion = getCurrentVersion();

    const { stdout } = await execAsync(
      `npm view ${PACKAGE_NAME} version 2>/dev/null`,
      { timeout: 5000 }
    );
    const latestVersion = stdout.trim();
    if (!latestVersion) return;

    const hasUpdate = isNewerVersion(latestVersion, currentVersion);
    const prevConfig = readConfig();
    const alreadyNotified = prevConfig?.notified && prevConfig.latestVersion === latestVersion;

    writeConfig({
      lastCheck: new Date().toISOString(),
      currentVersion,
      latestVersion,
      notified: hasUpdate && (alreadyNotified || false),
    });

    if (hasUpdate && !alreadyNotified) {
      // Mark as notified before showing
      writeConfig({
        lastCheck: new Date().toISOString(),
        currentVersion,
        latestVersion,
        notified: true,
      });

      console.log();
      console.log(chalk.dim('─'.repeat(50)));
      console.log(chalk.yellow('▪'), chalk.bold('Update Available for AI Tools'));
      console.log(chalk.gray(`  Current: ${currentVersion} → Latest: ${chalk.green(latestVersion)}`));
      console.log(chalk.gray(`  Run ${chalk.cyan('ai upgrade')} to update`));
      console.log(chalk.dim('─'.repeat(50)));
      console.log();
    }
  }
}