// import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { UIHelper } from '../utils/ui.js';

export class SupabaseFixCommand {
  constructor() {
  }

  private findMigrationFiles(options: any = {}): string[] {
    const baseDir = options.directory || path.join(process.cwd(), 'supabase');
    const migrationsPath = path.join(baseDir, 'migrations');
    
    if (!fs.existsSync(migrationsPath)) {
      throw new Error(`No migrations directory found at ${migrationsPath}`);
    }

    // If specific files are provided
    if (options.files && options.files.length > 0) {
      const files: string[] = [];
      for (const file of options.files) {
        // Support both full filename and partial filename
        const fullPath = file.endsWith('.sql') 
          ? path.join(migrationsPath, file)
          : path.join(migrationsPath, `${file}.sql`);
        
        // Check exact match first
        if (fs.existsSync(fullPath)) {
          files.push(fullPath);
          console.log(chalk.green('✓'), chalk.dim('Found:'), path.basename(fullPath));
        } else {
          // Try to find files that contain this pattern
          const allFiles = fs.readdirSync(migrationsPath);
          const matches = allFiles.filter(f => f.includes(file) && f.endsWith('.sql'));
          
          if (matches.length === 1) {
            files.push(path.join(migrationsPath, matches[0]));
            console.log(chalk.green('✓'), chalk.dim('Found:'), matches[0]);
          } else if (matches.length > 1) {
            console.log(chalk.yellow(`✓ Found ${matches.length} files matching "${file}":`));
            matches.forEach(m => {
              console.log(chalk.dim('  -'), chalk.white(m));
              files.push(path.join(migrationsPath, m));
            });
            console.log(chalk.cyan('→'), chalk.dim('All matching files will be processed'));
          } else {
            console.log(chalk.red('✗'), `No file found matching: ${file}`);
          }
        }
      }
      
      if (files.length > 0) {
        console.log(chalk.dim('─'.repeat(50)));
      }
      
      return files;
    }

    // Default: all SQL files
    const files = fs.readdirSync(migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .map(file => path.join(migrationsPath, file));

    return files;
  }

  private extractPolicyName(createPolicyText: string): { name: string; table: string } | null {
    // Remove extra whitespace and join lines
    const normalizedText = createPolicyText.replace(/\s+/g, ' ').trim();
    
    // Match: create policy "policy name" on "schema"."table"
    const match = normalizedText.match(/create\s+policy\s+"([^"]+)"\s+on\s+"([^"]+)"\."([^"]+)"/i);
    if (match) {
      return { name: match[1], table: `"${match[2]}"."${match[3]}"` };
    }
    
    // Alternative format without schema
    const matchNoSchema = normalizedText.match(/create\s+policy\s+"([^"]+)"\s+on\s+"([^"]+)"/i);
    if (matchNoSchema) {
      return { name: matchNoSchema[1], table: `"${matchNoSchema[2]}"` };
    }
    
    return null;
  }

