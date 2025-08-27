/**
 * Project-related utilities for session management
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Get active project paths from Claude's project logs
 * @returns Object containing active project paths and the projects that should be displayed
 */
export async function getActiveProjects(): Promise<{
  activeProjectPaths: Set<string>;
  activeProjects: Array<[string, any]>;
}> {
  try {
    // Get projects with both today's activity and recent activity (10 min)
    const todayLogs = execSync(
      'find ~/.claude/projects -name "*.jsonl" -mmin -1440 2>/dev/null'
    ).toString().trim().split('\n').filter(Boolean);
    
    const recentLogs = execSync(
      'find ~/.claude/projects -name "*.jsonl" -mmin -10 2>/dev/null'
    ).toString().trim().split('\n').filter(Boolean);
    
    const allActiveLogs = [...new Set([...todayLogs, ...recentLogs])];
    
    // Extract project paths from log file paths
    const activeProjectPaths = new Set<string>();
    allActiveLogs.forEach((logPath: string) => {
      const match = logPath.match(/\/projects\/(.+?)\//);
      if (match) {
        const projectPath = '/' + match[1].replace(/-/g, '/').substring(1);
        activeProjectPaths.add(projectPath);
      }
    });
    
    // Read from .claude.json
    const configPath = path.join(os.homedir(), '.claude.json');
    if (!fs.existsSync(configPath)) {
      return { activeProjectPaths, activeProjects: [] };
    }
    
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Only show projects that have recent log activity
    const activeProjects = configData.projects 
      ? Object.entries(configData.projects).filter(
          ([projectPath]: [string, any]) => {
            return activeProjectPaths.has(projectPath);
          }
        )
      : [];
    
    return { activeProjectPaths, activeProjects };
  } catch (error) {
    console.error(`Failed to get active projects: ${error}`);
    return { activeProjectPaths: new Set(), activeProjects: [] };
  }
}