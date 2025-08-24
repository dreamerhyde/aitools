import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { UIHelper } from '../utils/ui.js';
import { Separator } from '../utils/separator.js';

export class LintInitCommand {
  async execute(options: { force?: boolean } = {}): Promise<void> {
    try {
      UIHelper.showHeader();
      console.log(chalk.bold('▪ ESLint Configuration Setup'));
      console.log(Separator.short());
      console.log();

      const eslintrcPath = path.join(process.cwd(), '.eslintrc.json');
      const eslintConfigPath = path.join(process.cwd(), 'eslint.config.js');
      
      // Check if config already exists
      const hasEslintrc = await fs.access(eslintrcPath).then(() => true).catch(() => false);
      const hasEslintConfig = await fs.access(eslintConfigPath).then(() => true).catch(() => false);
      
      if ((hasEslintrc || hasEslintConfig) && !options.force) {
        console.log(chalk.yellow('ESLint configuration already exists:'));
        if (hasEslintrc) console.log(chalk.gray(`  • ${eslintrcPath}`));
        if (hasEslintConfig) console.log(chalk.gray(`  • ${eslintConfigPath}`));
        console.log();
        console.log(chalk.gray('Use --force to overwrite existing configuration'));
        return;
      }

      // Read package.json to determine project setup
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      let hasTypescript = false;
      let isModule = false;
      
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        hasTypescript = !!(
          packageJson.devDependencies?.typescript || 
          packageJson.dependencies?.typescript ||
          packageJson.devDependencies?.['@typescript-eslint/parser'] ||
          packageJson.dependencies?.['@typescript-eslint/parser']
        );
        isModule = packageJson.type === 'module';
      } catch {
        // Fallback to checking for tsconfig.json
        hasTypescript = await fs.access(path.join(process.cwd(), 'tsconfig.json')).then(() => true).catch(() => false);
      }

      // Create ESLint configuration
      const config = this.generateEslintConfig(hasTypescript, isModule);
      
      await fs.writeFile(eslintrcPath, JSON.stringify(config, null, 2), 'utf-8');
      
      console.log(chalk.green('✓ ESLint configuration created'));
      console.log(chalk.gray(`  Configuration saved to: ${eslintrcPath}`));
      console.log();
      
      // Show configuration details
      console.log(chalk.bold('Configuration details:'));
      if (hasTypescript) {
        console.log(chalk.blue('  • TypeScript support enabled'));
        console.log(chalk.gray('    - @typescript-eslint/parser'));
        console.log(chalk.gray('    - @typescript-eslint/recommended rules'));
      } else {
        console.log(chalk.gray('  • JavaScript project (no TypeScript detected)'));
      }
      
      console.log(chalk.gray('  • Error rules: control-regex, empty blocks, async-promise-executor'));
      console.log(chalk.gray('  • Warning rules: explicit-any (TypeScript only)'));
      console.log();
      
      // Check if required dependencies are installed
      const missingDeps = await this.checkMissingDependencies(hasTypescript);
      if (missingDeps.length > 0) {
        console.log(chalk.yellow('⚠ Missing ESLint dependencies:'));
        missingDeps.forEach(dep => {
          console.log(chalk.gray(`  • ${dep}`));
        });
        console.log();
        console.log(chalk.cyan('Install missing dependencies:'));
        console.log(chalk.gray('  npm install --save-dev ' + missingDeps.join(' ')));
        console.log(chalk.gray('  # or'));
        console.log(chalk.gray('  bun add -d ' + missingDeps.join(' ')));
        console.log();
      }
      
      console.log(chalk.bold('Next steps:'));
      console.log(chalk.cyan('  ai lint') + chalk.gray(' - Check your code (errors only)'));
      console.log(chalk.cyan('  ai lint -w') + chalk.gray(' - Check your code (errors + warnings)'));
      console.log(chalk.cyan('  ai lint --fix') + chalk.gray(' - Auto-fix ESLint issues'));
      console.log();
      
    } catch (error) {
      UIHelper.showError(`Failed to initialize ESLint configuration: ${error}`);
      throw error;
    }
  }

  private generateEslintConfig(hasTypescript: boolean, isModule: boolean) {
    const config: any = {
      env: {
        node: true,
        es2022: true
      },
      extends: ['eslint:recommended'],
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: isModule ? 'module' : 'script'
      },
      rules: {
        'no-control-regex': 'error',
        'no-empty': 'error',
        'no-async-promise-executor': 'error'
      },
      ignorePatterns: [
        'dist/',
        'node_modules/',
        'build/',
        '.next/',
        'coverage/',
        '*.d.ts'
      ]
    };

    if (hasTypescript) {
      config.extends.push('plugin:@typescript-eslint/recommended');
      config.parser = '@typescript-eslint/parser';
      config.plugins = ['@typescript-eslint'];
      config.rules['@typescript-eslint/no-explicit-any'] = 'warn';
      config.rules['@typescript-eslint/no-unused-vars'] = 'error';
      // Remove project reference that can cause issues
      // config.parserOptions.project = './tsconfig.json';
    }

    return config;
  }

  private async checkMissingDependencies(hasTypescript: boolean): Promise<string[]> {
    const required = ['eslint'];
    if (hasTypescript) {
      required.push('@typescript-eslint/parser', '@typescript-eslint/eslint-plugin');
    }

    const missing: string[] = [];
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      for (const dep of required) {
        if (!allDeps[dep]) {
          missing.push(dep);
        }
      }
    } catch {
      // If we can't read package.json, assume all are missing
      return required;
    }

    return missing;
  }
}