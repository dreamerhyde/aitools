// path: src/utils/git-analyzer.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { GitChanges } from '../types/notification.js';

const execAsync = promisify(exec);

/**
 * Analyzes Git repository state and changes
 */
export class GitAnalyzer {
  /**
   * Get current Git branch name
   */
  async getGitBranch(): Promise<string> {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD');
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get project name from current directory
   */
  getProjectName(): string {
    return path.basename(process.cwd());
  }

  /**
   * Extract task summary from recent Git activity or provide intelligent summary
   */
  async extractTaskSummary(): Promise<string> {
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
}