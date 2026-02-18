/**
 * Project-related utilities for session management
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Information about an active session
 */
export interface SessionFileInfo {
  projectPath: string;
  sessionId: string;
  logFilePath: string;
  mtime: number;
}

/**
 * Get the timestamp of the last entry in a JSONL log file
 * Handles special cases like file-history-snapshot entries that don't have timestamps
 */
function getLastEntryTimestamp(logPath: string): number | null {
  try {
    // Get last 5 lines to handle entries without timestamps (like file-history-snapshot)
    const lastLines = execSync(`tail -5 "${logPath}" 2>/dev/null`, {
      maxBuffer: 1024 * 1024
    }).toString().trim().split('\n');

    // Find the most recent entry with a valid timestamp
    for (let i = lastLines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lastLines[i]);
        if (entry.timestamp) {
          return new Date(entry.timestamp).getTime();
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get all active sessions from Claude's project logs
 * Returns individual session files instead of aggregating by project
 * @param maxInactiveMinutes Maximum minutes of inactivity to consider session active (default: 5)
 * @returns Object containing active session files
 */
export async function getActiveSessions(maxInactiveMinutes: number = 5): Promise<{
  activeSessions: SessionFileInfo[];
}> {
  try {
    // Get projects with recent activity (within 30 minutes for initial filtering)
    const recentLogs = execSync(
      'find ~/.claude/projects -name "*.jsonl" -mmin -30 2>/dev/null'
    ).toString().trim().split('\n').filter(Boolean);

    // Read .claude.json once at the beginning
    const configPath = path.join(os.homedir(), '.claude.json');
    let configData: any = null;
    if (fs.existsSync(configPath)) {
      try {
        configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (e) {
        console.error('Failed to read .claude.json:', e);
        return { activeSessions: [] };
      }
    }

    // Build session info for each log file
    const activeSessions: SessionFileInfo[] = [];
    const now = Date.now();
    const maxInactiveMs = maxInactiveMinutes * 60 * 1000;

    for (const logPath of recentLogs) {
      // Extract project directory and session ID from path
      // Format: ~/.claude/projects/-Users-albertliu-repos-proj/session-id.jsonl
      const match = logPath.match(/\/projects\/(.+?)\/([a-f0-9-]+)\.jsonl$/);
      if (!match) continue;

      const [, safePath, sessionId] = match;

      // Convert from "-Users-albertliu-repos-proj" to "/Users/albertliu/repos/proj"
      const cleanSafePath = safePath.startsWith('-') ? safePath.substring(1) : safePath;

      // Simple conversion first (all dashes to slashes)
      let projectPath = '/' + cleanSafePath.replace(/-/g, '/');

      // Verify path exists
      if (!fs.existsSync(projectPath)) {
        // Try to find correct path from config
        if (configData && configData.projects) {
          let found = false;
          for (const configPath of Object.keys(configData.projects)) {
            const testSafePath = configPath.replace(/\//g, '-').substring(1);
            if (testSafePath === cleanSafePath) {
              projectPath = configPath;
              found = true;
              break;
            }
          }
          if (!found) continue; // Skip if path not found
        } else {
          continue; // Skip if path doesn't exist and no config
        }
      }

      // Check last entry timestamp to determine if session is truly active
      const lastEntryTime = getLastEntryTimestamp(logPath);
      if (!lastEntryTime || (now - lastEntryTime) > maxInactiveMs) {
        continue; // Skip sessions with no recent activity
      }

      // Get file modification time
      const stats = fs.statSync(logPath);

      activeSessions.push({
        projectPath,
        sessionId,
        logFilePath: logPath,
        mtime: stats.mtime.getTime()
      });
    }

    // Sort by modification time (newest first)
    activeSessions.sort((a, b) => b.mtime - a.mtime);

    return { activeSessions };
  } catch (error) {
    console.error(`Failed to get active sessions: ${error}`);
    return { activeSessions: [] };
  }
}

/**
 * Get active project paths from Claude's project logs (legacy compatibility)
 * @returns Object containing active project paths and the projects that should be displayed
 * @deprecated Use getActiveSessions() instead for multi-session support
 */
export async function getActiveProjects(): Promise<{
  activeProjectPaths: Set<string>;
  activeProjects: Array<[string, any]>;
}> {
  const { activeSessions } = await getActiveSessions();

  // Extract unique project paths
  const activeProjectPaths = new Set<string>();
  activeSessions.forEach(session => {
    activeProjectPaths.add(session.projectPath);
  });

  // Read config for project metadata
  const configPath = path.join(os.homedir(), '.claude.json');
  let configData: any = null;
  if (fs.existsSync(configPath)) {
    try {
      configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      return { activeProjectPaths, activeProjects: [] };
    }
  }

  // Filter projects that have active sessions
  const activeProjects = configData && configData.projects
    ? Object.entries(configData.projects).filter(
        ([projectPath]: [string, any]) => activeProjectPaths.has(projectPath)
      )
    : [];

  return { activeProjectPaths, activeProjects };
}