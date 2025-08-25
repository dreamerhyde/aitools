import { Command } from 'commander';
import { SupabaseFixCommand } from '../commands/supabase-fix-command.js';

export function setupSupabaseCommand(program: Command): void {
  const supabaseCmd = program
    .command('supabase')
    .alias('sb')
    .description('Supabase-related utilities and fixes');

  // Add fix subcommand
  supabaseCmd
    .command('fix [files...]')
    .description('Fix common issues in Supabase migration files')
    .option('-d, --directory <path>', 'Path to supabase directory (default: ./supabase)')
    .action(async (files, options) => {
      const command = new SupabaseFixCommand();
      await command.execute({ ...options, files });
    });
}