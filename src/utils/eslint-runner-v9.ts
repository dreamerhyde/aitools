import chalk from 'chalk';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import ora from 'ora';
import { CheckResult, FileIssue } from './check-runners.js';

export class ESLintV9Runner {
  async run(fix?: boolean): Promise<CheckResult> {
    const spinner = ora('Checking ESLint...').start();
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      // Check for ESLint installation
      const localEslintPath = path.join(process.cwd(), 'node_modules', '.bin', 'eslint');
      const hasLocalEslint = fs.existsSync(localEslintPath);
      
      let hasGlobalEslint = false;
      let globalEslintVersion = '';
      try {
        const { execSync } = require('child_process');
        execSync('which eslint', { stdio: 'ignore' });
        hasGlobalEslint = true;
        // Check version to determine if it's v9+
        const versionOutput = execSync('eslint --version', { encoding: 'utf8' });
        globalEslintVersion = versionOutput.trim();
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
      const isV9 = globalEslintVersion.includes('v9') || globalEslintVersion.includes('v10');
      
      // Build target list - only check src if it exists
      const srcExists = fs.existsSync(path.join(process.cwd(), 'src'));
      const targets = srcExists ? ['src/'] : ['.'];
      
      // Build arguments based on ESLint version
      const args: string[] = [];
      
      if (isV9 && !hasLocalEslint) {
        // ESLint v9+ with flat config - minimal arguments
        args.push(...targets);
        args.push('--format', 'json');
        // v9 doesn't support --ext or --ignore-pattern with flat config
        // It relies on eslint.config.js for all configuration
      } else {
        // ESLint v8 or local installation - use traditional arguments
        args.push(...targets);
        args.push('--format', 'json');
        args.push('--ext', '.js,.jsx,.ts,.tsx');
        args.push('--no-error-on-unmatched-pattern');
        // Add ignore patterns for v8
        args.push(
          '--ignore-pattern', 'node_modules/',
          '--ignore-pattern', 'dist/',
          '--ignore-pattern', 'build/',
          '--ignore-pattern', '.next/',
          '--ignore-pattern', 'coverage/'
        );
      }
      
      if (fix) args.push('--fix');
      
      // For v9, we need to ensure there's an eslint.config.js or use stdin
      if (isV9 && !hasLocalEslint) {
        const hasConfig = fs.existsSync(path.join(process.cwd(), 'eslint.config.js')) ||
                         fs.existsSync(path.join(process.cwd(), 'eslint.config.mjs'));
        
        if (!hasConfig) {
          // No config file - can't run ESLint v9
          spinner.fail(chalk.yellow('ESLint v9 requires eslint.config.js'));
          console.log('\n' + chalk.yellow('ESLint v9 detected but no config file found.'));
          console.log('Create an eslint.config.js file or install ESLint locally:\n');
          console.log(chalk.cyan('  bun add -d eslint@8'));
          console.log(chalk.cyan('  npm install --save-dev eslint@8\n'));
          return resolve({
            tool: 'ESLint',
            status: 'skipped',
            errors: 0,
            warnings: 0,
            files: [],
            message: 'ESLint v9 requires configuration file'
          });
        }
      }
      
      spinner.text = `Running ESLint ${globalEslintVersion} (${statusText})...`;
      
      // Start ESLint with timeout and kill handling
      let eslintProcess: any;
      let killed = false;
      
      try {
        eslintProcess = spawn(eslintCommand, args, {
          env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' }
        });
      } catch (err: any) {
        spinner.fail(chalk.red('Failed to start ESLint'));
        return resolve({
          tool: 'ESLint',
          status: 'error',
          errors: 1,
          warnings: 0,
          files: [],
          message: err.message
        });
      }
      
      let output = '';
      let errorOutput = '';
      
      eslintProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      eslintProcess.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      // Kill handler for timeout
      const killProcess = () => {
        if (!killed) {
          killed = true;
          try {
            eslintProcess.kill('SIGTERM');
            setTimeout(() => {
              try {
                eslintProcess.kill('SIGKILL');
              } catch {}
            }, 1000);
          } catch {}
        }
      };
      
      // Set timeout
      const timeoutId = setTimeout(() => {
        killProcess();
        spinner.fail(chalk.red(`ESLint timed out (5s limit)`));
        
        if (isV9) {
          console.log(chalk.yellow('\nESLint v9 timeout. Try:'));
          console.log('  1. Check your eslint.config.js for issues');
          console.log('  2. Install ESLint v8 locally: ' + chalk.cyan('bun add -d eslint@8'));
          console.log('  3. Run directly: ' + chalk.cyan('eslint src/ --format stylish'));
        } else {
          console.log(chalk.yellow('\nESLint timeout. Try:'));
          console.log('  1. Check fewer files: ' + chalk.cyan('eslint src/utils/'));
          console.log('  2. Add .eslintignore file');
        }
        
        resolve({
          tool: 'ESLint',
          status: 'error',
          errors: 1,
          warnings: 0,
          files: [],
          message: 'ESLint timed out',
          duration: 5000
        });
      }, 5000); // 5 second timeout
      
      eslintProcess.on('close', (code: number) => {
        clearTimeout(timeoutId);
        
        if (killed) return; // Already handled by timeout
        
        const duration = Date.now() - startTime;
        
        // Check for configuration errors
        if (errorOutput.includes('Invalid option') || errorOutput.includes('Configuration error')) {
          spinner.fail(chalk.red('ESLint configuration error'));
          console.log(chalk.yellow('\nESLint configuration issue:'));
          console.log(errorOutput);
          return resolve({
            tool: 'ESLint',
            status: 'error',
            errors: 1,
            warnings: 0,
            files: [],
            message: 'Configuration error',
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
        } else {
          // No errors or warnings but non-zero exit code
          spinner.info('ESLint completed');
          resolve({
            tool: 'ESLint',
            status: 'success',
            errors: 0,
            warnings: 0,
            files: [],
            duration
          });
        }
      });
      
      eslintProcess.on('error', (err: any) => {
        clearTimeout(timeoutId);
        spinner.fail(chalk.red('ESLint process error'));
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
      
      if (Array.isArray(results)) {
        for (const file of results) {
          if (file.messages && Array.isArray(file.messages)) {
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
        }
      }
    } catch {
      // JSON parsing failed - output might be empty or invalid
    }
    
    return issues;
  }
  
  private showInstallInstructions(): void {
    console.log('\n' + chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold('  ESLint is required but not installed'));
    console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log('\nTo use ESLint checking, install it:\n');
    console.log(chalk.cyan('  Local installation (recommended):'));
    console.log('    bun add -d eslint@8');
    console.log('    npm install --save-dev eslint@8\n');
    console.log(chalk.cyan('  Note: ESLint v9 requires eslint.config.js'));
    console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  }
}