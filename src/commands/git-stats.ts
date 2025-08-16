import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { UIHelper } from '../utils/ui.js';
import { GitStats, FileChange } from '../utils/git-types.js';
import { isGeneratedFile } from '../utils/git-file-detector.js';
import { GitDisplayFormatter } from '../utils/git-display.js';

const execAsync = promisify(exec);

export class GitStatsCommand {
  async execute(): Promise<void> {
    UIHelper.showHeader();
    console.log(chalk.bold.cyan('Git Change Statistics'));
    
    try {
      await this.checkGitRepo();
      
      const { stdout: branch } = await execAsync('git branch --show-current');
      const currentBranch = branch.trim();
      const branchColor = currentBranch === 'main' || currentBranch === 'master' 
        ? chalk.green 
        : chalk.yellow;
      
      console.log(chalk.gray('Branch: ') + branchColor.bold(currentBranch));
      console.log(chalk.gray('Analyzing changes since last commit...'));
      console.log('─'.repeat(50));
      console.log();
      
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

    let untrackedLines = 0;
    for (const file of untracked) {
      const lines = await this.getFileLineCount(file);
      untrackedLines += lines;
    }

    const allChanges = new Map<string, FileChange>();
    
    staged.forEach(file => {
      allChanges.set(file.path, file);
    });
    
    unstaged.forEach(file => {
      const existing = allChanges.get(file.path);
      if (existing) {
        existing.insertions += file.insertions;
        existing.deletions += file.deletions;
      } else {
        allChanges.set(file.path, file);
      }
    });

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

    let codeInsertions = 0, generatedInsertions = 0;
    let codeDeletions = 0, generatedDeletions = 0;
    
    allChanges.forEach(file => {
      if (isGeneratedFile(file.path)) {
        generatedInsertions += file.insertions;
        generatedDeletions += file.deletions;
      } else {
        codeInsertions += file.insertions;
        codeDeletions += file.deletions;
      }
    });
    
    for (const file of untracked) {
      const lines = await this.getFileLineCount(file);
      if (isGeneratedFile(file)) {
        generatedInsertions += lines;
      } else {
        codeInsertions += lines;
      }
    }

    return {
      added,
      modified,
      deleted,
      renamed,
      untracked,
      totalInsertions: totalChanges.totalInsertions + untrackedLines,
      totalDeletions: totalChanges.totalDeletions,
      codeInsertions,
      generatedInsertions,
      codeDeletions,
      generatedDeletions,
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
      const { stdout } = await execAsync(`wc -l "${filePath}" 2>/dev/null | awk '{print $1}'`);
      return parseInt(stdout.trim()) || 0;
    } catch {
      return 0;
    }
  }

  private async getLastCommit(): Promise<GitStats['lastCommit']> {
    const { stdout } = await execAsync('git log -1 --pretty=format:"%H|%s|%an|%ar"');
    const [hash, message, author, date] = stdout.split('|');
    
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
    
    const statusMap = new Map<string, string>();
    statusLines.forEach(line => {
      const [status, ...pathParts] = line.split('\t');
      const path = pathParts.join('\t');
      statusMap.set(path, status);
    });
    
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

    // Use GitDisplayFormatter for all display
    GitDisplayFormatter.formatOverview(stats);
    GitDisplayFormatter.formatModifiedFiles(stats.modified);
    GitDisplayFormatter.formatDeletedFiles(stats.deleted);
    await GitDisplayFormatter.formatNewFiles(stats.added, stats.untracked, this.getFileLineCount.bind(this));
    GitDisplayFormatter.formatRenamedFiles(stats.renamed);
    GitDisplayFormatter.formatSummary(stats);
  }
}