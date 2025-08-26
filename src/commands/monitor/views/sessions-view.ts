import chalk from 'chalk';
import { SessionInfo, CostMetrics } from '../types.js';
import { formatActiveSessionsList } from '../../../utils/formatters.js';
import { SessionUsage } from '../../../types/claude-usage.js';
import { statusTracker } from '../../../utils/status-tracker.js';
import { getActionColor } from '../../../utils/text-sanitizer.js';

export class SessionsView {
  private projectsBox: any;
  private sessionsBox: any;
  private screenManager: any;
  private grid: any;

  constructor(screenManager: any, grid: any) {
    this.screenManager = screenManager;
    this.grid = grid;
  }

  initialize(): void {
    const blessed = this.screenManager.getBlessed();
    const screen = this.screenManager.getScreen();
    
    // Projects box - fixed height 8 lines
    this.projectsBox = blessed.box({
      parent: screen,
      top: 0,
      left: '66%', // Start after left side
      width: '17%', // 2/12 columns
      height: 8, // Fixed height
      label: ' Projects ',
      border: { type: 'line', fg: 'gray' },
      style: {
        fg: 'white',
        border: { fg: 'gray' }
      },
      padding: {
        left: 1,
        right: 0,
        top: 1,
        bottom: 1
      }
    });

    // Sessions box - fixed height 8 lines
    this.sessionsBox = blessed.box({
      parent: screen,
      top: 0,
      left: '83%', // Start after Projects
      width: '17%', // 2/12 columns
      height: 8, // Fixed height
      label: ' Sessions ',
      border: { type: 'line', fg: 'gray' },
      style: {
        fg: 'white',
        border: { fg: 'gray' }
      },
      padding: {
        left: 1,
        right: 0,
        top: 1,
        bottom: 1
      }
    });
  }

  updateActiveSessionsList(activeSessions: Map<string, SessionInfo>, costMetrics?: CostMetrics, todayProjectCosts?: Map<string, number>): void {
    if (!this.projectsBox || !this.sessionsBox) return;
    
    const activeCount = activeSessions.size;
    
    if (activeCount > 0) {
      // Get unique projects with session counts, message counts, and token counts
      const projectMap = new Map<string, { sessionCount: number, messageCount: number, tokenCount: number }>();
      let totalMessages = 0;
      let totalTokens = 0;
      
      for (const [id, session] of activeSessions) {
        const project = session.user;
        const existing = projectMap.get(project) || { sessionCount: 0, messageCount: 0, tokenCount: 0 };
        
        // Calculate tokens for this session
        let sessionTokens = 0;
        for (const message of session.recentMessages) {
          if (message.tokens) {
            sessionTokens += message.tokens;
          }
        }
        
        projectMap.set(project, {
          sessionCount: existing.sessionCount + 1,
          messageCount: existing.messageCount + session.messageCount,
          tokenCount: existing.tokenCount + sessionTokens
        });
        totalMessages += session.messageCount;
        totalTokens += sessionTokens;
      }
      
      // Update Projects box (left) - show cost per project
      const projectLines = [];
      let i = 0;
      for (const [project, data] of projectMap) {
        if (i >= 3) {
          projectLines.push(chalk.gray(`+${projectMap.size - 3} more`));
          break;
        }
        const shortName = project.split('/').pop() || project;
        
        // Use actual project costs from today's session data
        let projectCost = 0;
        if (todayProjectCosts) {
          // Try to match project by name first (from cwd data)
          const projectKeys = Array.from(todayProjectCosts.keys());
          const matchingKey = projectKeys.find(key => {
            const shortKey = key.split('/').pop() || key;
            return shortKey === shortName || key === project;
          });
          
          if (matchingKey) {
            projectCost = todayProjectCosts.get(matchingKey) || 0;
          } else {
            // Fallback: distribute costs proportionally if no direct match
            const totalCost = Array.from(todayProjectCosts.values()).reduce((sum, cost) => sum + cost, 0);
            if (totalCost > 0 && totalMessages > 0) {
              const messageRatio = data.messageCount / totalMessages;
              projectCost = totalCost * messageRatio;
            }
          }
        }
        
        // Always show the project with cost if available, or just the name
        if (projectCost > 0) {
          projectLines.push(chalk.cyan(`• ${shortName} `) + chalk.green(`$${projectCost.toFixed(2)}`));
        } else {
          // Show $0.00 for projects with 0 messages to make it visible
          projectLines.push(chalk.cyan(`• ${shortName} `) + chalk.gray(`$0.00`));
        }
        i++;
      }
      
      if (projectLines.length === 0) {
        projectLines.push(chalk.gray('No projects'));
      }
      
      this.projectsBox.setContent(projectLines.join('\n'));
      
      // Update Sessions box (right)
      const sessionLines = [];
      
      // Get enhanced status from status tracker
      const sessionCounts = statusTracker.getSessionCounts();
      
      // Update status tracker with current sessions
      for (const [id, session] of activeSessions) {
        statusTracker.updateSessionStatus(id, session.currentAction || null, session.messageCount);
      }
      
      // Dynamic color based on activity and message count
      let activeColor = chalk.green;
      let statusText = `${activeCount} active`;
      
      // Debug: log message count for troubleshooting
      if (process.env.DEBUG_SESSIONS) {
        console.log(`[Sessions View] totalMessages: ${totalMessages}, thinking: ${sessionCounts.thinking}`);
      }
      
      if (sessionCounts.thinking > 0) {
        activeColor = chalk.cyan;
        statusText = `${activeCount} active (${sessionCounts.thinking} thinking)`;
      } else if (totalMessages > 100) {
        activeColor = chalk.red;
        statusText = `${activeCount} active (high activity)`;
      } else if (totalMessages > 50) {
        activeColor = chalk.yellow;
        statusText = `${activeCount} active (moderate)`;
      }
      
      // Lower thresholds for testing
      if (totalMessages > 20 && totalMessages <= 50) {
        activeColor = chalk.yellow;
        statusText = `${activeCount} active (moderate)`;
      } else if (totalMessages > 10 && totalMessages <= 20) {
        activeColor = chalk.cyan;
        statusText = `${activeCount} active (active)`;
      }
      
      sessionLines.push(activeColor.bold(statusText));
      sessionLines.push(chalk.yellow(`${totalMessages} msgs`));
      
      this.sessionsBox.setContent(sessionLines.join('\n'));
    } else {
      this.projectsBox.setContent(chalk.gray('No active projects'));
      this.sessionsBox.setContent(chalk.gray('0 active\n0 messages'));
    }
    
    this.screenManager.render();
  }

  destroy(): void {
    // Cleanup if needed
  }
}