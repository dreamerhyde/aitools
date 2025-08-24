// path: src/commands/lint-command-impl.ts
import chalk from 'chalk';
import Table from 'cli-table3';
import { TypeScriptRunner, ESLintRunner, BuildRunner, type CheckResult, type FileIssue } from '../utils/check-runners.js';
import { SuggestionFormatter } from '../utils/suggestion-formatter.js';
import { TABLE_CHARS, DEFAULT_TABLE_STYLE } from '../utils/table-config.js';

export class CheckCommand {
  private results: CheckResult[] = [];
  private tsRunner = new TypeScriptRunner();
  private eslintRunner = new ESLintRunner();
  private buildRunner = new BuildRunner();
  
  async executeWithResults(): Promise<any> {
    const results = {
      errors: 0,
      warnings: 0,
      details: [] as any[]
    };
    
    try {
      // Run TypeScript check
      const tsResult = await this.tsRunner.run();
      results.errors += tsResult.errors;
      results.warnings += tsResult.warnings;
      
      if (tsResult.files) {
        tsResult.files.forEach((file: any) => {
          results.details.push({
            file: file.file,
            message: file.message || 'Type error',
            severity: file.severity
          });
        });
      }
      
      // Run ESLint check
      const eslintResult = await this.eslintRunner.run();
      results.errors += eslintResult.errors;
      results.warnings += eslintResult.warnings;
      
      if (eslintResult.files) {
        eslintResult.files.forEach((file: any) => {
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
  }): Promise<void> {
    console.log(chalk.bold('\nCode Quality Check'));
    console.log(chalk.hex('#303030')('─'.repeat(30)));
    
    const checks: Array<() => Promise<CheckResult>> = [];
    
    // Determine which checks to run
    if (options.all || (!options.typescript && !options.eslint)) {
      checks.push(() => this.tsRunner.run());
      checks.push(() => this.eslintRunner.run(options.fix));
      checks.push(() => this.buildRunner.run());
    } else {
      if (options.typescript) checks.push(() => this.tsRunner.run());
      if (options.eslint) checks.push(() => this.eslintRunner.run(options.fix));
    }
    
    // Run all checks
    for (const check of checks) {
      const result = await check();
      this.results.push(result);
    }
    
    // Display results
    this.displaySummary();
    this.displayDetailedResults();
    // Suggestion is shown in displayDetailedResults() if there are issues
  }
  
  async executeForAI(options: { targetFile?: string } = {}): Promise<void> {
    console.log('Code Quality Issues:\n');
    
    const tsResult = await this.tsRunner.run(options.targetFile);
    const eslintResult = await this.eslintRunner.run(false, options.targetFile);
    
    // TypeScript Errors
    if (tsResult.errors > 0 || tsResult.warnings > 0) {
      console.log(`TypeScript Errors (${tsResult.errors + tsResult.warnings}):`);
      tsResult.files.forEach(issue => {
        console.log(`- ${issue.file}${issue.line ? ':' + issue.line : ''}: ${issue.message}`);
      });
      console.log();
    }
    
    // ESLint Issues
    if (eslintResult.errors > 0 || eslintResult.warnings > 0) {
      console.log(`ESLint Issues (${eslintResult.errors + eslintResult.warnings}):`);
      eslintResult.files.forEach(issue => {
        console.log(`- ${issue.file}${issue.line ? ':' + issue.line : ''}: ${issue.message}`);
      });
      console.log();
    }
    
    if (tsResult.errors === 0 && eslintResult.errors === 0 && 
        tsResult.warnings === 0 && eslintResult.warnings === 0) {
      console.log('No issues found - code quality is good.');
    } else {
      // For AI: plain text without formatting
      SuggestionFormatter.show(SuggestionFormatter.LINT_FIX, false);
      
      // Also output summary to stderr for user to see in Claude Code terminal
      console.error(chalk.yellow('\n⚠ Code Quality Issues'));
      if (tsResult.errors > 0) {
        console.error(chalk.red(`  TypeScript: ${tsResult.errors} errors`));
      }
      if (eslintResult.errors > 0 || eslintResult.warnings > 0) {
        console.error(chalk.gray(`  ESLint: ${eslintResult.errors} errors, ${eslintResult.warnings} warnings`));
      }
    }
  }
  
  private displaySummary(): void {
    console.log('\n' + chalk.bold('Check Summary'));
    console.log(chalk.hex('#303030')('─'.repeat(30)));
    
    const table = new Table({
      head: [
        { content: 'Tool', hAlign: 'right' } as any,
        { content: 'Status', hAlign: 'center' } as any, 
        { content: 'Errors', hAlign: 'center' } as any,
        { content: 'Warnings', hAlign: 'center' } as any,
        { content: 'Duration', hAlign: 'center' } as any
      ],
      colWidths: [15, 12, 10, 10, 12],
      style: DEFAULT_TABLE_STYLE as any,
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
      
      table.push([
        { content: result.tool, hAlign: 'right' } as any,
        { content: `${statusIcon} ${status}`, hAlign: 'center' } as any,
        { content: result.errors > 0 ? chalk.red(result.errors.toString()) : chalk.green('0'), hAlign: 'right' } as any,
        { content: result.warnings > 0 ? chalk.yellow(result.warnings.toString()) : chalk.green('0'), hAlign: 'right' } as any,
        { content: result.duration ? `${(result.duration / 1000).toFixed(2)}s` : '-', hAlign: 'right' } as any
      ]);
    }
    
    // Add totals row
    table.push([
      { content: chalk.bold('Total'), hAlign: 'right' } as any,
      { content: '', hAlign: 'center' } as any,
      { content: totalErrors > 0 ? chalk.red.bold(totalErrors.toString()) : chalk.green.bold('0'), hAlign: 'right' } as any,
      { content: totalWarnings > 0 ? chalk.yellow.bold(totalWarnings.toString()) : chalk.green.bold('0'), hAlign: 'right' } as any,
      { content: '', hAlign: 'right' } as any
    ]);
    
    console.log(table.toString());
    
    // Overall status
    console.log();
    if (totalErrors === 0 && totalWarnings === 0) {
      console.log(chalk.green.bold('✓ All checks passed successfully!'));
    } else if (totalErrors > 0) {
      console.log(chalk.red.bold(`✗ Found ${totalErrors} errors and ${totalWarnings} warnings`));
    } else {
      console.log(chalk.yellow.bold(`▪ Found ${totalWarnings} warnings`));
    }
  }
  
  private displayDetailedResults(): void {
    const hasDetailedIssues = this.results.some(r => r.files.length > 0);
    
    if (hasDetailedIssues) {
      console.log('\n' + chalk.bold('Detailed Issues'));
      console.log(chalk.hex('#303030')('─'.repeat(30)));
    
      // Group issues by file
      const fileGroups = new Map<string, FileIssue[]>();
      
      for (const result of this.results) {
        for (const issue of result.files) {
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
        if (errorCount > 0) counts.push(chalk.red(`${errorCount} errors`));
        if (warningCount > 0) counts.push(chalk.yellow(`${warningCount} warnings`));
        
        console.log(`\n${fileLabel} ${chalk.dim(`(${counts.join(', ')})`)}`);
        
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