import chalk from 'chalk';
import Table from 'cli-table3';
import { CheckResult, FileIssue, TypeScriptRunner, BuildRunner } from '../utils/check-runners.js';
import { ESLintV9Runner } from '../utils/eslint-runner-v9.js';

export class CheckCommand {
  private results: CheckResult[] = [];
  
  async execute(options: { 
    typescript?: boolean; 
    eslint?: boolean; 
    all?: boolean;
    fix?: boolean;
  }): Promise<void> {
    console.log(chalk.bold('\nCode Quality Check'));
    console.log(chalk.dim('─'.repeat(40)));
    
    const runners: Array<() => Promise<CheckResult>> = [];
    
    // Determine which checks to run
    if (options.all || (!options.typescript && !options.eslint)) {
      runners.push(() => new TypeScriptRunner().run());
      runners.push(() => new ESLintV9Runner().run(options.fix));
      runners.push(() => new BuildRunner().run());
    } else {
      if (options.typescript) runners.push(() => new TypeScriptRunner().run());
      if (options.eslint) runners.push(() => new ESLintV9Runner().run(options.fix));
    }
    
    // Run all checks sequentially
    for (const runner of runners) {
      const result = await runner();
      this.results.push(result);
    }
    
    // Display results
    this.displaySummary();
    this.displayDetailedResults();
  }
  
  private displaySummary(): void {
    console.log('\n' + chalk.bold('Check Summary'));
    console.log(chalk.dim('─'.repeat(40)));
    
    const table = new Table({
      head: ['Tool', 'Status', 'Errors', 'Warnings', 'Duration'],
      colWidths: [15, 12, 10, 10, 12],
      style: { 
        head: ['cyan'],
        border: ['gray']
      },
      chars: {
        'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
        'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
        'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
        'right': '', 'right-mid': '', 'middle': ' '
      }
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
        result.tool,
        `${statusIcon} ${status}`,
        result.errors > 0 ? chalk.red(result.errors.toString()) : chalk.green('0'),
        result.warnings > 0 ? chalk.yellow(result.warnings.toString()) : chalk.green('0'),
        result.duration ? `${(result.duration / 1000).toFixed(2)}s` : '-'
      ]);
    }
    
    // Add totals row
    table.push([
      chalk.bold('Total'),
      '',
      totalErrors > 0 ? chalk.red.bold(totalErrors.toString()) : chalk.green.bold('0'),
      totalWarnings > 0 ? chalk.yellow.bold(totalWarnings.toString()) : chalk.green.bold('0'),
      ''
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
    const hasIssues = this.results.some(r => r.files.length > 0);
    
    if (!hasIssues) {
      return;
    }
    
    console.log('\n' + chalk.bold('Detailed Issues'));
    console.log(chalk.dim('─'.repeat(40)));
    
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
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10); // Show top 10 problematic files
    
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
      const sortedIssues = issues.sort((a, b) => (a.line || 0) - (b.line || 0)).slice(0, 5);
      
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
      
      if (issues.length > 5) {
        console.log(`  ${chalk.gray(`... and ${issues.length - 5} more issues`)}`);
      }
    }
    
    // Suggestions
    this.showSuggestions();
  }
  
  private showSuggestions(): void {
    console.log('\n' + chalk.bold('Suggestions'));
    console.log(chalk.dim('─'.repeat(40)));
    
    if (this.results.some(r => r.tool === 'ESLint' && r.errors > 0)) {
      console.log(chalk.yellow('▪') + ' Run ' + chalk.cyan('aitools lint --fix') + ' to automatically fix ESLint issues');
    }
    
    if (this.results.some(r => r.tool === 'TypeScript' && r.errors > 0)) {
      console.log(chalk.yellow('▪') + ' Fix TypeScript errors to ensure type safety');
    }
    
    console.log(chalk.yellow('▪') + ' Run ' + chalk.cyan('aitools lint') + ' to run TypeScript and ESLint checks');
    console.log(chalk.yellow('▪') + ' Use ' + chalk.cyan('aitools health') + ' to check file complexity and size');
  }
}