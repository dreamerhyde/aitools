import { Command } from 'commander';
import { ProcessMonitor } from '../../utils/process-monitor.js';
import { UIHelper } from '../../utils/ui.js';
import { extractSmartProcessName } from '../../commands/monitor/utils/sanitizers.js';
import chalk from 'chalk';
import Table from 'cli-table3';

export function setupHooksCommand(processCommand: Command): void {
  processCommand
    .command('hooks')
    .description('Show hook-related processes')
    .option('--all', 'Show all hook processes including normal ones')
    .action(async () => {
      try {
        const processMonitor = new ProcessMonitor();
        const processes = await processMonitor.getAllProcesses();
        
        // Filter hook processes
        const hookProcesses = processes.filter(p => p.isHook);
        
        if (hookProcesses.length === 0) {
          UIHelper.showSuccess('No hook processes running');
          return;
        }
        
        // Display hooks in a single table
        const termWidth = process.stdout.columns || 120;
        const commandWidth = Math.max(50, termWidth - 40);
        
        const table = new Table({
          head: ['PID', 'CPU%', 'MEM%', 'Status', 'Process'],
          style: {
            head: ['cyan'],
            border: ['gray']
          },
          colAligns: ['right', 'right', 'right', 'center', 'left']
        });
        
        // Sort by CPU usage
        hookProcesses.sort((a, b) => b.cpu - a.cpu);
        
        hookProcesses.forEach(proc => {
          // Use smart process name extraction
          const smartName = extractSmartProcessName(proc.command);
          const shortCmd = smartName.length > commandWidth ? 
            smartName.substring(0, commandWidth - 3) + '...' : 
            smartName;
          
          // Color code based on CPU usage
          const cpuVal = proc.cpu.toFixed(1);
          const memVal = proc.memory.toFixed(1);
          const cpuDisplay = proc.cpu > 20 ? chalk.red(cpuVal) : 
                             proc.cpu > 10 ? chalk.yellow(cpuVal) : cpuVal;
          const memDisplay = proc.memory > 20 ? chalk.red(memVal) : 
                             proc.memory > 10 ? chalk.yellow(memVal) : memVal;
          
          // Status indicator with colored dots
          let statusIndicator = '';
          // Check if abnormal hook
          const isClaudeHook = proc.command.includes('.claude/hooks/');
          const isSleepingWithCPU = proc.status === 'sleeping' && proc.cpu > 1;
          const isAbnormal = isClaudeHook && isSleepingWithCPU;
          
          switch (proc.status.toLowerCase()) {
            case 'running':
              statusIndicator = isAbnormal ? chalk.red('●') : chalk.green('●');
              break;
            case 'sleeping':
            case 'idle':
              statusIndicator = isAbnormal ? chalk.yellow('●') : chalk.gray('○');
              break;
            case 'stopped':
              statusIndicator = chalk.yellow('●');
              break;
            case 'zombie':
              statusIndicator = chalk.red('●');
              break;
            default:
              statusIndicator = chalk.gray('○');
          }
          
          table.push([
            proc.pid.toString(),
            cpuDisplay,
            memDisplay,
            statusIndicator,
            shortCmd
          ]);
        });
        
        console.log(table.toString());
        console.log(chalk.gray(`\nShowing ${hookProcesses.length} hook process(es)`));
        
        // Status legend
        console.log(chalk.gray('\nStatus: ') + 
          chalk.green('●') + ' Running  ' +
          chalk.gray('○') + ' Idle/Sleeping  ' +
          chalk.yellow('●') + ' Stopped  ' +
          chalk.red('●') + ' Zombie');
        
      } catch (error) {
        UIHelper.showError(`Failed to list hook processes: ${error}`);
        process.exit(1);
      }
    });
}