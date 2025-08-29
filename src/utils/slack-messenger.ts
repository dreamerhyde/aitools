// path: src/utils/slack-messenger.ts

import chalk from 'chalk';
import { TaskNotification, SlackMessage } from '../types/notification.js';

/**
 * Handles Slack message building and sending
 */
export class SlackMessenger {
  private packageInfo: { name: string; version: string };

  constructor(packageInfo: { name: string; version: string }) {
    this.packageInfo = packageInfo;
  }

  /**
   * Build Slack message blocks with enhanced formatting
   */
  buildSlackMessage(notification: TaskNotification): SlackMessage {
    // Get first 50 characters of the user question for header, with better fallbacks
    let questionToShow = notification.userQuestion;
    
    // If no valid user question, extract from AI summary or use project info
    if (!questionToShow || questionToShow.startsWith('Caveat:') || questionToShow.includes('The messages below were generated')) {
      // Try to extract first sentence from AI summary as fallback
      if (notification.message) {
        const firstSentence = notification.message.split(/[.!?]\s+/)[0];
        if (firstSentence && firstSentence.length > 10 && firstSentence.length < 100) {
          questionToShow = firstSentence;
        }
      }
      
      // Final fallback: use project-based description
      if (!questionToShow) {
        questionToShow = `Task completed in ${notification.project}`;
      }
    }
    
    const truncatedQuestion = questionToShow.length > 50 
      ? questionToShow.substring(0, 50) + '...' 
      : questionToShow;
    
    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `✅ ${truncatedQuestion}`,
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
   * Build error notification message
   */
  buildErrorMessage(project: string, branch: string, time: string, error: string): SlackMessage {
    return {
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
              text: `*Project:*\n${project}`
            },
            {
              type: 'mrkdwn',
              text: `*Branch:*\n${branch}`
            },
            {
              type: 'mrkdwn',
              text: `*Time:*\n${time}`
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
  async sendToSlack(webhookUrl: string, message: SlackMessage): Promise<void> {
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

      if (process.env.DEBUG) {
        console.log(chalk.green('[DEBUG] Notification sent successfully'));
      }
    } catch (error) {
      console.error(chalk.yellow('Warning: Failed to send Slack notification'));
      if (process.env.DEBUG) {
        console.error(error);
      }
      throw error;
    }
  }
}