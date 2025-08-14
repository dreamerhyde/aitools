import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { UIHelper } from '../utils/ui.js';

const execAsync = promisify(exec);

interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  insertions: number;
  deletions: number;
  staged: boolean;
}

interface GitStats {
  added: FileChange[];
  modified: FileChange[];
  deleted: FileChange[];
  renamed: FileChange[];
  untracked: string[];
  totalInsertions: number;
  totalDeletions: number;
  lastCommit: {
    hash: string;
    message: string;
    author: string;
    date: string;
  };
}

export class GitStatsCommand {
  async execute(): Promise<void> {
    UIHelper.showHeader();
    console.log(chalk.bold.cyan('Git Change Statistics'));
    console.log(chalk.gray('Analyzing changes since last commit...'));
    console.log('─'.repeat(50));
    console.log();

    try {
      // Check if in a git repository
      await this.checkGitRepo();
      
      const stats = await this.collectStats();
      await this.displayStats(stats);
      
    } catch (error: any) {
      if (error.message.includes('not a git repository')) {
        UIHelper.showError('Not in a git repository');
      } else {
        UIHelper.showError(`Failed to get git stats: ${error.message}`);
      }
      process.exit(1);
    }
  }

  private async checkGitRepo(): Promise<void> {
    await execAsync('git rev-parse --git-dir');
  }

  private async collectStats(): Promise<GitStats> {
    const [staged, unstaged, untracked, lastCommit, totalChanges] = await Promise.all([
      this.getStagedChanges(),
      this.getUnstagedChanges(),
      this.getUntrackedFiles(),
      this.getLastCommit(),
      this.getTotalChangesSinceLastCommit()
    ]);

    // Get line counts for untracked files
    let untrackedLines = 0;
    for (const file of untracked) {
      const lines = await this.getFileLineCount(file);
      untrackedLines += lines;
    }

    // Combine staged and unstaged by file path
    const allChanges = new Map<string, FileChange>();
    
    // Add staged files
    staged.forEach(file => {
      allChanges.set(file.path, file);
    });
    
    // Add or merge unstaged files
    unstaged.forEach(file => {
      const existing = allChanges.get(file.path);
      if (existing) {
        // File has both staged and unstaged changes
        existing.insertions += file.insertions;
        existing.deletions += file.deletions;
      } else {
        allChanges.set(file.path, file);
      }
    });

    // Categorize by status
    const added: FileChange[] = [];
    const modified: FileChange[] = [];
    const deleted: FileChange[] = [];
    const renamed: FileChange[] = [];
    
    allChanges.forEach(file => {
      switch (file.status) {
        case 'added': added.push(file); break;
        case 'modified': modified.push(file); break;
        case 'deleted': deleted.push(file); break;
        case 'renamed': renamed.push(file); break;
      }
    });

    return {
      added,
      modified,
      deleted,
      renamed,
      untracked,
      totalInsertions: totalChanges.totalInsertions + untrackedLines,
      totalDeletions: totalChanges.totalDeletions,
      lastCommit
    };
  }

  private async getStagedChanges(): Promise<FileChange[]> {
    const { stdout: diffStat } = await execAsync('git diff --cached --numstat');
    const { stdout: nameStatus } = await execAsync('git diff --cached --name-status');
    
    return this.parseDiffOutput(diffStat, nameStatus, true);
  }

  private async getUnstagedChanges(): Promise<FileChange[]> {
    const { stdout: diffStat } = await execAsync('git diff --numstat');
    const { stdout: nameStatus } = await execAsync('git diff --name-status');
    
    return this.parseDiffOutput(diffStat, nameStatus, false);
  }

  private async getUntrackedFiles(): Promise<string[]> {
    const { stdout } = await execAsync('git ls-files --others --exclude-standard');
    return stdout.trim().split('\n').filter(f => f);
  }

  private async getFileLineCount(filePath: string): Promise<number> {
    try {
      // Use wc -l to count lines, handling binary files gracefully
      const { stdout } = await execAsync(`wc -l "${filePath}" 2>/dev/null | awk '{print $1}'`);
      return parseInt(stdout.trim()) || 0;
    } catch {
      return 0;
    }
  }

  private async getLastCommit(): Promise<GitStats['lastCommit']> {
    const { stdout } = await execAsync('git log -1 --pretty=format:"%H|%s|%an|%ar"');
    const [hash, message, author, date] = stdout.split('|');
    
    // Handle Chinese and longer commit messages properly
    const maxLength = 60;
    let displayMessage = message;
    if (message.length > maxLength) {
      displayMessage = message.substring(0, maxLength - 3) + '...';
    }
    
    return {
      hash: hash.substring(0, 7),
      message: displayMessage,
      author,
      date
    };
  }

