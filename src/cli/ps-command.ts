import { Command } from 'commander';
import chalk from 'chalk';
import { ListCommand } from '../commands/list.js';
import { UIHelper } from '../utils/ui.js';

export function setupPsCommand(program: Command): void {
  const psCommand = program
    .command('processes')
    .alias('ps')
    .description('View and manage system processes');

  // Default ps action (list processes)
  psCommand
    .option('-a, --all', 'Show all processes')
    .option('--hooks', 'Show only hook-related processes')
    .option('-c, --cpu <number>', 'Filter by CPU usage >= value')
    .option('-m, --memory <number>', 'Filter by memory usage >= value')
    .option('-s, --sort <field>', 'Sort by field (pid|cpu|memory|time)', 'cpu')
    .option('-l, --limit <number>', 'Limit results', '50')
    .action(async (options) => {
      try {
        const list = new ListCommand();
        
        await list.execute({
          ...options,
          cpu: options.cpu ? parseFloat(options.cpu) : undefined,
          memory: options.memory ? parseFloat(options.memory) : undefined,
          limit: options.limit ? parseInt(options.limit) : undefined
        });
      } catch (error) {
        UIHelper.showError(`Processes command failed: ${error}`);
        process.exit(1);
      }
    });

  // ps clean subcommand - clean critical abnormal processes
  psCommand
    .command('clean')
    .description('Clean up critical abnormal processes (red circles)')
    .option('-y, --yes', 'Skip confirmation')
    .option('--dry-run', 'Preview what would be cleaned')
    .action(async (options) => {
      try {
        UIHelper.showHeader();
        console.log(chalk.red.bold('▪ Process Cleanup'));
        console.log('─'.repeat(30));
        
        const processMonitor = new (await import('../utils/process-monitor.js')).ProcessMonitor({
          cpuThreshold: 1.0
        });
        
        const result = await processMonitor.detectSuspiciousHooks();
        
        // Get all "red circle" processes
        const redProcesses = result.suspiciousProcesses.filter(proc => {
          const isClaudeHook = proc.command.includes('.claude/hooks/');
          const isSleepingWithCPU = proc.status === 'sleeping' && proc.cpu > 1;
          
          return (isClaudeHook && isSleepingWithCPU) || 
                 (proc.status === 'sleeping' && proc.cpu >= 5);
        });
        
        if (redProcesses.length === 0) {
          UIHelper.showSuccess('No critical processes to clean!');
          return;
        }
        
        console.log(chalk.red(`Found ${redProcesses.length} critical process(es):`));
        console.log();
        
        redProcesses.forEach(proc => {
          const shortCmd = proc.command.split('/').pop() || proc.command;
          console.log(chalk.red(`   ● PID ${proc.pid.toString().padEnd(8)} ${proc.cpu.toFixed(1).padStart(5)}% CPU   ${shortCmd}`));
        });
        
        if (options.dryRun) {
          console.log();
          console.log(chalk.cyan('Dry run - no processes terminated'));
          return;
        }
        
        if (!options.yes) {
          console.log();
          console.log(chalk.yellow('This will terminate all processes above.'));
          
          const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          const answer = await new Promise<string>(resolve => {
            readline.question(chalk.bold('Proceed? (y/N): '), resolve);
          });
          readline.close();
          
          if (answer.toLowerCase() !== 'y') {
            console.log(chalk.gray('Cancelled.'));
            return;
          }
        }
        
        console.log();
        let cleaned = 0;
        for (const proc of redProcesses) {
          const success = await processMonitor.killProcess(proc.pid);
          if (success) {
            console.log(chalk.green(`   ✓ Terminated PID ${proc.pid}`));
            cleaned++;
          } else {
            console.log(chalk.red(`   ✗ Failed PID ${proc.pid}`));
          }
        }
        
        console.log();
        if (cleaned === redProcesses.length) {
          UIHelper.showSuccess(`Cleaned ${cleaned} process(es)!`);
          console.log(chalk.green('\n Your processes are clean and vibe-ready!'));
        } else {
          UIHelper.showWarning(`Cleaned ${cleaned}/${redProcesses.length} processes`);
          console.log(chalk.yellow('Some processes may need elevated permissions.'));
        }
        
      } catch (error) {
        UIHelper.showError(`Clean failed: ${error}`);
        process.exit(1);
      }
    });
}