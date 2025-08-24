import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigManager } from './config-manager.js';
import { TaskNotification, SlackMessage, GitChanges } from '../types/notification.js';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execAsync = promisify(exec);

export class NotificationManager {
  private configManager: ConfigManager;
  private startTime: number;
  private timeFile: string;
  private packageInfo: { name: string; version: string };

  constructor(sessionId?: string) {
    this.configManager = new ConfigManager();
    this.startTime = Date.now();
    // Use session-specific or project-specific time tracking file
    const fileId = sessionId || this.getProjectHash();
    this.timeFile = path.join(os.tmpdir(), `aitools-task-${fileId}.json`);
    
    // Load package info
    this.packageInfo = { name: '@dreamerhyde/aitools', version: '1.0.0' };
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
   * Get a simple hash of the project path for unique time tracking
   */
  private getProjectHash(): string {
    const projectPath = process.cwd();
    let hash = 0;
    for (let i = 0; i < projectPath.length; i++) {
      const char = projectPath.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Start tracking task time (persisted to file)
   */
  async startTracking(): Promise<void> {
    this.startTime = Date.now();
    try {
      await fs.writeFile(this.timeFile, JSON.stringify({
        startTime: this.startTime,
        project: this.getProjectName(),
        branch: await this.getGitBranch()
      }));
    } catch (error) {
      // Ignore errors in time tracking
      if (process.env.DEBUG) {
        console.error('[DEBUG] Failed to save start time:', error);
      }
    }
  }

  /**
   * Load persisted start time if available
   */
  private async loadStartTime(): Promise<number> {
    try {
      const data = await fs.readFile(this.timeFile, 'utf-8');
      const parsed = JSON.parse(data);
      // Only use persisted time if it's from the same session (within 24 hours)
      const age = Date.now() - parsed.startTime;
      if (age > 0 && age < 24 * 60 * 60 * 1000) {
        return parsed.startTime;
      }
    } catch {
      // File doesn't exist or is invalid
    }
    return Date.now();
  }

  /**
   * Clean up time tracking file
   */
  private async cleanupTimeFile(): Promise<void> {
    try {
      await fs.unlink(this.timeFile);
    } catch {
      // File might not exist
    }
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
   * Extract task summary from recent Git activity or provide intelligent summary
   */
  private async extractTaskSummary(): Promise<string> {
    try {
      // Check if there was a recent commit (within last 5 minutes)
      const { stdout: lastCommitTime } = await execAsync('git log -1 --pretty=format:%ct 2>/dev/null || echo "0"');
      const commitTimestamp = parseInt(lastCommitTime) * 1000;
      const timeSinceCommit = Date.now() - commitTimestamp;
      
      // If there was a commit in the last 5 minutes, use its message
      if (timeSinceCommit < 5 * 60 * 1000) {
        const { stdout: recentCommit } = await execAsync('git log -1 --pretty=%B');
        if (recentCommit && recentCommit.trim()) {
          const summary = recentCommit.trim().split('\n')[0];
          if (summary.length > 100) {
            return summary.substring(0, 97) + '...';
          }
          return summary;
        }
      }

      // Try to analyze what changed to generate a smart summary
      const { stdout: diffFiles } = await execAsync('git diff HEAD --name-only 2>/dev/null || git diff --cached --name-only 2>/dev/null || git diff --name-only 2>/dev/null || true');
      if (diffFiles && diffFiles.trim()) {
        const files = diffFiles.trim().split('\n').filter(f => f);
        if (files.length > 0) {
          const fileTypes = new Set(files.map(f => path.extname(f).toLowerCase()).filter(ext => ext));
          const directories = new Set(files.map(f => path.dirname(f).split('/')[0]).filter(d => d !== '.'));
          
          // Generate intelligent summary based on changes
          if (fileTypes.has('.md')) {
            return 'Documentation updates';
          } else if (directories.has('test') || directories.has('tests')) {
            return 'Test updates and improvements';
          } else if (fileTypes.has('.json') && files.some(f => f.includes('package'))) {
            return 'Dependency updates';
          } else if (files.length === 1) {
            return `Updated ${path.basename(files[0])}`;
          } else if (files.length <= 3) {
            return `Updated ${files.map(f => path.basename(f)).join(', ')}`;
          } else {
            const uniqueDirs = Array.from(directories).slice(0, 2);
            if (uniqueDirs.length > 0) {
              return `Updates in ${uniqueDirs.join(' and ')}`;
            }
            return `Updated ${files.length} files`;
          }
        }
      }

      // Check for uncommitted changes
      const changes = await this.getGitChanges();
      if (changes.files > 0) {
        return changes.summary;
      }

      return 'Task completed';
    } catch (error) {
      if (process.env.DEBUG) {
        console.error('[DEBUG] Failed to extract summary:', error);
      }
      return 'Task completed';
    }
  }

  /**
   * Get Git changes summary (consistent with 'ai changes' command)
   */
  async getGitChanges(): Promise<GitChanges> {
    try {
      // Get untracked files
      const { stdout: untrackedFiles } = await execAsync('git ls-files --others --exclude-standard');
      const untracked = untrackedFiles.trim().split('\n').filter(f => f);
      
      // Get all changes since last commit (HEAD) - both staged and unstaged
      const { stdout: diffStat } = await execAsync('git diff HEAD --stat 2>/dev/null || echo ""');
      
      // Parse the stats from git diff
      let diffFiles = 0;
      let insertions = 0;
      let deletions = 0;
      
      const lines = diffStat.split('\n').filter(line => line.trim());
      const summaryLine = lines[lines.length - 1];
      
      if (summaryLine && summaryLine.includes('changed')) {
        const match = summaryLine.match(/(\d+)\s+files?\s+changed/);
        if (match) diffFiles = parseInt(match[1]);
        
        const insertMatch = summaryLine.match(/(\d+)\s+insertions?\(\+\)/);
        if (insertMatch) insertions = parseInt(insertMatch[1]);
        
        const deleteMatch = summaryLine.match(/(\d+)\s+deletions?\(-\)/);
        if (deleteMatch) deletions = parseInt(deleteMatch[1]);
      }
      
      // Get file status to show added/modified/deleted
      const { stdout: nameStatus } = await execAsync('git diff HEAD --name-status 2>/dev/null || echo ""');
      const statusLines = nameStatus.trim().split('\n').filter(l => l);
      
      let added = 0, modified = 0, deleted = 0;
      statusLines.forEach(line => {
        const status = line.charAt(0);
        if (status === 'A') added++;
        else if (status === 'M') modified++;
        else if (status === 'D') deleted++;
      });
      
      // Add untracked files to the count
      const newFiles = untracked.length;
      const totalFiles = diffFiles + newFiles;
      
      // Count lines in new files for insertion count
      if (newFiles > 0) {
        try {
          let newFileLines = 0;
          for (const file of untracked) {
            try {
              const { stdout: lineCount } = await execAsync(`wc -l < "${file}" 2>/dev/null || echo "0"`);
              newFileLines += parseInt(lineCount.trim()) || 0;
            } catch {
              // Ignore errors for individual files
            }
          }
          insertions += newFileLines;
        } catch {
          // Ignore errors counting lines
        }
      }
      
      // Build summary with file counts
      let summary = '';
      if (totalFiles > 0) {
        const parts = [];
        if (modified > 0) parts.push(`${modified} modified`);
        if (deleted > 0) parts.push(`${deleted} deleted`);
        if (newFiles > 0) parts.push(`${newFiles} new`);
        summary = `${totalFiles} files (${parts.join(', ')})`;
      } else {
        summary = 'No changes since last commit';
      }
      
      return {
        files: totalFiles,
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
   * Extract AI summary and timing from Claude Code transcript file
   */
  async extractAISummaryAndTiming(transcriptPath: string): Promise<{ summary?: string; duration?: number }> {
    try {
      // Read the JSONL transcript file
      const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
      const lines = transcriptContent.trim().split('\n');
      
      // Parse each line as JSON and look for assistant messages and timestamps
      let lastAssistantMessage = '';
      let messageCount = 0;
      let hasCodeBlocks = false;
      let lastUserTimestamp: string | null = null;
      let lastAssistantTimestamp: string | null = null;
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          // Capture user message timestamp
          if (entry.type === 'user' && entry.timestamp) {
            lastUserTimestamp = entry.timestamp;
          }
          
          // Look for assistant message entries (check both entry.type and entry.message structure)
          if (entry.type === 'assistant' && entry.message) {
            // Handle nested message structure from Claude Code transcripts
            const message = entry.message;
            if (message.role === 'assistant' && message.content) {
              messageCount++;
              lastAssistantTimestamp = entry.timestamp; // Capture assistant timestamp
              // Extract text content from the message
              if (typeof message.content === 'string') {
                lastAssistantMessage = message.content;
              } else if (Array.isArray(message.content)) {
                // Content is an array of content blocks
                const textBlocks = message.content
                  .filter((block: any) => block.type === 'text')
                  .map((block: any) => block.text || '')
                  .join(' ');
                if (textBlocks) {
                  lastAssistantMessage = textBlocks;
                  // Check if message contains code blocks
                  if (textBlocks.includes('```')) {
                    hasCodeBlocks = true;
                  }
                }
              }
            }
          } else if (entry.type === 'message' && entry.role === 'assistant' && entry.content) {
            // Alternative format (simpler structure)
            messageCount++;
            if (typeof entry.content === 'string') {
              lastAssistantMessage = entry.content;
            } else if (Array.isArray(entry.content)) {
              const textBlocks = entry.content
                .filter((block: any) => block.type === 'text')
                .map((block: any) => block.text || '')
                .join(' ');
              if (textBlocks) {
                lastAssistantMessage = textBlocks;
                if (textBlocks.includes('```')) {
                  hasCodeBlocks = true;
                }
              }
            }
          }
        } catch (parseError) {
          // Skip invalid JSON lines
          continue;
        }
      }
      
      if (lastAssistantMessage) {
        // Preserve markdown formatting but clean up for Slack
        let summary = lastAssistantMessage;
        
        // Convert markdown code blocks to Slack format
        summary = summary.replace(/```(\w+)?\n/g, '```');
        
        // Preserve bullet points and numbered lists
        summary = summary.replace(/^(\d+)\.\s+/gm, '$1. ');
        summary = summary.replace(/^[-*]\s+/gm, '• ');
        
        // Keep first 2000 characters for more context
        if (summary.length > 2000) {
          // Try to cut at a sentence boundary
          const cutPoint = summary.lastIndexOf('. ', 1997);
          if (cutPoint > 1500) {
            summary = summary.substring(0, cutPoint + 1) + '...';
          } else {
            summary = summary.substring(0, 1997) + '...';
          }
        }
        
        // Add context about the conversation
        const conversationContext = [];
        if (messageCount > 1) {
          conversationContext.push(`_${messageCount} AI responses_`);
        }
        if (hasCodeBlocks) {
          conversationContext.push(`_includes code changes_`);
        }
        
        if (conversationContext.length > 0) {
          summary = `${summary}\n\n${conversationContext.join(' | ')}`;
        }
        
        // Calculate duration from last user message to last assistant response
        let duration: number | undefined;
        if (lastUserTimestamp && lastAssistantTimestamp) {
          const userTime = new Date(lastUserTimestamp).getTime();
          const assistantTime = new Date(lastAssistantTimestamp).getTime();
          duration = assistantTime - userTime;
        }
        
        return { summary, duration };
      }
      
      if (process.env.DEBUG) {
        console.error('[DEBUG] No assistant messages found in transcript');
      }
      
      // Calculate duration even if no assistant messages
      let duration: number | undefined;
      if (lastUserTimestamp && lastAssistantTimestamp) {
        const userTime = new Date(lastUserTimestamp).getTime();
        const assistantTime = new Date(lastAssistantTimestamp).getTime();
        duration = assistantTime - userTime;
      }
      
      return { duration };
    } catch (error) {
      if (process.env.DEBUG) {
        console.error('[DEBUG] Failed to read transcript:', error);
      }
      return {};
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
   * Build Slack message blocks with enhanced formatting
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
      }
    ];

    // Project and branch context with emoji
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📁 *${notification.project}* | 🌿 *${notification.branch}* | ⏱️ *${notification.spent}* | 📅 ${notification.finished}`
        }
      ]
    });

    // Add divider for visual separation
    blocks.push({ type: 'divider' });

    // Git changes section with detailed breakdown
    if (notification.changes.files > 0) {
      const changeDetails = [];
      
      // Parse the summary to get file type counts
      const summaryMatch = notification.changes.summary.match(/(\d+) files \((.*?)\)/);
      let fileBreakdown = notification.changes.summary;
      if (summaryMatch && summaryMatch[2]) {
        fileBreakdown = summaryMatch[2];
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📊 Git Changes*`
        }
      });

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`\`\`${notification.changes.files} files (${fileBreakdown})\n+${notification.changes.insertions} additions\n-${notification.changes.deletions} deletions\`\`\``
        }
      });

