// path: src/commands/lint-command-impl.ts
import chalk from 'chalk';
import Table from 'cli-table3';
import { TypeScriptRunner, ESLintRunner, BuildRunner, type CheckResult, type FileIssue } from '../utils/check-runners.js';
import { SuggestionFormatter } from '../utils/suggestion-formatter.js';
import { TABLE_CHARS, DEFAULT_TABLE_STYLE } from '../utils/table-config.js';
import type { TableCellConfig, TableHeaderConfig, TableConstructor } from '../types/cli-table.js';

export class CheckCommand {
  private results: CheckResult[] = [];
  private tsRunner = new TypeScriptRunner();
  private eslintRunner = new ESLintRunner();
  private buildRunner = new BuildRunner();
  private TableClass = Table as unknown as TableConstructor;
  
  async executeWithResults(): Promise<{
    errors: number;
    warnings: number;
    details: Array<{
      file: string;
      message: string;
      severity: string;
    }>;
  }> {
    const results = {
      errors: 0,
      warnings: 0,
      details: [] as Array<{
        file: string;
        message: string;
        severity: string;
      }>
    };
    
    try {
      // Run TypeScript check
      const tsResult = await this.tsRunner.run(undefined, false);
      results.errors += tsResult.errors;
      results.warnings += tsResult.warnings;
      
      if (tsResult.files) {
        tsResult.files.forEach((file) => {
          results.details.push({
            file: file.file,
            message: file.message || 'Type error',
            severity: file.severity
          });
        });
      }
      
      // Run ESLint check
      const eslintResult = await this.eslintRunner.run(false, undefined, false);
      results.errors += eslintResult.errors;
      results.warnings += eslintResult.warnings;
      
      if (eslintResult.files) {
        eslintResult.files.forEach((file) => {
          results.details.push({
            file: file.file,
            message: file.message || 'Lint error',
            severity: file.severity
          });
        });
      }
    } catch (error) {
      // Return partial results even on error
    }
    
    return results;
  }
  
  async execute(options: { 
    typescript?: boolean; 
    eslint?: boolean; 
    all?: boolean;
    fix?: boolean;
    showWarnings?: boolean;
  }): Promise<void> {
    console.log(chalk.bold('\nCode Quality Check'));
    console.log(chalk.hex('#303030')('─'.repeat(30)));
    
    const checks: Array<() => Promise<CheckResult>> = [];
    
    // Determine which checks to run
    if (options.all || (!options.typescript && !options.eslint)) {
      checks.push(() => this.tsRunner.run(undefined, false));
      checks.push(() => this.eslintRunner.run(options.fix, undefined, false));
      checks.push(() => this.buildRunner.run());
    } else {
      if (options.typescript) checks.push(() => this.tsRunner.run(undefined, false));
      if (options.eslint) checks.push(() => this.eslintRunner.run(options.fix, undefined, false));
    }
    
    // Run all checks
    for (const check of checks) {
      const result = await check();
      this.results.push(result);
    }
    
    // Display results
    this.displaySummary(options.showWarnings);
    this.displayDetailedResults(options.showWarnings);
    // Suggestion is shown in displayDetailedResults() if there are issues
  }
  