  private async getTotalChangesSinceLastCommit(): Promise<{ totalInsertions: number, totalDeletions: number }> {
    try {
      const { stdout: diffStat } = await execAsync('git diff HEAD --numstat 2>/dev/null || echo ""');
      
      let totalInsertions = 0;
      let totalDeletions = 0;
      
      if (diffStat.trim()) {
        const lines = diffStat.trim().split('\n');
        lines.forEach(line => {
          const [insertions, deletions] = line.split('\t');
          if (insertions !== '-') totalInsertions += parseInt(insertions);
          if (deletions !== '-') totalDeletions += parseInt(deletions);
        });
      }
      
      return { totalInsertions, totalDeletions };
    } catch {
      return { totalInsertions: 0, totalDeletions: 0 };
    }
  }

  private parseDiffOutput(diffStat: string, nameStatus: string, staged: boolean): FileChange[] {
    const files: FileChange[] = [];
    const statLines = diffStat.trim().split('\n').filter(l => l);
    const statusLines = nameStatus.trim().split('\n').filter(l => l);
    
    // Create status map
    const statusMap = new Map<string, string>();
    statusLines.forEach(line => {
      const [status, ...pathParts] = line.split('\t');
      const path = pathParts.join('\t');
      statusMap.set(path, status);
    });
    
    // Parse numstat output
    statLines.forEach(line => {
      const [insertions, deletions, path] = line.split('\t');
      const statusCode = statusMap.get(path) || 'M';
      
      let status: FileChange['status'] = 'modified';
      if (statusCode === 'A') status = 'added';
      else if (statusCode === 'D') status = 'deleted';
      else if (statusCode.startsWith('R')) status = 'renamed';
      
      files.push({
        path,
        status,
        insertions: insertions === '-' ? 0 : parseInt(insertions),
        deletions: deletions === '-' ? 0 : parseInt(deletions),
        staged
      });
    });
    
    return files;
  }

