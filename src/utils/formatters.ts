/**
 * Utility functions for formatting numbers and costs
 */
import chalk from 'chalk';

// Session info interface - compatible with monitor implementations
export interface SessionInfo {
  sessionId: string;
  user: string;
  startTime: Date;
  lastActivity: Date;
  messageCount: number;
  recentMessages: any[];
  currentTopic?: string;
  currentModel?: string;
  currentAction?: string;
}

/**
 * Format a number with thousands separators
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format a cost value as a currency string
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * Format bytes to human readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format duration in milliseconds to human readable time
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Format percentage value
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Formats the active sessions list for the Projects box display
 * @param activeSessions - Map of active sessions
 * @returns Array of formatted strings ready for display
 */
export function formatActiveSessionsList(activeSessions: Map<string, SessionInfo>): string[] {
  const projectInfo = [];
  const activeCount = activeSessions.size;
  
  if (activeCount > 0) {
    // Get unique projects with session counts
    const projectMap = new Map<string, number>();
    let totalMessages = 0;
    
    for (const [, session] of activeSessions) {
      const project = session.user;
      projectMap.set(project, (projectMap.get(project) || 0) + 1);
      totalMessages += session.messageCount;
    }
    
    // Show project list with session counts
    projectInfo.push(chalk.green.bold(`${activeCount} active sessions`));
    projectInfo.push(chalk.yellow(`${totalMessages} total messages`));
    projectInfo.push(''); // Empty line
    
    // List projects (max 2 to fit in small box)
    let i = 0;
    for (const [project, count] of projectMap) {
      if (i >= 2) {
        projectInfo.push(chalk.gray(`+${projectMap.size - 2} more`));
        break;
      }
      const shortName = project.split('/').pop() || project;
      projectInfo.push(chalk.cyan(`• ${shortName} (${count})`));
      i++;
    }
  } else {
    projectInfo.push(chalk.gray('No active projects'));
  }
  
  return projectInfo;
}