  async executeForAI(options: { targetFile?: string; showWarnings?: boolean } = {}): Promise<void> {
    console.log('Code Quality Issues:\n');
    
    const tsResult = await this.tsRunner.run(options.targetFile, true); // Pass silent=true for AI mode
    const eslintResult = await this.eslintRunner.run(false, options.targetFile, true); // Pass silent=true for AI mode
    
    // Filter issues based on showWarnings setting
    const filterIssues = (files: FileIssue[]) => {
      if (options.showWarnings) {
        return files;
      }
      return files.filter(issue => issue.severity === 'error');
    };

    const filteredTsIssues = filterIssues(tsResult.files);
    const filteredEslintIssues = filterIssues(eslintResult.files);
    
    // TypeScript Errors
    if (filteredTsIssues.length > 0) {
      const errorCount = filteredTsIssues.filter(i => i.severity === 'error').length;
      const warningCount = filteredTsIssues.filter(i => i.severity === 'warning').length;
      
      let title = 'TypeScript';
      if (options.showWarnings && warningCount > 0) {
        title += ` (${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''})`;
      } else {
        title += ` (${errorCount} error${errorCount !== 1 ? 's' : ''})`;
      }
      console.log(`${title}:`);
      
      filteredTsIssues.forEach(issue => {
        console.log(`- ${issue.file}${issue.line ? ':' + issue.line : ''}: ${issue.message}`);
      });
      console.log();
    }
    
    // ESLint Issues
    if (filteredEslintIssues.length > 0) {
      const errorCount = filteredEslintIssues.filter(i => i.severity === 'error').length;
      const warningCount = filteredEslintIssues.filter(i => i.severity === 'warning').length;
      
      let title = 'ESLint';
      if (options.showWarnings && warningCount > 0) {
        title += ` (${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''})`;
      } else {
        title += ` (${errorCount} error${errorCount !== 1 ? 's' : ''})`;
      }
      console.log(`${title}:`);
      
      filteredEslintIssues.forEach(issue => {
        console.log(`- ${issue.file}${issue.line ? ':' + issue.line : ''}: ${issue.message}`);
      });
      console.log();
    }
    
    const hasErrors = filteredTsIssues.some(i => i.severity === 'error') || 
                     filteredEslintIssues.some(i => i.severity === 'error');
    const hasWarnings = options.showWarnings && 
                       (filteredTsIssues.some(i => i.severity === 'warning') || 
                        filteredEslintIssues.some(i => i.severity === 'warning'));
    
    if (!hasErrors && !hasWarnings) {
      console.log('No issues found - code quality is good.');
    } else {
      // For AI: plain text without formatting
      SuggestionFormatter.show(SuggestionFormatter.LINT_FIX, false);
      
      // Also output summary to stderr for user to see in Claude Code terminal
      console.error(chalk.yellow('\n⚠ Code Quality Issues'));
      
      const tsErrors = filteredTsIssues.filter(i => i.severity === 'error').length;
      if (tsErrors > 0) {
        console.error(chalk.red(`  TypeScript: ${tsErrors} error${tsErrors !== 1 ? 's' : ''}`));
      }
      
      const eslintErrors = filteredEslintIssues.filter(i => i.severity === 'error').length;
      const eslintWarnings = filteredEslintIssues.filter(i => i.severity === 'warning').length;
      
      if (eslintErrors > 0 || (options.showWarnings && eslintWarnings > 0)) {
        const parts = [];
        if (eslintErrors > 0) parts.push(`${eslintErrors} error${eslintErrors !== 1 ? 's' : ''}`);
        if (options.showWarnings && eslintWarnings > 0) parts.push(`${eslintWarnings} warning${eslintWarnings !== 1 ? 's' : ''}`);
        console.error(chalk.gray(`  ESLint: ${parts.join(', ')}`));
      }
    }
  }
  
  private displaySummary(showWarnings = false): void {
    console.log('\n' + chalk.bold('Check Summary'));
    console.log(chalk.hex('#303030')('─'.repeat(30)));
    
    const table = new this.TableClass({
      head: [
        { content: 'Tool', hAlign: 'right' } as TableHeaderConfig,
        { content: 'Status', hAlign: 'center' } as TableHeaderConfig, 
        { content: 'Errors', hAlign: 'center' } as TableHeaderConfig,
        ...(showWarnings ? [{ content: 'Warnings', hAlign: 'center' } as TableHeaderConfig] : []),
        { content: 'Duration', hAlign: 'center' } as TableHeaderConfig
      ],
      colWidths: showWarnings ? [15, 12, 10, 10, 12] : [15, 12, 10, 12],
      style: DEFAULT_TABLE_STYLE,
      chars: TABLE_CHARS
    });
    
    let totalErrors = 0;
    let totalWarnings = 0;
    
    for (const result of this.results) {
      totalErrors += result.errors;
      totalWarnings += result.warnings;
      
      const statusIcon = 
        result.status === 'success' ? chalk.green('✓') :
        result.status === 'warning' ? chalk.yellow('▪') :
        result.status === 'error' ? chalk.red('✗') :
        chalk.gray('○');
      
      const status = 
        result.status === 'success' ? chalk.green('Passed') :
        result.status === 'warning' ? chalk.yellow('Warning') :
        result.status === 'error' ? chalk.red('Failed') :
        chalk.gray('Skipped');
      
      const row = [
        { content: result.tool, hAlign: 'right' } as TableCellConfig,
        { content: `${statusIcon} ${status}`, hAlign: 'center' } as TableCellConfig,
        { content: result.errors > 0 ? chalk.red(result.errors.toString()) : chalk.green('0'), hAlign: 'right' } as TableCellConfig,
      ];
      
      if (showWarnings) {
        row.push({ content: result.warnings > 0 ? chalk.yellow(result.warnings.toString()) : chalk.green('0'), hAlign: 'right' } as TableCellConfig);
      }
      
      row.push({ content: result.duration ? `${(result.duration / 1000).toFixed(2)}s` : '-', hAlign: 'right' } as TableCellConfig);
      
      table.push(row);
    }
    
    // Add totals row
    const totalRow = [
      { content: chalk.bold('Total'), hAlign: 'right' } as TableCellConfig,
      { content: '', hAlign: 'center' } as TableCellConfig,
      { content: totalErrors > 0 ? chalk.red.bold(totalErrors.toString()) : chalk.green.bold('0'), hAlign: 'right' } as TableCellConfig,
    ];
    
    if (showWarnings) {
      totalRow.push({ content: totalWarnings > 0 ? chalk.yellow.bold(totalWarnings.toString()) : chalk.green.bold('0'), hAlign: 'right' } as TableCellConfig);
    }
    
    totalRow.push({ content: '', hAlign: 'right' } as TableCellConfig);
    
    table.push(totalRow);
    
    console.log(table.toString());
    
    // Overall status
    console.log();
    if (totalErrors === 0 && (showWarnings ? totalWarnings === 0 : true)) {
      console.log(chalk.green.bold('✓ All checks passed successfully!'));
    } else if (totalErrors > 0) {
      if (showWarnings && totalWarnings > 0) {
        console.log(chalk.red.bold(`✗ Found ${totalErrors} errors and ${totalWarnings} warnings`));
      } else {
        console.log(chalk.red.bold(`✗ Found ${totalErrors} errors`));
      }
    } else if (showWarnings && totalWarnings > 0) {
      console.log(chalk.yellow.bold(`▪ Found ${totalWarnings} warnings`));
    }
  }
  
