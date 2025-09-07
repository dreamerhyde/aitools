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
    
    // Read .claude.json once at the beginning
    const configPath = path.join(os.homedir(), '.claude.json');
    let configData: any = null;
    if (fs.existsSync(configPath)) {
      try {
        configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (e) {
        console.error('Failed to read .claude.json:', e);
        return { activeProjectPaths: new Set(), activeProjects: [] };
      }
    }
    
    // Extract project paths from log file paths
    const activeProjectPaths = new Set<string>();
    allActiveLogs.forEach((logPath: string) => {
      const match = logPath.match(/\/projects\/(.+?)\//);
      if (match) {
        // Convert from "-Users-albertliu-repos-proj" to "/Users/albertliu/repos/proj"
        const safePath = match[1].startsWith('-') ? match[1].substring(1) : match[1];
        
        // Simple conversion first (all dashes to slashes)
        const simplePath = '/' + safePath.replace(/-/g, '/');
        
        // Check if this path exists
        if (fs.existsSync(simplePath)) {
          activeProjectPaths.add(simplePath);
        } else if (configData && configData.projects) {
          // Try to find the correct path from already loaded config
          // This handles cases where dashes are part of the directory name
          for (const projectPath of Object.keys(configData.projects)) {
            const testSafePath = projectPath.replace(/\//g, '-').substring(1);
            if (testSafePath === safePath) {
              activeProjectPaths.add(projectPath);
              break;
            }
          }
        } else {
          // If no config available, fall back to simple path
          activeProjectPaths.add(simplePath);
        }
      }
    });
    
    // Return early if no config data
    if (!configData || !configData.projects) {
      return { activeProjectPaths, activeProjects: [] };
    }
    
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