  private fixMigrationFile(filePath: string): { original: string; fixed: string; changeCount: number } {
    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;
    let changeCount = 0;

    // Fix 1: Add "if exists" to all drop policy statements
    const dropPolicyRegex = /^drop\s+policy\s+"([^"]+)"/gim;
    content = content.replace(dropPolicyRegex, (match, policyName) => {
      if (!match.includes('if exists')) {
        changeCount++;
        return `drop policy if exists "${policyName}"`;
      }
      return match;
    });

    // Fix 2: Add drop policy if exists before each create policy
    const lines = content.split('\n');
    const processedLines: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      
      // Check if this line starts a create policy statement
      if (line.trim().toLowerCase().startsWith('create policy')) {
        // Look for the full create policy statement (might span multiple lines)
        let createStatement = line;
        let j = i + 1;
        
        // Find the complete create policy statement
        while (j < lines.length && !lines[j - 1].trim().endsWith(';')) {
          createStatement += '\n' + lines[j];
          j++;
        }

        // Extract policy name and table from the create statement (check first two lines)
        const firstTwoLines = line + (i + 1 < lines.length ? '\n' + lines[i + 1] : '');
        const policyInfo = this.extractPolicyName(firstTwoLines);
        
        if (policyInfo) {
          // Check if the previous line is already a drop policy for this same policy
          const prevLine = i > 0 ? lines[i - 1].trim() : '';
          const alreadyHasDrop = prevLine.includes('drop policy') && 
                                prevLine.includes(`"${policyInfo.name}"`) &&
                                prevLine.includes(policyInfo.table);
          
          if (!alreadyHasDrop) {
            // Add the drop policy if exists statement on the same line as create policy
            const dropStatement = `drop policy if exists "${policyInfo.name}" on ${policyInfo.table};`;
            // Combine drop and create on the same line (with exactly 2 spaces)
            // Trim the leading spaces from the create policy line
            processedLines.push(dropStatement + '  ' + lines[i].trim());
            // Add the rest of the create policy statement (starting from line 2)
            for (let k = i + 1; k < j; k++) {
              processedLines.push(lines[k]);
            }
            changeCount++;
            i = j;
            continue;  // Skip the normal processing since we already handled it
          }
        }
        
        // Add the create policy statement (if no drop was added)
        processedLines.push(createStatement);
        i = j;
      } else {
        processedLines.push(line);
        i++;
      }
    }

    const fixedContent = processedLines.join('\n');
    
    return {
      original,
      fixed: fixedContent,
      changeCount
    };
  }

  public async execute(options: any = {}): Promise<void> {
    try {
      const spinner = UIHelper.createSpinner('Finding Supabase migration files...');
      spinner.start();

      const migrationFiles = this.findMigrationFiles(options);
      
      if (migrationFiles.length === 0) {
        spinner.fail('No migration files found');
        return;
      }

      spinner.succeed(`Found ${migrationFiles.length} migration file(s)`);

      let totalChanges = 0;
      const results: Array<{ file: string; changes: number; backed: boolean }> = [];

      for (const file of migrationFiles) {
        const fileName = path.basename(file);
        const fileSpinner = UIHelper.createSpinner(`Processing ${fileName}...`);
        fileSpinner.start();

        try {
          const { original, fixed, changeCount } = this.fixMigrationFile(file);

          if (changeCount > 0) {
            // Create backup
            const backupPath = file + '.backup';
            fs.writeFileSync(backupPath, original);

            // Write fixed content
            fs.writeFileSync(file, fixed);

            fileSpinner.succeed(`Fixed ${fileName} (${changeCount} changes, backup created)`);
            results.push({ file: fileName, changes: changeCount, backed: true });
            totalChanges += changeCount;
          } else {
            fileSpinner.info(`${fileName} - No changes needed`);
            results.push({ file: fileName, changes: 0, backed: false });
          }
        } catch (error) {
          fileSpinner.fail(`Failed to process ${fileName}: ${error}`);
          results.push({ file: fileName, changes: 0, backed: false });
        }
      }

      // Display summary
      console.log('\n' + chalk.bold('Summary:'));
      console.log(chalk.dim('─'.repeat(50)));
      
      for (const result of results) {
        if (result.changes > 0) {
          console.log(
            chalk.green('✓'),
            chalk.white(result.file),
            chalk.dim('→'),
            chalk.yellow(`${result.changes} fixes applied`),
            result.backed ? chalk.dim('(backup created)') : ''
          );
        } else {
          console.log(
            chalk.blue('○'),
            chalk.white(result.file),
            chalk.dim('→'),
            chalk.dim('No changes needed')
          );
        }
      }

      console.log(chalk.dim('─'.repeat(50)));
      console.log(
        chalk.bold('Total:'),
        totalChanges > 0 
          ? chalk.green(`${totalChanges} fixes applied across ${results.filter(r => r.changes > 0).length} file(s)`)
          : chalk.dim('No changes needed')
      );

      if (totalChanges > 0) {
        console.log(
          '\n' + chalk.cyan('→'),
          'Backup files created with .backup extension'
        );
        console.log(
          chalk.cyan('→'),
          'To restore: ' + chalk.yellow('mv file.sql.backup file.sql')
        );
      }

    } catch (error: any) {
      UIHelper.showError(`Failed to fix migration files: ${error.message}`);
      process.exit(1);
    }
  }
}