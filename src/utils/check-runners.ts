import chalk from 'chalk';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import ora from 'ora';
import { GitignoreHelper } from './gitignore-helper.js';

export interface CheckResult {
  tool: string;
  status: 'success' | 'warning' | 'error' | 'skipped';
  errors: number;
  warnings: number;
  files: FileIssue[];
  message?: string;
  duration?: number;
}

export interface FileIssue {
  file: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule?: string;
}

export class TypeScriptRunner {
  async run(targetFile?: string): Promise<CheckResult> {
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
      
      spinner.text = 'Running TypeScript type check (this may take a moment)...';
      const tscArgs = ['--noEmit', '--pretty', 'false'];
      if (targetFile) {
        tscArgs.push(targetFile);
      }
      const tsc = spawn(tscPath, tscArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      });
      
      let output = '';
      let errorOutput = '';
      
      tsc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      tsc.stderr.on('data', (data) => {
        errorOutput += data.toString();
        // Keep spinner alive to show progress
        spinner.text = `Running TypeScript type check... (${output.split('\n').length} lines processed)`;
      });
      
      // Add timeout handler
      const timeoutId = setTimeout(() => {
        tsc.kill('SIGKILL');
        spinner.fail(chalk.red('TypeScript check timed out (60s limit)'));
        resolve({
          tool: 'TypeScript',
          status: 'error',
          errors: 1,
          warnings: 0,
          files: [],
          message: 'TypeScript check timed out - check for circular dependencies or complex types',
          duration: 60000
        });
      }, 60000);
      
      // Add progress indicator with file count estimation
      let progressInterval: NodeJS.Timeout;
      let fileCount = 0;
      
      // Count TypeScript files to give better progress indication
      setTimeout(() => {
        try {
          const { execSync } = require('child_process');
          const findCmd = 'find . -path "./node_modules" -prune -o -path "./.next" -prune -o -path "./dist" -prune -o -path "./build" -prune -o \\( -name "*.ts" -o -name "*.tsx" \\) -print | wc -l';
          const result = execSync(findCmd, { encoding: 'utf8', timeout: 3000 });
          fileCount = parseInt(result.trim());
        } catch (e) {
          fileCount = 0;
        }
        
        let dots = 0, estimatedProgress = 0;
        progressInterval = setInterval(() => {
          dots = (dots + 1) % 4;
          const dotStr = '.'.repeat(dots) + ' '.repeat(3 - dots);
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          if (fileCount > 0) {
            estimatedProgress = Math.min(90, Math.floor((elapsed * 10 / fileCount) * 100));
            spinner.text = `TypeScript checking${dotStr} ${estimatedProgress}% (${elapsed}s)`;
          } else {
            spinner.text = `TypeScript checking${dotStr} (${elapsed}s)`;
          }
        }, 500);
      }, 1000);
      
