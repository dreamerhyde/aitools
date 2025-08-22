import chalk from 'chalk';
import Table from 'cli-table3';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import ora from 'ora';

interface CheckResult {
  tool: string;
  status: 'success' | 'warning' | 'error' | 'skipped';
  errors: number;
  warnings: number;
  files: FileIssue[];
  message?: string;
  duration?: number;
}

interface FileIssue {
  file: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule?: string;
}

export class CheckCommand {
  private results: CheckResult[] = [];
  
  async execute(options: { 
    typescript?: boolean; 
    eslint?: boolean; 
    all?: boolean;
    fix?: boolean;
  }): Promise<void> {
    console.log(chalk.bold('\nCode Quality Check'));
    console.log(chalk.dim('─'.repeat(process.stdout.columns || 80)));
    
    const checks: Array<() => Promise<CheckResult>> = [];
    
    // Determine which checks to run
    if (options.all || (!options.typescript && !options.eslint)) {
      checks.push(() => this.checkTypeScript());
      checks.push(() => this.checkESLint(options.fix));
      checks.push(() => this.checkBuildStatus());
    } else {
      if (options.typescript) checks.push(() => this.checkTypeScript());
      if (options.eslint) checks.push(() => this.checkESLint(options.fix));
    }
    
    // Run all checks
    for (const check of checks) {
      const result = await check();
      this.results.push(result);
    }
    
    // Display results
    this.displaySummary();
    this.displayDetailedResults();
  }
  
