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
  async run(): Promise<CheckResult> {
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
      const tsc = spawn(tscPath, ['--noEmit', '--pretty', 'false'], {
        timeout: 60000
      });
      
      let output = '';
      let errorOutput = '';
      
      tsc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      tsc.stderr.on('data', (data) => {
        errorOutput += data.toString();
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
          // Use same logic as ESLint - check common directories
          const findCmd = 'find . -path "./node_modules" -prune -o -path "./.next" -prune -o -path "./dist" -prune -o -path "./build" -prune -o \\( -name "*.ts" -o -name "*.tsx" \\) -print | wc -l';
          const result = execSync(findCmd, { 
            encoding: 'utf8',
            timeout: 3000 
          });
          fileCount = parseInt(result.trim());
        } catch (e) {
          fileCount = 0;
        }
        
        let dots = 0;
        let estimatedProgress = 0;
        progressInterval = setInterval(() => {
          dots = (dots + 1) % 4;
          const dotStr = '.'.repeat(dots) + ' '.repeat(3 - dots);
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          
          // Rough progress estimation based on time (assume 10 files/second)
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
  async run(fix?: boolean): Promise<CheckResult> {
    const spinner = ora('Checking ESLint...').start();
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      // Check if local ESLint exists first
      const localEslintPath = path.join(process.cwd(), 'node_modules', '.bin', 'eslint');
      const hasLocalEslint = fs.existsSync(localEslintPath);
      
      // Check if global ESLint exists
      let hasGlobalEslint = false;
      try {
        const { execSync } = require('child_process');
        execSync('which eslint', { stdio: 'ignore' });
        hasGlobalEslint = true;
      } catch (e) {
        hasGlobalEslint = false;
      }
      
      // Decide which command to use
      let eslintCommand: string;
      let eslintArgs: string[];
      
      if (hasLocalEslint) {
        // Priority 1: Use local ESLint if available
        eslintCommand = localEslintPath;
        eslintArgs = [];
        spinner.text = 'Running ESLint (local)...';
      } else if (hasGlobalEslint) {
        // Priority 2: Use global ESLint
        eslintCommand = 'eslint';
        eslintArgs = [];
        spinner.text = 'Running ESLint (global)...';
      } else {
        // No ESLint found - provide helpful message
        spinner.fail(chalk.yellow('ESLint not found'));
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
        
        return resolve({
          tool: 'ESLint',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: 'ESLint not installed - see instructions above'
        });
      }
      
      // Get actual target files for accurate count
      let fileCount = 0;
      const actualFiles: string[] = [];
      
      // Use simple directory targets instead of glob patterns
      const targetDirs: string[] = [];
      
      // Check for common source directories
      const srcExists = fs.existsSync(path.join(process.cwd(), 'src'));
      const appExists = fs.existsSync(path.join(process.cwd(), 'app'));
      const libExists = fs.existsSync(path.join(process.cwd(), 'lib'));
      const componentsExists = fs.existsSync(path.join(process.cwd(), 'components'));
      
      if (srcExists) targetDirs.push('src');
      if (appExists) targetDirs.push('app');
      if (libExists) targetDirs.push('lib');
      if (componentsExists) targetDirs.push('components');
      
      // If no common directories, use current directory with aggressive exclusions
      if (targetDirs.length === 0) {
        targetDirs.push('.');
      }
      
      // Count actual files that will be checked
      try {
        const { execSync } = require('child_process');
        // Count files in target directories
        let countCmd = '';
        if (targetDirs.includes('src')) {
          countCmd = 'find src -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | wc -l';
        } else if (targetDirs.includes('.')) {
          countCmd = 'find . -maxdepth 2 \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \\) -not -path "./node_modules/*" -not -path "./dist/*" -not -path "./.next/*" | wc -l';
        } else {
          const dirs = targetDirs.join(' ');
          countCmd = `find ${dirs} -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | wc -l`;
        }
        const result = execSync(countCmd, { 
          encoding: 'utf8',
          timeout: 2000
        });
        fileCount = parseInt(result.trim()) || 10;
      } catch (e) {
        // Fallback estimate
        fileCount = 10;
      }
      
      // Use .gitignore as ignore file if .eslintignore doesn't exist
      const eslintignorePath = path.join(process.cwd(), '.eslintignore');
      const gitignorePath = path.join(process.cwd(), '.gitignore');
      const hasEslintignore = fs.existsSync(eslintignorePath);
      const hasGitignore = fs.existsSync(gitignorePath);
      
      const args = [
        ...eslintArgs,
        ...targetDirs,  // Use simple directories
        '--format', 'json',
        '--ext', '.js,.jsx,.ts,.tsx'  // Explicitly specify extensions
      ];
      
      // Always add comprehensive ignore patterns regardless of .eslintignore
      args.push(
        '--ignore-pattern', 'node_modules/**',
        '--ignore-pattern', 'dist/**',
        '--ignore-pattern', 'build/**',
        '--ignore-pattern', '.next/**',
        '--ignore-pattern', 'coverage/**',
        '--ignore-pattern', '*.min.js',
        '--ignore-pattern', 'public/**',
        '--ignore-pattern', 'vendor/**',
        '--ignore-pattern', '.git/**',
        '--ignore-pattern', '*.config.js',
        '--ignore-pattern', 'test/**',
        '--ignore-pattern', 'tests/**',
        '--ignore-pattern', '__tests__/**',
        '--ignore-pattern', 'docs/**'
      );
      
      // Also use .gitignore if no .eslintignore exists
      if (!hasEslintignore && hasGitignore) {
        args.push('--ignore-path', '.gitignore');
      }
      
      if (fix) args.push('--fix');
      
      const statusText = hasLocalEslint ? 'local' : 'global';
      spinner.text = `ESLint (${statusText}): checking ${fileCount} files...`;
      
      // Add simple progress indicator with elapsed time
      let progressInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const estimatedProgress = Math.min(90, elapsed * 8); // Roughly 8% per second
        spinner.text = `ESLint (${statusText}): ${estimatedProgress}% (${elapsed}s of ~${Math.ceil(fileCount/6)}s)`;
      }, 1000);
      
      const eslint = spawn(eslintCommand, args);
      let output = '';
      
      eslint.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      // Add timeout handler (reduced to 15s for better UX)
      const timeoutId = setTimeout(() => {
        eslint.kill('SIGKILL');
        if (progressInterval) clearInterval(progressInterval);
        spinner.fail(chalk.red('ESLint check timed out (15s limit)'));
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
          duration: 15000
        });
      }, 15000);
      
      eslint.on('close', (code) => {
        clearTimeout(timeoutId);
        if (progressInterval) clearInterval(progressInterval);
        const duration = Date.now() - startTime;
        const files = this.parseESLintOutput(output);
        const errorCount = files.filter(f => f.severity === 'error').length;
        const warningCount = files.filter(f => f.severity === 'warning').length;
        
        const viaText = hasLocalEslint ? '' : ' (global)';
        
        if (code === 0) {
          spinner.succeed(chalk.green(`ESLint check passed${viaText}`));
          resolve({
            tool: 'ESLint',
            status: 'success',
            errors: 0,
            warnings: 0,
            files: [],
            duration
          });
        } else if (errorCount > 0) {
          spinner.fail(chalk.red(`ESLint found ${errorCount} errors, ${warningCount} warnings${viaText}`));
          resolve({
            tool: 'ESLint',
            status: 'error',
            errors: errorCount,
            warnings: warningCount,
            files,
            duration
          });
        } else if (warningCount > 0) {
          spinner.warn(chalk.yellow(`ESLint found ${warningCount} warnings${viaText}`));
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
}