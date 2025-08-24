// path: src/utils/time-tracker.ts

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

/**
 * Manages time tracking for tasks with file persistence
 */
export class TimeTracker {
  private startTime: number;
  private timeFile: string;

  constructor(sessionId?: string) {
    this.startTime = Date.now();
    // Use session-specific or project-specific time tracking file
    const fileId = sessionId || this.getProjectHash();
    this.timeFile = path.join(os.tmpdir(), `aitools-task-${fileId}.json`);
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
  async startTracking(project: string, branch: string): Promise<void> {
    this.startTime = Date.now();
    try {
      await fs.writeFile(this.timeFile, JSON.stringify({
        startTime: this.startTime,
        project,
        branch
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
  async loadStartTime(): Promise<number> {
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
  async cleanupTimeFile(): Promise<void> {
    try {
      await fs.unlink(this.timeFile);
    } catch {
      // File might not exist
    }
  }

  /**
   * Format time duration smartly (e.g., "2m 15s", "45s", "1h 23m")
   */
  formatSmartTime(milliseconds: number): string {
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
   * Format current time
   */
  formatFinishedTime(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  /**
   * Get the current start time
   */
  getStartTime(): number {
    return this.startTime;
  }
}