  private async checkTypeScript(): Promise<CheckResult> {
    const spinner = ora('Running TypeScript type check...').start();
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const tscPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsc');
      const hasTsc = fs.existsSync(tscPath);
      
      if (!hasTsc) {
        spinner.fail('TypeScript not found');
        return resolve({
          tool: 'TypeScript',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: 'TypeScript not installed in this project'
        });
      }
      
      // Add timeout and progress tracking
      spinner.text = 'Running TypeScript type check (this may take a moment)...';
      const tsc = spawn(tscPath, ['--noEmit', '--pretty', 'false'], {
        timeout: 60000 // 60 second timeout
      });
      let output = '';
      let errorOutput = '';
      
      tsc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      tsc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      tsc.on('close', (code) => {
        const duration = Date.now() - startTime;
        const files = this.parseTypeScriptOutput(output + errorOutput);
        const errorCount = files.filter(f => f.severity === 'error').length;
        const warningCount = files.filter(f => f.severity === 'warning').length;
        
        if (code === 0) {
          spinner.succeed(chalk.green('TypeScript check passed'));
          resolve({
            tool: 'TypeScript',
            status: 'success',
            errors: 0,
            warnings: 0,
            files: [],
            duration
          });
        } else {
          spinner.fail(chalk.red(`TypeScript found ${errorCount} errors`));
          resolve({
            tool: 'TypeScript',
            status: 'error',
            errors: errorCount,
            warnings: warningCount,
            files,
            duration
          });
        }
      });
    });
  }
  
  private async checkESLint(fix?: boolean): Promise<CheckResult> {
    const spinner = ora('Running ESLint...').start();
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const eslintPath = path.join(process.cwd(), 'node_modules', '.bin', 'eslint');
      const hasEslint = fs.existsSync(eslintPath);
      
      if (!hasEslint) {
        spinner.fail('ESLint not found');
        return resolve({
          tool: 'ESLint',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: 'ESLint not installed in this project'
        });
      }
      
      // Add excludes for common directories that should not be linted
      const args = [
        'src', // Only lint src directory 
        '--format', 'json',
        '--ignore-pattern', 'node_modules/**',
        '--ignore-pattern', 'dist/**',
        '--ignore-pattern', 'build/**',
        '--ignore-pattern', '*.min.js',
        '--ignore-pattern', 'coverage/**',
        '--ignore-pattern', '.git/**'
      ];
      
      if (fix) args.push('--fix');
      
      spinner.text = `Running ESLint on src directory...`;
      const eslint = spawn(eslintPath, args);
      let output = '';
      
      eslint.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      // Add timeout handler
      const timeoutId = setTimeout(() => {
        eslint.kill('SIGKILL');
        spinner.fail(chalk.red('ESLint check timed out (60s limit)'));
        resolve({
          tool: 'ESLint',
          status: 'error',
          errors: 1,
          warnings: 0,
          files: [],
          message: 'ESLint timed out - check if there are performance issues',
          duration: 60000
        });
      }, 60000);
      
      eslint.on('close', (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        const files = this.parseESLintOutput(output);
        const errorCount = files.filter(f => f.severity === 'error').length;
        const warningCount = files.filter(f => f.severity === 'warning').length;
        
        if (code === 0) {
          spinner.succeed(chalk.green('ESLint check passed'));
          resolve({
            tool: 'ESLint',
            status: 'success',
            errors: 0,
            warnings: 0,
            files: [],
            duration
          });
        } else if (errorCount > 0) {
          spinner.fail(chalk.red(`ESLint found ${errorCount} errors, ${warningCount} warnings`));
          resolve({
            tool: 'ESLint',
            status: 'error',
            errors: errorCount,
            warnings: warningCount,
            files,
            duration
          });
        } else if (warningCount > 0) {
          spinner.warn(chalk.yellow(`ESLint found ${warningCount} warnings`));
          resolve({
            tool: 'ESLint',
            status: 'warning',
            errors: 0,
            warnings: warningCount,
            files,
            duration
          });
        }
      });
    });
  }
  
  private async checkBuildStatus(): Promise<CheckResult> {
    const spinner = ora('Checking build status...').start();
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const packageJson = path.join(process.cwd(), 'package.json');
      
      if (!fs.existsSync(packageJson)) {
        spinner.fail('No package.json found');
        return resolve({
          tool: 'Build',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: 'No package.json in current directory'
        });
      }
      
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
      
      if (!pkg.scripts?.build) {
        spinner.info('No build script defined');
        return resolve({
          tool: 'Build',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: 'No build script in package.json'
        });
      }
      
      // Use bun if available, otherwise npm
      const runner = fs.existsSync(path.join(process.cwd(), 'bun.lockb')) ? 'bun' : 'npm';
      const build = spawn(runner, ['run', 'build']);
      
      let output = '';
      let errorOutput = '';
      
      build.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      build.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      build.on('close', (code) => {
        const duration = Date.now() - startTime;
        
        if (code === 0) {
          spinner.succeed(chalk.green('Build successful'));
          resolve({
            tool: 'Build',
            status: 'success',
            errors: 0,
            warnings: 0,
            files: [],
            duration
          });
        } else {
          spinner.fail(chalk.red('Build failed'));
          resolve({
            tool: 'Build',
            status: 'error',
            errors: 1,
            warnings: 0,
            files: [{
              file: 'build',
              severity: 'error',
              message: errorOutput || 'Build process failed'
            }],
            duration
          });
        }
      });
    });
  }
  
  private parseTypeScriptOutput(output: string): FileIssue[] {
    const issues: FileIssue[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Parse TypeScript error format: file.ts(line,col): error TS2322: message
      const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)/);
      if (match) {
        issues.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          severity: match[4] as 'error' | 'warning',
          message: match[5],
          rule: match[0].match(/TS(\d+)/)?.[1] ? `TS${match[0].match(/TS(\d+)/)?.[1]}` : undefined
        });
      }
    }
    
    return issues;
  }
  
  private parseESLintOutput(output: string): FileIssue[] {
    const issues: FileIssue[] = [];
    
    try {
      const results = JSON.parse(output);
      
      for (const file of results) {
        for (const message of file.messages) {
          issues.push({
            file: file.filePath,
            line: message.line,
            column: message.column,
            severity: message.severity === 2 ? 'error' : 'warning',
            message: message.message,
            rule: message.ruleId
          });
        }
      }
    } catch (e) {
      // Fallback to text parsing if JSON fails
    }
    
    return issues;
  }
  
  private displaySummary(): void {
    console.log('\n' + chalk.bold('Check Summary'));
    console.log(chalk.dim('─'.repeat(process.stdout.columns || 80)));
    
    const table = new Table({
      head: ['Tool', 'Status', 'Errors', 'Warnings', 'Duration'],
      colWidths: [15, 12, 10, 10, 12],
      style: { 
        head: ['cyan'],
        border: ['gray']
      },
      chars: {
        'top': '─',
        'top-mid': '┬',
        'top-left': '┌',
        'top-right': '┐',
        'bottom': '─',
        'bottom-mid': '┴',
        'bottom-left': '└',
        'bottom-right': '┘',
        'left': '│',
        'left-mid': '├',
        'mid': '─',
        'mid-mid': '┼',
        'right': '│',
        'right-mid': '┤',
        'middle': '│'
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
    console.log(chalk.dim('─'.repeat(process.stdout.columns || 80)));
    
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
    
    // Suggestions
    console.log('\n' + chalk.bold('Suggestions'));
    console.log(chalk.dim('─'.repeat(process.stdout.columns || 80)));
    
    if (this.results.some(r => r.tool === 'ESLint' && r.errors > 0)) {
      console.log(chalk.yellow('▪') + ' Run ' + chalk.cyan('aitools check --fix') + ' to automatically fix some ESLint issues');
    }
    
    if (this.results.some(r => r.tool === 'TypeScript' && r.errors > 0)) {
      console.log(chalk.yellow('▪') + ' Fix TypeScript errors to ensure type safety');
    }
    
    console.log(chalk.yellow('▪') + ' Run ' + chalk.cyan('aitools check --all') + ' to run all available checks');
  }
}