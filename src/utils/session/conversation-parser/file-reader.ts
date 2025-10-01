/**
 * File reading and message counting utilities
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getSessionDirectory } from '../session-id-helper.js';

export interface LogFileInfo {
  name: string;
  path: string;
  mtime: number;
}

/**
 * Get the latest JSONL log file for a project
 */
export function getLatestLogFile(projectPath: string): string | null {
  const projectLogDir = getSessionDirectory(projectPath);

  if (!fs.existsSync(projectLogDir)) {
    return null;
  }

  // Get latest JSONL file by modification time
  const logFiles = fs.readdirSync(projectLogDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({
      name: f,
      path: path.join(projectLogDir, f),
      mtime: fs.statSync(path.join(projectLogDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (logFiles.length === 0) {
    return null;
  }

  const latestLog = logFiles[0].path;

  // Check if file exists before returning
  if (!fs.existsSync(latestLog)) {
    console.warn(`Session file no longer exists: ${latestLog}`);
    return null;
  }

  return latestLog;
}

/**
 * Count user messages in a log file
 */
export function countUserMessages(logFilePath: string): number {
  try {
    const count = parseInt(execSync(
      `grep '"type":"user"' "${logFilePath}" | grep '"content":' | grep -v '"type":"tool_result"' | wc -l`,
      { maxBuffer: 1024 * 1024 * 10 }
    ).toString().trim()) || 0;

    return count;
  } catch (error) {
    console.warn(`Error counting messages in ${logFilePath}:`, error instanceof Error ? error.message : String(error));
    return 0;
  }
}

/**
 * Get recent entries from a log file (last 100 lines)
 */
export function getRecentEntries(logFilePath: string): string[] {
  try {
    const output = execSync(
      `tail -100 "${logFilePath}" 2>/dev/null`,
      { maxBuffer: 1024 * 1024 * 10 }
    ).toString().trim();

    return output.split('\n');
  } catch (error) {
    console.warn(`Error reading recent entries from ${logFilePath}:`, error instanceof Error ? error.message : String(error));
    return [];
  }
}