  private displayDetailedResults(showWarnings = false): void {
    const hasDetailedIssues = this.results.some(r => r.files.length > 0);
    
    if (hasDetailedIssues) {
      console.log('\n' + chalk.bold('Detailed Issues'));
      console.log(chalk.hex('#303030')('─'.repeat(30)));
    
      // Group issues by file
      const fileGroups = new Map<string, FileIssue[]>();
      
      for (const result of this.results) {
        for (const issue of result.files) {
          // Filter out warnings if not requested
          if (!showWarnings && issue.severity === 'warning') {
            continue;
          }
          
          if (!fileGroups.has(issue.file)) {
            fileGroups.set(issue.file, []);
          }
          fileGroups.get(issue.file)!.push(issue);
        }
      }
      
      // Sort files by number of issues (most issues first)
      const sortedFiles = Array.from(fileGroups.entries())
        .sort((a, b) => b[1].length - a[1].length);
      
      for (const [file, issues] of sortedFiles) {
        const errorCount = issues.filter(i => i.severity === 'error').length;
        const warningCount = issues.filter(i => i.severity === 'warning').length;
        
        // File header
        const fileLabel = chalk.cyan(file);
        const counts = [];
        if (errorCount > 0) counts.push(chalk.red(`${errorCount} error${errorCount > 1 ? 's' : ''}`));
        if (showWarnings && warningCount > 0) counts.push(chalk.yellow(`${warningCount} warning${warningCount > 1 ? 's' : ''}`));
        
        if (counts.length > 0) {
          console.log(`\n${fileLabel} ${chalk.dim(`(${counts.join(', ')})`)}`);
        }
        
        // Sort issues by line number
        const sortedIssues = issues.sort((a, b) => (a.line || 0) - (b.line || 0));
        
        for (const issue of sortedIssues) {
          const icon = 
            issue.severity === 'error' ? chalk.red('✗') :
            issue.severity === 'warning' ? chalk.yellow('▪') :
            chalk.blue('○');
          
          const location = issue.line ? 
            chalk.gray(`  ${issue.line}:${issue.column || 0}`) : '';
          
          const rule = issue.rule ? 
            chalk.dim(` [${issue.rule}]`) : '';
          
          console.log(`  ${icon}${location}  ${issue.message}${rule}`);
        }
      }
    }
    
    // Add consistent suggestion for fixing issues
    const hasErrors = this.results.some(r => r.errors > 0);
    const hasWarnings = this.results.some(r => r.warnings > 0);
    
    if (hasErrors || hasWarnings) {
      SuggestionFormatter.show(
        SuggestionFormatter.format(SuggestionFormatter.LINT_FIX, 'aitools lint --fix'),
        true
      );
    }
  }
}