      tsc.on('close', (code) => {
        clearTimeout(timeoutId);
        if (progressInterval) clearInterval(progressInterval);
        
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
  
  private parseTypeScriptOutput(output: string): FileIssue[] {
    const issues: FileIssue[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
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
}

export class ESLintRunner {
  async run(fix?: boolean, targetFile?: string): Promise<CheckResult> {
    const spinner = ora('Checking ESLint...').start();
    const startTime = Date.now();
    
    return new Promise(async (resolve) => {
      // Only check for local ESLint
      const localEslintPath = path.join(process.cwd(), 'node_modules', '.bin', 'eslint');
      const hasLocalEslint = fs.existsSync(localEslintPath);
      
      if (!hasLocalEslint) {
        // No local ESLint found - provide helpful message
        spinner.fail(chalk.yellow('Local ESLint not found'));
        console.log('\n' + chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(chalk.bold('  Local ESLint is required for reliable code checking'));
        console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log('\nPlease install ESLint as a dev dependency:\n');
        console.log(chalk.cyan('  Using Bun:'));
        console.log('    bun add -d eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser\n');
        console.log(chalk.cyan('  Using npm:'));
        console.log('    npm install --save-dev eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser\n');
        console.log(chalk.dim('  Local ESLint ensures consistent configuration and better performance.'));
        console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
        
        return resolve({
          tool: 'ESLint',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: 'Local ESLint not installed - install as dev dependency for reliable checking'
        });
      }
      
      // Check ESLint version and configuration
      const { execSync } = require('child_process');
      let eslintVersion = '8';
      try {
        const versionOutput = execSync(`${localEslintPath} --version`, { encoding: 'utf8' });
        eslintVersion = versionOutput.includes('v9.') ? '9' : '8';
      } catch (e) {
        // Default to version 8
      }
      
      // Check if project has ESLint config
      const configFiles = ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs'];
      const hasConfig = configFiles.some(file => fs.existsSync(path.join(process.cwd(), file)));
      
      if (!hasConfig) {
        spinner.info(chalk.yellow('No ESLint configuration found'));
        console.log('\n' + chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(chalk.bold('  ESLint configuration is required'));
        console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log('\nPlease add ESLint configuration:\n');
        if (eslintVersion === '9') {
          console.log(chalk.cyan('  For ESLint 9.x (flat config):'));
          console.log('    Create eslint.config.mjs or use legacy config with ESLINT_USE_FLAT_CONFIG=false\n');
        } else {
          console.log(chalk.cyan('  For ESLint 8.x:'));
          console.log('    Create .eslintrc.json or .eslintrc.js\n');
        }
        console.log(chalk.dim('  Without configuration, ESLint may check unnecessary files.'));
        console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
        
        return resolve({
          tool: 'ESLint',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: `ESLint ${eslintVersion}.x found but no configuration - add .eslintrc.json or eslint.config.mjs`
        });
      }
      
      // Use local ESLint
      const eslintCommand = localEslintPath;
      const eslintArgs: string[] = [];
      spinner.text = 'Running ESLint (local)...';
      
      // Get actual target files for accurate count
      let fileCount = 0;
      
      // Use GitignoreHelper to count actual files that will be checked
      const gitignoreHelper = new GitignoreHelper();
      
      // Count files using GitignoreHelper to respect .gitignore
      const extensions = ['.ts', '.tsx', '.js', '.jsx'];
      const walkDir = async (dir: string): Promise<void> => {
        try {
          const entries = await import('fs').then(fs => fs.promises.readdir(dir, { withFileTypes: true }));
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(process.cwd(), fullPath);
            
            // Skip if ignored by gitignore
            if (gitignoreHelper.isIgnored(relativePath)) {
              continue;
            }
            
            if (entry.isDirectory()) {
              await walkDir(fullPath);
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name);
              if (extensions.includes(ext)) {
                fileCount++;
              }
            }
          }
        } catch (e) {
          // Skip directories we can't read
        }
      };
      
      try {
        await walkDir(process.cwd());
        if (fileCount === 0) fileCount = 10; // Fallback
      } catch (e) {
        fileCount = 10; // Fallback
      }
      
      const args = [
        ...eslintArgs,
        targetFile || '.',  // Check specific file or current directory
        '--format', 'json',
        '--ext', '.js,.jsx,.ts,.tsx'  // Explicitly specify extensions
      ];
      
      if (fix) args.push('--fix');
      
      spinner.text = targetFile ? `ESLint (local): checking ${targetFile}...` : `ESLint (local): checking ${fileCount} files...`;
      
      // Add simple progress indicator with elapsed time
      const progressInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const estimatedProgress = Math.min(90, elapsed * 8); // Roughly 8% per second
        spinner.text = `ESLint (local): ${estimatedProgress}% (${elapsed}s of ~${Math.ceil(fileCount/6)}s)`;
      }, 1000);
      
      const eslint = spawn(eslintCommand, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      });
      let output = '';
      
      eslint.stdout.on('data', (data) => {
        output += data.toString();
        // Update progress based on output
        const lines = output.split('\n').length;
        spinner.text = `ESLint: Processing... (${lines} issues found so far)`;
      });
      
      eslint.stderr.on('data', (data) => {
        // Handle stderr if needed but don't store it since it's not used
      });
      
      // Increase timeout to 30s for larger projects
      const timeoutId = setTimeout(() => {
        eslint.kill('SIGKILL');
        if (progressInterval) clearInterval(progressInterval);
        spinner.fail(chalk.red('ESLint check timed out (30s limit)'));
        console.log(chalk.yellow('\nESLint is taking too long. Possible solutions:'));
        console.log('  1. Add .eslintignore file to exclude unnecessary files');
        console.log('  2. Check specific directories: ' + chalk.cyan('eslint src/'));
        console.log('  3. Fix your .eslintrc configuration\n');
        resolve({
          tool: 'ESLint',
          status: 'error',
          errors: 1,
          warnings: 0,
          files: [],
          message: `ESLint timed out checking ${fileCount} files`,
          duration: 30000
        });
      }, 30000);
      
      eslint.on('close', (code) => {
        clearTimeout(timeoutId);
        if (progressInterval) clearInterval(progressInterval);
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
}

export class BuildRunner {
  async run(): Promise<CheckResult> {
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
      
      const runner = fs.existsSync(path.join(process.cwd(), 'bun.lockb')) ? 'bun' : 'npm';
      const build = spawn(runner, ['run', 'build']);
      let errorOutput = '';
      
      build.stdout.on('data', (data) => {
        // Handle stdout if needed
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
}