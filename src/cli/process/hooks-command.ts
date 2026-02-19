import { Command } from 'commander';
import { ProcessMonitor } from '../../utils/process-monitor.js';
import { UIHelper } from '../../utils/ui.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import {
  getCommandWidth,
  truncateCommand,
  colorizePercent,
  getStatusIndicator,
  displayStatusLegend,
  batchIdentifyProcesses,
  resolveDisplayName,
} from '../../utils/process-helpers.js';

export function setupHooksCommand(processCommand: Command): void {
  processCommand
    .command('hooks')
    .description('Show hook-related processes')
    .action(async () => {
      try {
        const processMonitor = new ProcessMonitor();
        const processes = await processMonitor.getAllProcesses();

        const hookProcesses = processes.filter(p => p.isHook);

        if (hookProcesses.length === 0) {
          UIHelper.showSuccess('No hook processes running');
          return;
        }

        const { commandWidth } = getCommandWidth();

        const table = new Table({
          head: ['PID', 'CPU%', 'MEM%', 'Status', 'Process'],
          style: {
            head: ['cyan'],
            border: ['gray']
          },
          colAligns: ['right', 'right', 'right', 'center', 'left']
        });

        hookProcesses.sort((a, b) => b.cpu - a.cpu);

        const identifiedMap = await batchIdentifyProcesses(hookProcesses);

        hookProcesses.forEach(proc => {
          const smartName = resolveDisplayName(proc.pid, identifiedMap, proc.command);
          const shortCmd = truncateCommand(smartName, commandWidth);

          const isClaudeHook = proc.command.includes('.claude/hooks/');
          const isSleepingWithCPU = proc.status === 'sleeping' && proc.cpu > 1;
          const isAbnormal = isClaudeHook && isSleepingWithCPU;

          table.push([
            proc.pid.toString(),
            colorizePercent(proc.cpu),
            colorizePercent(proc.memory),
            getStatusIndicator(proc.status, isAbnormal),
            shortCmd
          ]);
        });

        console.log(table.toString());
        console.log(chalk.gray(`\nShowing ${hookProcesses.length} hook process(es)`));

        displayStatusLegend();

      } catch (error) {
        UIHelper.showError(`Failed to list hook processes: ${error}`);
        process.exit(1);
      }
    });
}
