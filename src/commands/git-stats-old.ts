import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { UIHelper } from '../utils/ui.js';

const execAsync = promisify(exec);

interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  insertions: number;
  deletions: number;
  staged: boolean;
}

interface GitStats {
  staged: {
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
    files: FileChange[];
  };
  unstaged: {
    added: number;
    modified: number;
    deleted: number;
    files: FileChange[];
  };
  untracked: {
    count: number;
    files: string[];
  };
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
      this.displayStats(stats);
      
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

    // Use the total changes from last commit (includes both staged and unstaged)
    const { totalInsertions, totalDeletions } = totalChanges;

    return {
      staged,
      unstaged,
      untracked,
      totalInsertions,
      totalDeletions,
      lastCommit
    };
  }

  private async getStagedChanges(): Promise<GitStats['staged']> {
    const { stdout: diffStat } = await execAsync('git diff --cached --numstat');
    const { stdout: nameStatus } = await execAsync('git diff --cached --name-status');
    
    const files = this.parseDiffOutput(diffStat, nameStatus, true);
    
    return {
      added: files.filter(f => f.status === 'added').length,
      modified: files.filter(f => f.status === 'modified').length,
      deleted: files.filter(f => f.status === 'deleted').length,
      renamed: files.filter(f => f.status === 'renamed').length,
      files
    };
  }

  private async getUnstagedChanges(): Promise<GitStats['unstaged']> {
    const { stdout: diffStat } = await execAsync('git diff --numstat');
    const { stdout: nameStatus } = await execAsync('git diff --name-status');
    
    const files = this.parseDiffOutput(diffStat, nameStatus, false);
    
    return {
      added: files.filter(f => f.status === 'added').length,
      modified: files.filter(f => f.status === 'modified').length,
      deleted: files.filter(f => f.status === 'deleted').length,
      files
    };
  }

  private async getUntrackedFiles(): Promise<GitStats['untracked']> {
    const { stdout } = await execAsync('git ls-files --others --exclude-standard');
    const files = stdout.trim().split('\n').filter(f => f);
    
    return {
      count: files.length,
      files
    };
  }

  private async getLastCommit(): Promise<GitStats['lastCommit']> {
    const { stdout } = await execAsync('git log -1 --pretty=format:"%H|%s|%an|%ar"');
    const [hash, message, author, date] = stdout.split('|');
    
    // Handle Chinese and longer commit messages properly
    const maxLength = 60;
    let displayMessage = message;
    if (message.length > maxLength) {
      // Count actual display width (Chinese chars = 2, ASCII = 1)
      let width = 0;
      let cutIndex = 0;
      for (let i = 0; i < message.length; i++) {
        const charCode = message.charCodeAt(i);
        width += charCode > 127 ? 2 : 1;
        if (width <= maxLength) {
          cutIndex = i + 1;
        } else {
          break;
        }
      }
      displayMessage = message.substring(0, cutIndex) + '...';
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
      // Get all changes from HEAD to working directory (includes staged and unstaged)
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

  private displayStats(stats: GitStats): void {
    // Last commit info
    console.log(chalk.bold('Last Commit'));
    console.log('─'.repeat(50));
    console.log(`  ${chalk.gray('Hash:')}    ${chalk.yellow(stats.lastCommit.hash)}`);
    console.log(`  ${chalk.gray('Author:')}  ${stats.lastCommit.author}`);
    console.log(`  ${chalk.gray('Date:')}    ${stats.lastCommit.date}`);
    console.log(`  ${chalk.gray('Message:')} ${stats.lastCommit.message}`);
    console.log();

    // Overview - Changes since last commit
    console.log(chalk.bold('Changes Since Last Commit'));
    console.log('─'.repeat(50));
    
    // Calculate total changed files (including untracked)
    const modifiedFiles = new Set([
      ...stats.staged.files.map(f => f.path),
      ...stats.unstaged.files.map(f => f.path)
    ]).size;
    
    const totalChangedFiles = modifiedFiles + stats.untracked.count;
    
    // Show file count breakdown
    console.log(`  Files changed: ${chalk.bold(totalChangedFiles.toString())}`);
    if (stats.untracked.count > 0) {
      console.log(`    ${chalk.gray(`(${modifiedFiles} modified, ${stats.untracked.count} new)`)}`);
    }
    console.log(`  Lines added:   ${chalk.green('+' + stats.totalInsertions)}`);
    console.log(`  Lines deleted: ${chalk.red('-' + stats.totalDeletions)}`);
    
    // Create visual bar for insertions/deletions
    if (stats.totalInsertions > 0 || stats.totalDeletions > 0) {
      const maxBarLength = 30;
      const total = stats.totalInsertions + stats.totalDeletions;
      const insertBar = total > 0 ? Math.round((stats.totalInsertions / total) * maxBarLength) : 0;
      const deleteBar = maxBarLength - insertBar;
      
      const bar = chalk.green('+'.repeat(insertBar)) + chalk.red('-'.repeat(deleteBar));
      console.log(`  ${bar}`);
    }
    console.log();

    // Staged changes
    if (stats.staged.files.length > 0) {
      console.log(chalk.bold.green('● Staged Changes'));
      console.log('─'.repeat(50));
      console.log(`  ${chalk.green(`${stats.staged.added} added`)}  ${chalk.yellow(`${stats.staged.modified} modified`)}  ${chalk.red(`${stats.staged.deleted} deleted`)}  ${chalk.cyan(`${stats.staged.renamed} renamed`)}`);
      console.log();
      
      // Show top 5 files with most changes
      const topStaged = stats.staged.files
        .sort((a, b) => (b.insertions + b.deletions) - (a.insertions + a.deletions))
        .slice(0, 5);
      
      topStaged.forEach(file => {
        const statusIcon = this.getStatusIcon(file.status);
        const changes = `+${file.insertions} -${file.deletions}`;
        console.log(`  ${statusIcon} ${file.path.padEnd(40)} ${chalk.gray(changes)}`);
      });
      
      if (stats.staged.files.length > 5) {
        console.log(chalk.gray(`  ... and ${stats.staged.files.length - 5} more files`));
      }
      console.log();
    }

    // Unstaged changes
    if (stats.unstaged.files.length > 0) {
      console.log(chalk.bold.yellow('○ Unstaged Changes'));
      console.log('─'.repeat(50));
      console.log(`  ${chalk.green(`${stats.unstaged.added} added`)}  ${chalk.yellow(`${stats.unstaged.modified} modified`)}  ${chalk.red(`${stats.unstaged.deleted} deleted`)}`);
      console.log();
      
      const topUnstaged = stats.unstaged.files
        .sort((a, b) => (b.insertions + b.deletions) - (a.insertions + a.deletions))
        .slice(0, 5);
      
      topUnstaged.forEach(file => {
        const statusIcon = this.getStatusIcon(file.status);
        const changes = `+${file.insertions} -${file.deletions}`;
        console.log(`  ${statusIcon} ${file.path.padEnd(40)} ${chalk.gray(changes)}`);
      });
      
      if (stats.unstaged.files.length > 5) {
        console.log(chalk.gray(`  ... and ${stats.unstaged.files.length - 5} more files`));
      }
      console.log();
    }

    // Untracked files
    if (stats.untracked.count > 0) {
      console.log(chalk.bold.gray('○ Untracked Files'));
      console.log('─'.repeat(50));
      console.log(`  ${stats.untracked.count} untracked file(s)`);
      
      const maxDisplay = 5;
      const topUntracked = stats.untracked.files.slice(0, maxDisplay);
      topUntracked.forEach(file => {
        // Shorten long paths to just filename for readability
        const displayName = file.includes('/') ? file.split('/').pop() || file : file;
        console.log(`  ${chalk.gray('?')} ${chalk.gray(file)}`);
      });
      
      const remaining = stats.untracked.count - maxDisplay;
      if (remaining > 0) {
        console.log(chalk.gray(`  ... and ${remaining} more files`));
      }
      console.log();
    }

    // Summary
    console.log(chalk.bold('Summary'));
    console.log('─'.repeat(50));
    const totalFiles = stats.staged.files.length + stats.unstaged.files.length + stats.untracked.count;
    const readyToCommit = stats.staged.files.length;
    
    console.log(`  Total files with changes: ${chalk.bold(totalFiles.toString())}`);
    console.log(`  Ready to commit: ${chalk.green(readyToCommit.toString())}`);
    console.log(`  Need staging: ${chalk.yellow((stats.unstaged.files.length + stats.untracked.count).toString())}`);
    
    if (readyToCommit > 0) {
      console.log();
      console.log(chalk.green(`  → ${readyToCommit} file(s) ready to commit`));
    } else if (stats.unstaged.files.length > 0) {
      console.log();
      console.log(chalk.yellow(`  → Use 'git add' to stage changes`));
    } else if (totalFiles === 0) {
      console.log();
      console.log(chalk.gray(`  → Working directory clean`));
    }
  }

  private getStatusIcon(status: FileChange['status']): string {
    switch (status) {
      case 'added': return chalk.green('+');
      case 'modified': return chalk.yellow('M');
      case 'deleted': return chalk.red('D');
      case 'renamed': return chalk.cyan('R');
      default: return chalk.gray('?');
    }
  }
}