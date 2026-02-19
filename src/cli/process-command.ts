import { Command } from 'commander';
import { ProcessMonitor } from '../utils/process-monitor.js';
import { UIHelper } from '../utils/ui.js';
import { ProcessIdentifier } from '../utils/process-identifier.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import { setupPortCommand } from './process/port-command.js';
import { setupKillCommand } from './process/kill-command.js';
import { setupHooksCommand } from './process/hooks-command.js';
import {
  isDevelopmentTool,
  getCommandWidth,
  truncateCommand,
  colorizePercent,
  getStatusIndicator,
  displayStatusLegend,
  sortProcesses,
  batchIdentifyProcesses,
  resolveDisplayName,
  PROCESS_DISPLAY_LIMIT,
} from '../utils/process-helpers.js';
import type { ProcessInfo } from '../types/index.js';

export function setupProcessCommand(program: Command): void {
  const processCommand = program
    .command('process')
    .alias('ps')
    .description('System process management and monitoring');

  processCommand
    .option('-a, --all', 'Show all processes')
    .option('--cpu <threshold>', 'Filter by CPU usage threshold', '0.1')
    .option('--sort <field>', 'Sort by field (cpu|mem|pid)', 'cpu')
    .option('--show-cache-stats', 'Show process name cache statistics')
    .action(async (options) => {
      try {
        const processMonitor = new ProcessMonitor();
        const processes = await processMonitor.getAllProcesses();

        let filtered = processes;
        if (!options.all) {
          const cpuThreshold = parseFloat(options.cpu);
          filtered = processes.filter(p => p.cpu >= cpuThreshold || isDevelopmentTool(p.command));
        }

        sortProcesses(filtered, options.sort);

        if (filtered.length === 0) {
          console.log(chalk.gray('No processes match the criteria'));
          return;
        }

        await displayProcessTable(filtered);

        if (options.showCacheStats) {
          displayCacheStats();
        }

        displayStatusLegend();

      } catch (error) {
        UIHelper.showError(`Process command failed: ${error}`);
        process.exit(1);
      }
    });

  setupKillCommand(processCommand);
  setupPortCommand(processCommand);
  setupHooksCommand(processCommand);
}

async function displayProcessTable(processes: ProcessInfo[]): Promise<void> {
  const { commandWidth } = getCommandWidth();

  const table = new Table({
    head: ['PID', 'CPU%', 'MEM%', 'Status', 'Process'],
    style: {
      head: ['cyan'],
      border: ['gray']
    },
    colAligns: ['right', 'right', 'right', 'center', 'left']
  });

  const identifiedMap = await batchIdentifyProcesses(processes);
  const displayed = processes.slice(0, PROCESS_DISPLAY_LIMIT);

  displayed.forEach(proc => {
    const smartName = resolveDisplayName(proc.pid, identifiedMap, proc.command);
    const shortCmd = truncateCommand(smartName, commandWidth);

    table.push([
      proc.pid.toString(),
      colorizePercent(proc.cpu),
      colorizePercent(proc.memory),
      getStatusIndicator(proc.status),
      shortCmd
    ]);
  });

  console.log(table.toString());
  console.log(chalk.gray(`\nShowing ${displayed.length} of ${processes.length} processes`));
}

function displayCacheStats(): void {
  const stats = ProcessIdentifier.getCacheStats();
  console.log(chalk.cyan('\nCache Statistics:'));
  console.log(chalk.gray('Identification Cache:'));
  console.log(chalk.gray(`  L1 Cache Size: ${stats.l1Size} entries`));
  console.log(chalk.gray(`  L2 Cache Size: ${stats.l2Size} active`));
  console.log(chalk.gray(`  CWD Cache: ${stats.cwdSize} entries`));
  console.log(chalk.gray(`  Docker Cache: ${stats.dockerSize} entries`));
}
