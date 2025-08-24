import { Command } from 'commander';
import { ProcessMonitor } from '../utils/process-monitor.js';
import { UIHelper } from '../utils/ui.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import inquirer from 'inquirer';

export function setupProcessCommand(program: Command): void {
  const processCommand = program
    .command('process')
    .alias('ps')
    .description('System process management and monitoring');

  // Default process list
  processCommand
    .option('-a, --all', 'Show all processes')
    .option('--cpu <threshold>', 'Filter by CPU usage threshold', '0.1')
    .option('--sort <field>', 'Sort by field (cpu|mem|pid)', 'cpu')
    .action(async (options) => {
      try {
        const processMonitor = new ProcessMonitor();
        const processes = await processMonitor.getAllProcesses();
        
        // Filter processes
        let filtered = processes;
        if (!options.all) {
          const cpuThreshold = parseFloat(options.cpu);
          filtered = processes.filter(p => p.cpu >= cpuThreshold);
        }
        
        // Sort processes
        filtered.sort((a, b) => {
          switch (options.sort) {
            case 'mem':
              return b.memory - a.memory;
            case 'pid':
              return a.pid - b.pid;
            default:
              return b.cpu - a.cpu;
          }
        });
        
        if (filtered.length === 0) {
          console.log(chalk.gray('No processes match the criteria'));
          return;
        }
        
        // Get terminal width
        const termWidth = process.stdout.columns || 120;
        const commandWidth = Math.max(50, termWidth - 40); // Adjust command column based on terminal width
        
        // Display compact table without fixed widths
        const table = new Table({
          head: ['PID', 'CPU%', 'MEM%', 'Status', 'Command'],
          style: {
            head: ['cyan'],
            border: ['gray']
          },
          colAligns: ['right', 'right', 'right', 'center', 'left']
        });
        
        filtered.slice(0, 30).forEach(proc => {
          const shortCmd = proc.command.length > commandWidth ? 
            proc.command.substring(0, commandWidth - 3) + '...' : 
            proc.command;
          
          // Color code based on CPU usage
          const cpuVal = proc.cpu.toFixed(1);
          const memVal = proc.memory.toFixed(1);
          const cpuDisplay = proc.cpu > 20 ? chalk.red(cpuVal) : 
                             proc.cpu > 10 ? chalk.yellow(cpuVal) : cpuVal;
          const memDisplay = proc.memory > 20 ? chalk.red(memVal) : 
                             proc.memory > 10 ? chalk.yellow(memVal) : memVal;
          
          // Status indicator with colored dots
          let statusIndicator = '';
          switch (proc.status.toLowerCase()) {
            case 'running':
              statusIndicator = chalk.green('●'); // Solid circle for running
              break;
            case 'sleeping':
            case 'idle':
              statusIndicator = chalk.gray('○'); // Empty circle for idle/sleeping
              break;
            case 'stopped':
              statusIndicator = chalk.yellow('●'); // Yellow for stopped
              break;
            case 'zombie':
              statusIndicator = chalk.red('●'); // Red for zombie
              break;
            default:
              statusIndicator = chalk.gray('○'); // Default to empty circle
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
        console.log(chalk.gray(`\nShowing ${Math.min(30, filtered.length)} of ${filtered.length} processes`));
        
        // Status legend
        console.log(chalk.gray('\nStatus: ') + 
          chalk.green('●') + ' Running  ' +
          chalk.gray('○') + ' Idle/Sleeping  ' +
          chalk.yellow('●') + ' Stopped  ' +
          chalk.red('●') + ' Zombie');
        
      } catch (error) {
        UIHelper.showError(`Process command failed: ${error}`);
        process.exit(1);
      }
    });

  // process kill subcommand - Interactive kill
  processCommand
    .command('kill')
    .description('Interactive process termination')
    .option('--hooks', 'Kill only hook processes')
    .option('--cpu <threshold>', 'Filter by CPU usage threshold', '0.1')
    .option('--sort <field>', 'Sort by field (cpu|mem|pid)', 'cpu')
    .action(async (options) => {
      try {
        const processMonitor = new ProcessMonitor();
        const processes = await processMonitor.getAllProcesses();
        
        let targetProcesses = processes;
        if (options.hooks) {
          targetProcesses = processes.filter(p => p.isHook);
          if (targetProcesses.length === 0) {
            console.log(chalk.gray('No hook processes found'));
            return;
          }
        } else {
          // Apply CPU threshold filter like in ps command
          const cpuThreshold = parseFloat(options.cpu);
          targetProcesses = processes.filter(p => p.cpu >= cpuThreshold);
        }
        
        // Sort processes (same as ps command)
        targetProcesses.sort((a, b) => {
          switch (options.sort) {
            case 'mem':
              return b.memory - a.memory;
            case 'pid':
              return a.pid - b.pid;
            default:
              return b.cpu - a.cpu;
          }
        });
        
        if (targetProcesses.length === 0) {
          console.log(chalk.gray('No processes match the criteria'));
          return;
        }
        
        const termWidth = process.stdout.columns || 120;
        const commandWidth = Math.max(50, termWidth - 40);
        
        const processOptions = targetProcesses.slice(0, 30).map((proc, index) => {
          const shortCmd = proc.command.length > commandWidth ? 
            proc.command.substring(0, commandWidth - 3) + '...' : 
            proc.command;
          
          // Format with fixed widths for consistency
          const pidStr = proc.pid.toString().padStart(7);  // Right align PID
          const cpuVal = proc.cpu.toFixed(1).padStart(5);  // Right align CPU value
          const memVal = proc.memory.toFixed(1).padStart(5);  // Right align MEM value
          
          // Color code based on CPU usage (same as ps)
          const cpuStr = proc.cpu > 20 ? chalk.red(cpuVal + '%') : 
                         proc.cpu > 10 ? chalk.yellow(cpuVal + '%') : 
                         chalk.white(cpuVal + '%');
          const memStr = proc.memory > 20 ? chalk.red(memVal + '%') : 
                         proc.memory > 10 ? chalk.yellow(memVal + '%') : 
                         chalk.white(memVal + '%');
          
          return {
            name: `PID ${chalk.cyan(pidStr)} CPU ${cpuStr} MEM ${memStr} ${chalk.gray('│')} ${shortCmd}`,
            value: proc.pid,
            short: `PID ${proc.pid}`,
            checked: proc.cpu > 20 // Pre-select very high CPU processes
          };
        });
        
        try {
          const { selectedPids } = await inquirer.prompt([{
            type: 'checkbox',
            name: 'selectedPids',
            message: 'Select processes to terminate (space to select, enter to confirm, CTRL+C to cancel):',
            choices: processOptions,
            loop: false
          }]);
          
          if (selectedPids && selectedPids.length > 0) {
            const { confirm } = await inquirer.prompt([{
              type: 'confirm',
              name: 'confirm',
              message: `Terminate ${selectedPids.length} process(es)?`,
              default: false
            }]);
            
            if (confirm) {
              let killed = 0;
              for (const pid of selectedPids) {
                const success = await processMonitor.killProcess(pid);
                if (success) {
                  console.log(chalk.green(`✓ Terminated PID ${pid}`));
                  killed++;
                } else {
                  console.log(chalk.red(`✗ Failed to terminate PID ${pid}`));
                }
              }
              
              if (killed > 0) {
                UIHelper.showSuccess(`Successfully terminated ${killed} process(es)`);
              }
            } else {
              console.log(chalk.gray('Operation cancelled'));
            }
          } else {
            console.log(chalk.gray('No processes selected'));
          }
        } catch (error: any) {
          // User cancelled with Ctrl+C
          if (error.name === 'ExitPromptError' || !error.name) {
            console.log(chalk.gray('\nOperation cancelled'));
          } else {
            throw error;
          }
        }
      } catch (error) {
        UIHelper.showError(`Kill command failed: ${error}`);
        process.exit(1);
      }
    });
  
  // process hooks subcommand - Show hook-related processes
  processCommand
    .command('hooks')
    .description('Show hook-related processes')
    .option('--all', 'Show all hook processes including normal ones')
    .action(async (options) => {
      try {
        const processMonitor = new ProcessMonitor();
        const processes = await processMonitor.getAllProcesses();
        
        // Filter hook processes
        const hookProcesses = processes.filter(p => p.isHook);
        
        if (hookProcesses.length === 0) {
          UIHelper.showSuccess('No hook processes running');
          return;
        }
        
        // Display hooks in a single table with consistent styling
        const termWidth = process.stdout.columns || 120;
        const commandWidth = Math.max(50, termWidth - 40);
        
        const table = new Table({
          head: ['PID', 'CPU%', 'MEM%', 'Status', 'Command'],
          style: {
            head: ['cyan'],
            border: ['gray']
          },
          colAligns: ['right', 'right', 'right', 'center', 'left']
        });
        
        // Sort by CPU usage like ps command
        hookProcesses.sort((a, b) => b.cpu - a.cpu);
        
        hookProcesses.forEach(proc => {
          const shortCmd = proc.command.length > commandWidth ? 
            proc.command.substring(0, commandWidth - 3) + '...' : 
            proc.command;
          
          // Color code based on CPU usage (same as ps)
          const cpuVal = proc.cpu.toFixed(1);
          const memVal = proc.memory.toFixed(1);
          const cpuDisplay = proc.cpu > 20 ? chalk.red(cpuVal) : 
                             proc.cpu > 10 ? chalk.yellow(cpuVal) : cpuVal;
          const memDisplay = proc.memory > 20 ? chalk.red(memVal) : 
                             proc.memory > 10 ? chalk.yellow(memVal) : memVal;
          
          // Status indicator with colored dots (same as ps)
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