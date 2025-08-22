import chalk from 'chalk';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import ora from 'ora';
import { CheckResult, FileIssue } from './check-runners.js';

export class OptimizedESLintRunner {
  async run(fix?: boolean): Promise<CheckResult> {
    const spinner = ora('Checking ESLint...').start();
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      // Check for ESLint installation
      const localEslintPath = path.join(process.cwd(), 'node_modules', '.bin', 'eslint');
      const hasLocalEslint = fs.existsSync(localEslintPath);
      
      let hasGlobalEslint = false;
      try {
        const { execSync } = require('child_process');
        execSync('which eslint', { stdio: 'ignore' });
        hasGlobalEslint = true;
      } catch {
        hasGlobalEslint = false;
      }
      
      if (!hasLocalEslint && !hasGlobalEslint) {
        spinner.fail(chalk.yellow('ESLint not found'));
        this.showInstallInstructions();
        return resolve({
          tool: 'ESLint',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: 'ESLint not installed - see instructions above'
        });
      }
      
      // Decide which ESLint to use
      const eslintCommand = hasLocalEslint ? localEslintPath : 'eslint';
      const statusText = hasLocalEslint ? 'local' : 'global';
      
      // Build target list - only check src if it exists
      const srcExists = fs.existsSync(path.join(process.cwd(), 'src'));
      const targetDirs = srcExists ? ['src'] : ['.'];
      
      // Build arguments with aggressive exclusions
      const args = [
        ...targetDirs,
        '--format', 'json',
        '--ext', '.js,.jsx,.ts,.tsx',
        '--max-warnings', '100', // Limit warnings to prevent overwhelming output
        '--no-error-on-unmatched-pattern', // Don't fail if no files match
        // Aggressive ignore patterns
        '--ignore-pattern', '**/node_modules/**',
        '--ignore-pattern', '**/dist/**',
        '--ignore-pattern', '**/build/**',
        '--ignore-pattern', '**/.next/**',
        '--ignore-pattern', '**/coverage/**',
        '--ignore-pattern', '**/*.min.js',
        '--ignore-pattern', '**/public/**',
        '--ignore-pattern', '**/vendor/**',
        '--ignore-pattern', '**/.git/**',
        '--ignore-pattern', '**/*.config.js',
        '--ignore-pattern', '**/test/**',
        '--ignore-pattern', '**/tests/**',
        '--ignore-pattern', '**/__tests__/**',
        '--ignore-pattern', '**/docs/**',
        '--ignore-pattern', '**/.cache/**',
        '--ignore-pattern', '**/tmp/**',
        '--ignore-pattern', '**/*.d.ts'
      ];
      
      if (fix) args.push('--fix');
      
      spinner.text = `Running ESLint (${statusText}) on ${targetDirs.join(', ')}...`;
      
      // Start ESLint with shorter timeout
      const eslint = spawn(eslintCommand, args, {
        timeout: 8000, // 8 second hard timeout
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' } // Limit memory
      });
      
      let output = '';
      let timedOut = false;
      
      eslint.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      // Timeout handler
      const timeoutId = setTimeout(() => {
        timedOut = true;
        eslint.kill('SIGTERM');
        setTimeout(() => eslint.kill('SIGKILL'), 1000); // Force kill after 1s
      }, 7000); // 7 second soft timeout
      
      eslint.on('close', (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        
        if (timedOut) {
          spinner.fail(chalk.red('ESLint timed out'));
          console.log(chalk.yellow('\nTry running ESLint directly on specific files:'));
          console.log(chalk.cyan(`  eslint src/specific-file.ts`));
          console.log(chalk.cyan(`  eslint src/utils/*.ts`));
          return resolve({
            tool: 'ESLint',
            status: 'error',
            errors: 1,
            warnings: 0,
            files: [],
            message: 'ESLint timed out - check fewer files',
            duration
          });
        }
        
        const files = this.parseESLintOutput(output);
        const errorCount = files.filter(f => f.severity === 'error').length;
        const warningCount = files.filter(f => f.severity === 'warning').length;
        
        if (code === 0) {
          spinner.succeed(chalk.green(`ESLint check passed (${statusText})`));
          resolve({
            tool: 'ESLint',
            status: 'success',
            errors: 0,
            warnings: 0,
            files: [],
            duration
          });
        } else if (errorCount > 0) {
          spinner.fail(chalk.red(`ESLint found ${errorCount} errors, ${warningCount} warnings (${statusText})`));
          resolve({
            tool: 'ESLint',
            status: 'error',
            errors: errorCount,
            warnings: warningCount,
            files,
            duration
          });
        } else if (warningCount > 0) {
          spinner.warn(chalk.yellow(`ESLint found ${warningCount} warnings (${statusText})`));
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
      
      eslint.on('error', (err) => {
        clearTimeout(timeoutId);
        spinner.fail(chalk.red('ESLint failed to start'));
        console.error(err.message);
        resolve({
          tool: 'ESLint',
          status: 'error',
          errors: 1,
          warnings: 0,
          files: [],
          message: err.message
        });
      });
    });
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
    } catch {
      // JSON parsing failed
    }
    
    return issues;
  }
  
  private showInstallInstructions(): void {
    console.log('\n' + chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold('  ESLint is required but not installed'));
    console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log('\nTo use ESLint checking, install it in one of these ways:\n');
    console.log(chalk.cyan('  Local (recommended for projects):'));
    console.log('    bun add -d eslint');
    console.log('    npm install --save-dev eslint\n');
    console.log(chalk.cyan('  Global (for quick checks):'));
    console.log('    bun install -g eslint');
    console.log('    npm install -g eslint\n');
    console.log(chalk.dim('  After installation, run "aitools check" again.'));
    console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  }
}