      // Visual progress bar for changes (15 blocks total)
      const totalChanges = notification.changes.insertions + notification.changes.deletions;
      if (totalChanges > 0) {
        const barLength = 15; // Total number of blocks
        const addBlocks = Math.round((notification.changes.insertions / totalChanges) * barLength);
        const delBlocks = barLength - addBlocks;
        
        // Create the progress bar with better visual balance
        const progressBar = '🟩'.repeat(Math.max(1, addBlocks)) + '🟥'.repeat(Math.max(1, delBlocks));
        
        // Calculate percentages for display
        const addPercent = Math.round((notification.changes.insertions / totalChanges) * 100);
        const delPercent = 100 - addPercent;
        
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `${progressBar}\n_${addPercent}% additions | ${delPercent}% deletions_`
            }
          ]
        });
      }
    } else {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📊 Git Changes*\n_No uncommitted changes_`
        }
      });
    }

    // Add divider before summary
    blocks.push({ type: 'divider' });

    // Enhanced AI summary section with markdown support
    if (notification.message) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🤖 AI Summary*`
        }
      });

      // Split long messages into multiple blocks if needed
      const maxLength = 3000; // Slack's limit for text blocks
      if (notification.message.length > maxLength) {
        const chunks = this.splitMessage(notification.message, maxLength);
        chunks.forEach(chunk => {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: chunk
            }
          });
        });
      } else {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: notification.message
          }
        });
      }
    }

    // Add footer with metadata
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Generated by ${this.packageInfo.name} v${this.packageInfo.version}_`
        }
      ]
    });

    return { blocks };
  }

  /**
   * Split long message into chunks
   */
  private splitMessage(message: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    
    const lines = message.split('\n');
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = line;
        } else {
          // Single line is too long, split it
          chunks.push(line.substring(0, maxLength));
          currentChunk = line.substring(maxLength);
        }
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
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
  async sendTaskComplete(message: string = '', overrideDuration?: number): Promise<void> {
    try {
      // Ensure package info is loaded
      await this.loadPackageInfo();
      
      await this.configManager.load();
      const config = this.configManager.getConfig();
      
      // Get webhook URL from config or environment
      const webhookUrl = this.configManager.getValue('slack_webhook_url');
      
      // Check if notifications are enabled
      if (!webhookUrl || !config.notifications?.enabled) {
        if (process.env.DEBUG) {
          console.log(chalk.gray('[DEBUG] Notification skipped: webhook=' + (webhookUrl ? 'set' : 'not set') + ', enabled=' + config.notifications?.enabled));
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

      // Use override duration if provided (from transcript), otherwise calculate from persisted time
      let timeSpent: number;
      if (overrideDuration !== undefined) {
        timeSpent = overrideDuration;
      } else {
        const actualStartTime = await this.loadStartTime();
        timeSpent = Date.now() - actualStartTime;
      }
      
      // Extract intelligent summary if no message provided
      const finalMessage = message && message !== 'Task completed successfully' 
        ? message 
        : await this.extractTaskSummary();

      // Build notification data
      const notification: TaskNotification = {
        project: this.getProjectName(),
        branch: await this.getGitBranch(),
        spent: this.formatSmartTime(timeSpent),
        changes: await this.getGitChanges(),
        finished: this.formatFinishedTime(),
        message: finalMessage
      };

      // Clean up time tracking file after successful notification
      await this.cleanupTimeFile();

      // Build and send Slack message
      const slackMessage = this.buildSlackMessage(notification);
      
      if (process.env.DEBUG) {
        console.log(chalk.gray('[DEBUG] Sending notification to Slack...'));
      }
      
      await this.sendToSlack(webhookUrl, slackMessage);
      
      if (process.env.DEBUG) {
        console.log(chalk.green('[DEBUG] Notification sent successfully'));
      }
      
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

      await this.sendToSlack(webhookUrl, message);
      
    } catch (error) {
      // Silently fail
      if (process.env.DEBUG) {
        console.error('Error notification failed:', error);
      }
    }
  }
}