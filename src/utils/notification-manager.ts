// path: src/utils/notification-manager.ts

import chalk from 'chalk';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ConfigManager } from './config-manager.js';
import { TimeTracker } from './time-tracker.js';
import { GitAnalyzer } from './git-analyzer.js';
import { SlackMessenger } from './slack-messenger.js';
import { TranscriptParser } from './transcript-parser.js';
import { TaskNotification } from '../types/notification.js';

/**
 * Manages task notifications and orchestrates notification components
 */
export class NotificationManager {
  private configManager: ConfigManager;
  private timeTracker: TimeTracker;
  private gitAnalyzer: GitAnalyzer;
  private slackMessenger: SlackMessenger;
  private transcriptParser: TranscriptParser;
  private packageInfo: { name: string; version: string };

  constructor(sessionId?: string) {
    this.configManager = new ConfigManager();
    this.timeTracker = new TimeTracker(sessionId);
    this.gitAnalyzer = new GitAnalyzer();
    this.transcriptParser = new TranscriptParser();
    
    // Load package info
    this.packageInfo = { name: '@dreamerhyde/aitools', version: '1.0.0' };
    this.slackMessenger = new SlackMessenger(this.packageInfo);
    this.loadPackageInfo();
  }

  /**
   * Load package.json info dynamically
   */
  private async loadPackageInfo(): Promise<void> {
    try {
      // Try multiple possible locations for package.json
      const possiblePaths = [
        join(process.cwd(), 'package.json'), // Current working directory
        join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), // Relative to source
        join(dirname(fileURLToPath(import.meta.url)), '../package.json'), // Relative to dist
        '/Users/albertliu/repositories/aitools/package.json' // Fallback absolute path
      ];
      
      for (const packagePath of possiblePaths) {
        try {
          const packageContent = await fs.readFile(packagePath, 'utf-8');
          const pkg = JSON.parse(packageContent);
          this.packageInfo = {
            name: pkg.name || '@dreamerhyde/aitools',
            version: pkg.version || '1.0.0'
          };
          // Update slack messenger with new package info
          this.slackMessenger = new SlackMessenger(this.packageInfo);
          return; // Successfully loaded, exit
        } catch {
          // Try next path
          continue;
        }
      }
      
      // If none worked, use defaults
      throw new Error('Could not find package.json');
    } catch (error) {
      // Use defaults if can't load package.json
      if (process.env.DEBUG) {
        console.error('[DEBUG] Failed to load package.json, using defaults:', error);
      }
    }
  }

  /**
   * Start tracking task time
   */
  async startTracking(): Promise<void> {
    const project = this.gitAnalyzer.getProjectName();
    const branch = await this.gitAnalyzer.getGitBranch();
    await this.timeTracker.startTracking(project, branch);
  }

  /**
   * Get Git changes summary
   */
  async getGitChanges() {
    return this.gitAnalyzer.getGitChanges();
  }

  /**
   * Extract AI summary and timing from transcript
   */
  async extractAISummaryAndTiming(transcriptPath: string) {
    return this.transcriptParser.extractAISummaryAndTiming(transcriptPath);
  }

  /**
   * Check if notifications are enabled and configured
   */
  private async isNotificationEnabled(): Promise<{ enabled: boolean; webhookUrl?: string }> {
    await this.configManager.load();
    const config = this.configManager.getConfig();
    
    // Get webhook URL from config or environment
    const webhookUrl = this.configManager.getValue('slack_webhook_url');
    
    // Check if notifications are enabled
    if (!webhookUrl || !config.notifications?.enabled) {
      if (process.env.DEBUG) {
        console.log(chalk.gray('[DEBUG] Notification skipped: webhook=' + (webhookUrl ? 'set' : 'not set') + ', enabled=' + config.notifications?.enabled));
      }
      return { enabled: false };
    }
    
    // Check if webhook URL is still a placeholder
    if (webhookUrl.includes('YOUR/WEBHOOK/URL')) {
      if (process.env.DEBUG) {
        console.log(chalk.yellow('Slack webhook URL not configured (still using placeholder)'));
      }
      return { enabled: false };
    }

    return { enabled: true, webhookUrl };
  }

  /**
   * Send task completion notification
   */
  async sendTaskComplete(message: string = '', overrideDuration?: number): Promise<void> {
    try {
      // Ensure package info is loaded
      await this.loadPackageInfo();
      
      const { enabled, webhookUrl } = await this.isNotificationEnabled();
      if (!enabled || !webhookUrl) {
        return;
      }

      // Use override duration if provided (from transcript), otherwise calculate from persisted time
      let timeSpent: number;
      if (overrideDuration !== undefined) {
        timeSpent = overrideDuration;
      } else {
        const actualStartTime = await this.timeTracker.loadStartTime();
        timeSpent = Date.now() - actualStartTime;
      }
      
      // Extract intelligent summary if no message provided
      const finalMessage = message && message !== 'Task completed successfully' 
        ? message 
        : await this.gitAnalyzer.extractTaskSummary();

      // Build notification data
      const notification: TaskNotification = {
        project: this.gitAnalyzer.getProjectName(),
        branch: await this.gitAnalyzer.getGitBranch(),
        spent: this.timeTracker.formatSmartTime(timeSpent),
        changes: await this.gitAnalyzer.getGitChanges(),
        finished: this.timeTracker.formatFinishedTime(),
        message: finalMessage
      };

      // Clean up time tracking file after successful notification
      await this.timeTracker.cleanupTimeFile();

      // Build and send Slack message
      const slackMessage = this.slackMessenger.buildSlackMessage(notification);
      
      if (process.env.DEBUG) {
        console.log(chalk.gray('[DEBUG] Sending notification to Slack...'));
      }
      
      await this.slackMessenger.sendToSlack(webhookUrl, slackMessage);
      
    } catch (error) {
      // Silently fail - notifications should not break the main flow
      if (process.env.DEBUG) {
        console.error('[DEBUG] Notification error:', error);
      }
    }
  }

  /**
   * Send error notification
   */
  async sendTaskError(error: string): Promise<void> {
    try {
      await this.configManager.load();
      const config = this.configManager.getConfig();
      
      // Get webhook URL from config or environment
      const webhookUrl = this.configManager.getValue('slack_webhook_url');
      
      // Check if error notifications are enabled
      if (!webhookUrl || !config.notifications?.on_error) {
        if (process.env.DEBUG) {
          console.log(chalk.gray('[DEBUG] Error notification skipped: webhook=' + (webhookUrl ? 'set' : 'not set') + ', on_error=' + config.notifications?.on_error));
        }
        return;
      }
      
      // Check if webhook URL is still a placeholder
      if (webhookUrl.includes('YOUR/WEBHOOK/URL')) {
        if (process.env.DEBUG) {
          console.log(chalk.yellow('Slack webhook URL not configured (still using placeholder)'));
        }
        return;
      }

      const message = this.slackMessenger.buildErrorMessage(
        this.gitAnalyzer.getProjectName(),
        await this.gitAnalyzer.getGitBranch(),
        this.timeTracker.formatFinishedTime(),
        error
      );

      await this.slackMessenger.sendToSlack(webhookUrl, message);
      
    } catch (error) {
      // Silently fail
      if (process.env.DEBUG) {
        console.error('Error notification failed:', error);
      }
    }
  }
}