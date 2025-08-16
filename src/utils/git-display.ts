import chalk from 'chalk';
import { GitStats, GitStatsSummary } from './git-types.js';
import { isGeneratedFile, categorizeFileChanges } from './git-file-detector.js';

export class GitDisplayFormatter {
  
  static formatOverview(stats: GitStats): void {
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
    
    // Show code vs generated breakdown
    const codeAdded = chalk.green(`+${stats.codeInsertions}`);
    const generatedAdded = stats.generatedInsertions > 0 ? chalk.gray(` (+${stats.generatedInsertions})`) : '';
    const codeDeleted = chalk.red(`-${stats.codeDeletions}`);
    const generatedDeleted = stats.generatedDeletions > 0 ? chalk.gray(` (-${stats.generatedDeletions})`) : '';
    
    console.log(`  Lines added:   ${codeAdded}${generatedAdded}`);
    console.log(`  Lines deleted: ${codeDeleted}${generatedDeleted}`);
    
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
  }

  static formatModifiedFiles(files: any[]): void {
    if (files.length === 0) return;
    
    const { codeInsertions, generatedInsertions, codeDeletions, generatedDeletions } = 
      categorizeFileChanges(files);
    
    // Display code stats first, then generated stats separately
    const codeStats = codeInsertions > 0 || codeDeletions > 0 
      ? chalk.green(`+${codeInsertions}`) + ' ' + chalk.red(`-${codeDeletions}`)
      : '';
    const generatedStats = (generatedInsertions > 0 || generatedDeletions > 0) 
      ? chalk.gray(` (+${generatedInsertions} -${generatedDeletions})`) 
      : '';
    
    console.log(chalk.bold.yellow('Modified Files') + chalk.gray(` (${codeStats}${generatedStats})`));
    console.log('─'.repeat(50));
    
    this.formatFileList(files);
    console.log();
  }

  static async formatNewFiles(added: any[], untracked: string[], getFileLineCount: (path: string) => Promise<number>): Promise<void> {
    const allNewFiles = [...added, ...untracked.map(path => ({
      path,
      status: 'untracked' as const,
      insertions: 0,
      deletions: 0,
      staged: false
    }))];
    
    if (allNewFiles.length === 0) return;
    
    // Calculate section totals with code/generated breakdown
    let codeLines = 0, generatedLines = 0;
    
    // Process added files
    added.forEach(file => {
      if (isGeneratedFile(file.path)) {
        generatedLines += file.insertions;
      } else {
        codeLines += file.insertions;
      }
    });
    
    // Process untracked files
    for (const path of untracked) {
      const lines = await getFileLineCount(path);
      if (isGeneratedFile(path)) {
        generatedLines += lines;
      } else {
        codeLines += lines;
      }
    }
    
    const codeStats = chalk.green(`+${codeLines}`);
    const generatedStats = generatedLines > 0 ? chalk.gray(` (+${generatedLines})`) : '';
    
    console.log(chalk.bold.green('New Files') + chalk.gray(` (${codeStats}${generatedStats})`));
    console.log('─'.repeat(50));
    
    // Show all files
    const maxPathLength = Math.min(
      Math.max(...allNewFiles.map(f => f.path.length)),
      50
    );
    
    for (const file of allNewFiles) {
      const stageIcon = file.staged ? chalk.green('●') : chalk.gray('○');
      const isGenerated = isGeneratedFile(file.path);
      const filePath = file.path.padEnd(maxPathLength + 2);
      
      let lineInfo = '';
      if (file.status === 'added' && file.insertions > 0) {
        const insertStr = ('+' + file.insertions).padStart(5);
        lineInfo = isGenerated ? chalk.gray(insertStr) : chalk.green(insertStr);
      } else if (file.status === 'untracked') {
        const lines = await getFileLineCount(file.path);
        if (lines > 0) {
          const insertStr = ('+' + lines).padStart(5);
          lineInfo = isGenerated ? chalk.gray(insertStr) : chalk.green(insertStr);
        }
      }
      
      if (isGenerated) {
        console.log(`  ${stageIcon} ${chalk.gray(filePath)} ${lineInfo}`);
      } else {
        console.log(`  ${stageIcon} ${filePath} ${lineInfo}`);
      }
    }
    console.log();
  }

  private static formatFileList(files: any[]): void {
    const maxPathLength = Math.min(
      Math.max(...files.map(f => f.path.length)),
      50
    );
    
    files.forEach(file => {
      const stageIcon = file.staged ? chalk.green('●') : chalk.gray('○');
      const isGenerated = isGeneratedFile(file.path);
      const filePath = file.path.padEnd(maxPathLength + 2);
      const insertStr = ('+' + file.insertions).padStart(5);
      const deleteStr = ('-' + file.deletions).padStart(5);
      
      if (isGenerated) {
        console.log(`  ${stageIcon} ${chalk.gray(filePath)} ${chalk.gray(insertStr)} ${chalk.gray(deleteStr)}`);
      } else {
        console.log(`  ${stageIcon} ${filePath} ${chalk.green(insertStr)} ${chalk.red(deleteStr)}`);
      }
    });
  }

  static formatDeletedFiles(files: any[]): void {
    if (files.length === 0) return;
    
    const deletedLines = files.reduce((sum, f) => sum + f.deletions, 0);
    console.log(chalk.bold.red('Deleted Files') + chalk.gray(` (${chalk.red('-' + deletedLines)})`));
    console.log('─'.repeat(50));
    
    const maxPathLength = Math.min(Math.max(...files.map(f => f.path.length)), 50);
    files.forEach(file => {
      const stageIcon = file.staged ? chalk.green('●') : chalk.gray('○');
      const filePath = file.path.padEnd(maxPathLength + 2);
      const deleteStr = ('-' + file.deletions).padStart(5);
      console.log(`  ${stageIcon} ${filePath} ${chalk.red(deleteStr)}`);
    });
    console.log();
  }

  static formatRenamedFiles(files: any[]): void {
    if (files.length === 0) return;
    
    console.log(chalk.bold.cyan('Renamed Files'));
    console.log('─'.repeat(50));
    files.forEach(file => {
      const stageIcon = file.staged ? chalk.green('●') : chalk.gray('○');
      console.log(`  ${stageIcon} ${chalk.cyan(file.path)}`);
    });
    console.log();
  }

  static formatSummary(stats: GitStats): void {
    console.log(chalk.bold('Summary'));
    console.log('─'.repeat(50));
    
    const totalFiles = stats.added.length + stats.modified.length + 
                      stats.deleted.length + stats.renamed.length + 
                      stats.untracked.length;
    
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