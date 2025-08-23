import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigManager } from './config-manager.js';
import { TaskNotification, SlackMessage, GitChanges } from '../types/notification.js';
import path from 'path';
import chalk from 'chalk';

const execAsync = promisify(exec);

export class NotificationManager {
  private configManager: ConfigManager;
  private startTime: number;

  constructor() {
    this.configManager = new ConfigManager();
    this.startTime = Date.now();
  }

  /**
   * Start tracking task time
   */
  startTracking(): void {
    this.startTime = Date.now();
  }

  /**
   * Format time duration smartly (e.g., "2m 15s", "45s", "1h 23m")
   */
  private formatSmartTime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  }

  /**
   * Get current Git branch name
   */
  private async getGitBranch(): Promise<string> {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD');
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get Git changes summary
   */
  async getGitChanges(): Promise<GitChanges> {
    try {
      // Get diff stats
      const { stdout: diffStat } = await execAsync('git diff --stat');
      const { stdout: stagedStat } = await execAsync('git diff --cached --stat');
      
      // Parse the stats
      let files = 0;
      let insertions = 0;
      let deletions = 0;
      
      const parseStats = (stats: string) => {
        const lines = stats.split('\n').filter(line => line.trim());
        const summaryLine = lines[lines.length - 1];
        
        if (summaryLine && summaryLine.includes('changed')) {
          const match = summaryLine.match(/(\d+)\s+files?\s+changed/);
          if (match) files += parseInt(match[1]);
          
          const insertMatch = summaryLine.match(/(\d+)\s+insertions?\(\+\)/);
          if (insertMatch) insertions += parseInt(insertMatch[1]);
          
          const deleteMatch = summaryLine.match(/(\d+)\s+deletions?\(-\)/);
          if (deleteMatch) deletions += parseInt(deleteMatch[1]);
        }
      };
      
      parseStats(diffStat);
      parseStats(stagedStat);
      
      // Get changed file list for summary
      const { stdout: fileList } = await execAsync('git diff --name-only');
      const { stdout: stagedList } = await execAsync('git diff --cached --name-only');
      const changedFiles = [...new Set([
        ...fileList.split('\n').filter(f => f),
        ...stagedList.split('\n').filter(f => f)
      ])];
      
      const summary = changedFiles.length > 0 
        ? `Modified: ${changedFiles.slice(0, 3).join(', ')}${changedFiles.length > 3 ? ` and ${changedFiles.length - 3} more` : ''}`
        : 'No changes';
      
      return {
        files,
        insertions,
        deletions,
        summary
      };
    } catch (error) {
      return {
        files: 0,
        insertions: 0,
        deletions: 0,
        summary: 'Unable to get Git changes'
      };
    }
  }

  /**
   * Get project name from current directory
   */
  private getProjectName(): string {
    return path.basename(process.cwd());
  }

  /**
   * Format current time
   */
  private formatFinishedTime(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  /**
   * Build Slack message blocks
   */
  private buildSlackMessage(notification: TaskNotification): SlackMessage {
    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '✅ AI Tools Task Completed',
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Project:*\n${notification.project}`
          },
          {
            type: 'mrkdwn',
            text: `*Branch:*\n${notification.branch}`
          },
          {
            type: 'mrkdwn',
            text: `*Time Spent:*\n${notification.spent}`
          },
          {
            type: 'mrkdwn',
            text: `*Finished:*\n${notification.finished}`
          }
        ]
      }
    ];

    // Add changes section if there are any
    if (notification.changes.files > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Changes:*\n• ${notification.changes.files} files changed\n• ${notification.changes.insertions} insertions(+)\n• ${notification.changes.deletions} deletions(-)`
        }
      });
    }

    // Add message/summary if provided
    if (notification.message) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Summary:*\n${notification.message}`
        }
      });
    }

    // Add divider at the end
    blocks.push({
      type: 'divider'
    });

    return { blocks };
  }

  /**
   * Send notification to Slack
   */
  private async sendToSlack(webhookUrl: string, message: SlackMessage): Promise<void> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        throw new Error(`Slack API returned ${response.status}`);
      }
    } catch (error) {
      console.error(chalk.yellow('Warning: Failed to send Slack notification'));
      if (process.env.DEBUG) {
        console.error(error);
      }
    }
  }

  /**
   * Send task completion notification
   */
  async sendTaskComplete(message: string = ''): Promise<void> {
    try {
      await this.configManager.load();
      const config = this.configManager.getConfig();
      
      // Check if notifications are enabled
      if (!config.slack_webhook_url || !config.notifications?.enabled) {
        return;
      }
      
      // Check if webhook URL is still a placeholder
      if (config.slack_webhook_url.includes('YOUR/WEBHOOK/URL')) {
        if (process.env.DEBUG) {
          console.log(chalk.yellow('Slack webhook URL not configured (still using placeholder)'));
        }
        return;
      }

      // Build notification data
      const notification: TaskNotification = {
        project: this.getProjectName(),
        branch: await this.getGitBranch(),
        spent: this.formatSmartTime(Date.now() - this.startTime),
        changes: await this.getGitChanges(),
        finished: this.formatFinishedTime(),
        message
      };

      // Build and send Slack message
      const slackMessage = this.buildSlackMessage(notification);
      await this.sendToSlack(config.slack_webhook_url, slackMessage);
      
    } catch (error) {
      // Silently fail - notifications should not break the main flow
      if (process.env.DEBUG) {
        console.error('Notification error:', error);
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
      
      // Check if error notifications are enabled
      if (!config.slack_webhook_url || !config.notifications?.on_error) {
        return;
      }
      
      // Check if webhook URL is still a placeholder
      if (config.slack_webhook_url.includes('YOUR/WEBHOOK/URL')) {
        if (process.env.DEBUG) {
          console.log(chalk.yellow('Slack webhook URL not configured (still using placeholder)'));
        }
        return;
      }

      const message: SlackMessage = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '❌ AI Tools Task Failed',
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Project:*\n${this.getProjectName()}`
              },
              {
                type: 'mrkdwn',
                text: `*Branch:*\n${await this.getGitBranch()}`
              },
              {
                type: 'mrkdwn',
                text: `*Time:*\n${this.formatFinishedTime()}`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Error:*\n${error}`
            }
          },
          {
            type: 'divider'
          }
        ]
      };

      await this.sendToSlack(config.slack_webhook_url, message);
      
    } catch (error) {
      // Silently fail
      if (process.env.DEBUG) {
        console.error('Error notification failed:', error);
      }
    }
  }
}