  private async displayStats(stats: GitStats): Promise<void> {
    // Last commit info
    console.log(chalk.bold('Last Commit'));
    console.log('─'.repeat(50));
    console.log(`  ${chalk.gray('Hash:')}    ${chalk.yellow(stats.lastCommit.hash)}`);
    console.log(`  ${chalk.gray('Author:')}  ${stats.lastCommit.author}`);
    console.log(`  ${chalk.gray('Date:')}    ${stats.lastCommit.date}`);
    console.log(`  ${chalk.gray('Message:')} ${stats.lastCommit.message}`);
    console.log();

    // Overview
    console.log(chalk.bold('Changes Since Last Commit'));
    console.log('─'.repeat(50));
    
    const totalFiles = stats.added.length + stats.modified.length + 
                      stats.deleted.length + stats.renamed.length + 
                      stats.untracked.length;
    
    // Show breakdown inline with total
    const parts = [];
    if (stats.modified.length > 0) parts.push(`${stats.modified.length} modified`);
    if (stats.deleted.length > 0) parts.push(`${stats.deleted.length} deleted`);
    if (stats.added.length > 0) parts.push(`${stats.added.length} added`);
    if (stats.untracked.length > 0) parts.push(`${stats.untracked.length} new`);
    if (stats.renamed.length > 0) parts.push(`${stats.renamed.length} renamed`);
    
    if (parts.length > 0) {
      console.log(`  Files changed: ${chalk.bold(totalFiles.toString())} ${chalk.gray(`(${parts.join(', ')})`)}`);
    }
    
    console.log(`  Lines added:   ${chalk.green('+' + stats.totalInsertions)}`);
    console.log(`  Lines deleted: ${chalk.red('-' + stats.totalDeletions)}`);
    
    // Visual bar
    if (stats.totalInsertions > 0 || stats.totalDeletions > 0) {
      const maxBarLength = 30;
      const total = stats.totalInsertions + stats.totalDeletions;
      const insertBar = total > 0 ? Math.round((stats.totalInsertions / total) * maxBarLength) : 0;
      const deleteBar = maxBarLength - insertBar;
      
      const bar = chalk.green('+'.repeat(insertBar)) + chalk.red('-'.repeat(deleteBar));
      console.log(`  ${bar}`);
    }
    console.log();

    // Modified Files
    if (stats.modified.length > 0) {
      // Calculate section totals
      const modifiedInsertions = stats.modified.reduce((sum, f) => sum + f.insertions, 0);
      const modifiedDeletions = stats.modified.reduce((sum, f) => sum + f.deletions, 0);
      
      console.log(chalk.bold.yellow('Modified Files') + chalk.gray(` (${chalk.green('+' + modifiedInsertions)} ${chalk.red('-' + modifiedDeletions)})`));
      console.log('─'.repeat(50));
      
      // Find the longest path for alignment
      const maxPathLength = Math.min(
        Math.max(...stats.modified.map(f => f.path.length)),
        50
      );
      
      stats.modified.forEach(file => {
        const stageIcon = file.staged ? chalk.green('●') : chalk.gray('○');
        const filePath = file.path.padEnd(maxPathLength + 2);
        const insertStr = ('+' + file.insertions).padStart(5);
        const deleteStr = ('-' + file.deletions).padStart(5);
        console.log(`  ${stageIcon} ${filePath} ${chalk.green(insertStr)} ${chalk.red(deleteStr)}`);
      });
      console.log();
    }

    // Deleted Files
    if (stats.deleted.length > 0) {
      // Calculate section totals
      const deletedLines = stats.deleted.reduce((sum, f) => sum + f.deletions, 0);
      
      console.log(chalk.bold.red('Deleted Files') + chalk.gray(` (${chalk.red('-' + deletedLines)})`));
      console.log('─'.repeat(50));
      
      // Find the longest path for alignment
      const maxPathLength = Math.min(
        Math.max(...stats.deleted.map(f => f.path.length)),
        50
      );
      
      stats.deleted.forEach(file => {
        const stageIcon = file.staged ? chalk.green('●') : chalk.gray('○');
        const filePath = file.path.padEnd(maxPathLength + 2);
        const deleteStr = ('-' + file.deletions).padStart(5);
        console.log(`  ${stageIcon} ${filePath} ${chalk.red(deleteStr)}`);
      });
      console.log();
    }

    // New Files (Added + Untracked)
    const allNewFiles = [...stats.added, ...stats.untracked.map(path => ({
      path,
      status: 'untracked' as const,
      insertions: 0,
      deletions: 0,
      staged: false
    }))];
    
    if (allNewFiles.length > 0) {
      // Calculate section totals
      let newFilesLines = stats.added.reduce((sum, f) => sum + f.insertions, 0);
      // Add untracked file lines
      for (const path of stats.untracked) {
        const lines = await this.getFileLineCount(path);
        newFilesLines += lines;
      }
      
      console.log(chalk.bold.green('New Files') + chalk.gray(` (${chalk.green('+' + newFilesLines)})`));
      console.log('─'.repeat(50));
      
      // Find the longest path for alignment
      const maxPathLength = Math.min(
        Math.max(...allNewFiles.map(f => f.path.length)),
        50
      );
      
      // Show all files
      for (const file of allNewFiles) {
        if (typeof file === 'string') {
          console.log(`  ${chalk.gray('○')} ${chalk.green(file)}`);
        } else {
          const stageIcon = file.staged ? chalk.green('●') : chalk.gray('○');
          const filePath = file.path.padEnd(maxPathLength + 2);
          let lineInfo = '';
          if (file.status === 'added' && file.insertions > 0) {
            const insertStr = ('+' + file.insertions).padStart(5);
            lineInfo = chalk.green(insertStr);
          } else if (file.status === 'untracked') {
            // Get line count for untracked files
            const lines = await this.getFileLineCount(file.path);
            if (lines > 0) {
              const insertStr = ('+' + lines).padStart(5);
              lineInfo = chalk.green(insertStr);
            }
          }
          console.log(`  ${stageIcon} ${filePath} ${lineInfo}`);
        }
      }
      console.log();
    }

    // Renamed Files
    if (stats.renamed.length > 0) {
      console.log(chalk.bold.cyan('Renamed Files'));
      console.log('─'.repeat(50));
      stats.renamed.forEach(file => {
        const stageIcon = file.staged ? chalk.green('●') : chalk.gray('○');
        console.log(`  ${stageIcon} ${chalk.cyan(file.path)}`);
      });
      console.log();
    }

    // Summary
    console.log(chalk.bold('Summary'));
    console.log('─'.repeat(50));
    
    // Count staged files
    const stagedCount = [...stats.added, ...stats.modified, ...stats.deleted, ...stats.renamed]
      .filter(f => f.staged).length;
    
    const unstagedCount = totalFiles - stagedCount;
    
    console.log(`  Total files with changes: ${chalk.bold(totalFiles.toString())}`);
    console.log(`  Ready to commit: ${chalk.green(stagedCount.toString())}`);
    console.log(`  Need staging: ${chalk.yellow(unstagedCount.toString())}`);
    
    if (stagedCount > 0) {
      console.log();
      console.log(chalk.green(`  → ${stagedCount} file(s) ready to commit`));
    } else if (unstagedCount > 0) {
      console.log();
      console.log(chalk.yellow(`  → Use 'git add' to stage changes`));
    } else if (totalFiles === 0) {
      console.log();
      console.log(chalk.gray(`  → Working directory clean`));
    }
  }
}