import { Command } from 'commander';
import { ProcessMonitor } from '../../utils/process-monitor.js';
import { UIHelper } from '../../utils/ui.js';
import { ProcessIdentifier } from '../../utils/process-identifier.js';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ProcessInfo } from '../../types/index.js';
import {
  getCommandWidth,
  truncateCommand,
  colorizePercentPadded,
  colorizePort,
  sortProcesses,
  batchIdentifyProcesses,
  resolveDisplayName,
  isUserCancellation,
  PROCESS_DISPLAY_LIMIT,
} from '../../utils/process-helpers.js';

const execAsync = promisify(exec);

export function setupKillCommand(processCommand: Command): void {
  processCommand
    .command('kill')
    .description('Interactive process termination')
    .option('-p, --port <port>', 'Kill processes on specific port')
    .option('--hooks', 'Kill only hook processes')
    .option('--cpu <threshold>', 'Filter by CPU usage threshold', '0.1')
    .option('--sort <field>', 'Sort by field (cpu|mem|pid)', 'cpu')
    .action(async (options) => {
      try {
        const processMonitor = new ProcessMonitor();

        if (options.port) {
          await killByPort(options.port, processMonitor);
          return;
        }

        const processes = await processMonitor.getAllProcesses();

        let targetProcesses = processes;
        if (options.hooks) {
          targetProcesses = processes.filter(p => p.isHook);
          if (targetProcesses.length === 0) {
            console.log(chalk.gray('No hook processes found'));
            return;
          }
        } else {
          const cpuThreshold = parseFloat(options.cpu);
          targetProcesses = processes.filter(p => p.cpu >= cpuThreshold);
        }

        sortProcesses(targetProcesses, options.sort, false);

        if (targetProcesses.length === 0) {
          console.log(chalk.gray('No processes match the criteria'));
          return;
        }

        const { stdout: portCheck } = await execAsync(
          'lsof -i -n -P | grep LISTEN',
          { timeout: 5000 },
        ).catch(() => ({ stdout: '' }));
        const hasListeningPorts = portCheck.trim().length > 0;

        if (hasListeningPorts && !options.hooks) {
          const shouldOfferPortMode = await offerPortMode(processes, portCheck, processMonitor);
          if (shouldOfferPortMode) return;
        }

        await selectAndKillProcesses(targetProcesses, processMonitor);

      } catch (error: unknown) {
        if (isUserCancellation(error)) {
          console.log(chalk.gray('\nOperation cancelled'));
          return;
        }
        UIHelper.showError(`Kill command failed: ${error}`);
        process.exit(1);
      }
    });
}

async function killByPort(port: string, processMonitor: ProcessMonitor): Promise<void> {
  try {
    const lsofCmd = `lsof -i :${port} -t`;
    const { stdout } = await execAsync(lsofCmd, { timeout: 5000 }).catch(() => ({ stdout: '' }));

    if (!stdout) {
      console.log(chalk.gray(`No processes found on port ${port}`));
      return;
    }

    const pids = stdout.split('\n').filter(pid => pid.trim()).map(pid => parseInt(pid));
    const uniquePids = [...new Set(pids)];

    const processes = await processMonitor.getAllProcesses();
    const portProcesses = processes.filter(p => uniquePids.includes(p.pid));

    if (portProcesses.length === 0) {
      console.log(chalk.gray(`No processes found on port ${port}`));
      return;
    }

    console.log(chalk.cyan(`Processes on port ${port}:\n`));
    const identifiedMap = await batchIdentifyProcesses(portProcesses);
    portProcesses.forEach(proc => {
      const displayName = resolveDisplayName(proc.pid, identifiedMap, proc.command);
      console.log(`  PID ${chalk.cyan(proc.pid.toString().padStart(7))} - ${displayName}`);
    });

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Terminate ${portProcesses.length} process(es) on port ${port}?`,
      default: true
    }]);

    if (confirm) {
      await killProcesses(portProcesses.map(p => p.pid), processMonitor);
    } else {
      console.log(chalk.gray('Operation cancelled'));
    }
  } catch (error: unknown) {
    if (isUserCancellation(error)) {
      console.log(chalk.gray('\nOperation cancelled'));
      return;
    }
    throw error;
  }
}

async function offerPortMode(processes: ProcessInfo[], portCheck: string, processMonitor: ProcessMonitor): Promise<boolean> {
  try {
    const { mode } = await inquirer.prompt([{
      type: 'list',
      name: 'mode',
      message: 'Select termination mode:',
      choices: [
        { name: 'Select processes by PID', value: 'pid' },
        { name: 'Select processes by Port', value: 'port' }
      ]
    }]);

    if (mode === 'port') {
      const lines = portCheck.split('\n').filter(line => line.trim());
      const portMap = new Map<string, Set<number>>();

      lines.forEach(line => {
        const parts = line.split(/\s+/);
        if (parts.length < 9) return;

        const [, pid, , , , , , , name] = parts;
        const portMatch = name?.match(/:(\d+)/);
        if (!portMatch) return;

        const port = portMatch[1];
        if (!portMap.has(port)) {
          portMap.set(port, new Set());
        }
        portMap.get(port)?.add(parseInt(pid));
      });

      const sortedPorts = Array.from(portMap.entries()).sort((a, b) =>
        parseInt(a[0]) - parseInt(b[0])
      );

      const portChoices = await Promise.all(sortedPorts.map(async ([port, pids]) => {
        const portProcesses = processes.filter(p => pids.has(p.pid));
        const mainProcess = portProcesses.sort((a, b) => b.cpu - a.cpu)[0];
        if (!mainProcess) return null;

        const identified = await ProcessIdentifier.identify({
          pid: mainProcess.pid,
          command: mainProcess.command,
          port: parseInt(port)
        });
        const smartName = identified.displayName;

        const totalCpu = portProcesses.reduce((sum, p) => sum + p.cpu, 0);
        const totalMem = portProcesses.reduce((sum, p) => sum + p.memory, 0);

        const portDisplay = colorizePort(port.padStart(5));

        const cpuStr = colorizePercentPadded(totalCpu);
        const memStr = colorizePercentPadded(totalMem);

        const pidList = Array.from(pids).sort((a, b) => a - b);
        const pidStr = pidList.length <= 3
          ? chalk.gray(`PID:[${pidList.join(',')}]`)
          : chalk.gray(`PID:[${pidList.slice(0, 2).join(',')},..+${pidList.length - 2}]`);

        return {
          name: `Port ${portDisplay} CPU ${cpuStr} MEM ${memStr} ${chalk.gray('│')} ${smartName} ${pidStr}`,
          value: port,
          short: `Port ${port} PIDs:${pidList.join(',')} - ${smartName}`
        };
      })).then(choices => choices.filter(Boolean));

      const { selectedPorts } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selectedPorts',
        message: 'Select ports to terminate processes on:',
        choices: portChoices.filter(choice => choice !== null) as Array<{ name: string; value: string; short: string }>,
        loop: false
      }]);

      if (selectedPorts && selectedPorts.length > 0) {
        const allPids = new Set<number>();
        selectedPorts.forEach((port: string) => {
          const pids = portMap.get(port);
          if (pids) {
            pids.forEach(pid => allPids.add(pid));
          }
        });

        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: `Terminate ${allPids.size} process(es) on ${selectedPorts.length} port(s)?`,
          default: true
        }]);

        if (confirm) {
          await killProcesses(Array.from(allPids), processMonitor);
        } else {
          console.log(chalk.gray('Operation cancelled'));
        }

        return true;
      } else {
        console.log(chalk.gray('No ports selected'));
        return true;
      }
    }

    return false; // Continue with PID mode
  } catch (error: unknown) {
    if (isUserCancellation(error)) {
      console.log(chalk.gray('\nOperation cancelled'));
      return true;
    }
    throw error;
  }
}

async function selectAndKillProcesses(targetProcesses: ProcessInfo[], processMonitor: ProcessMonitor): Promise<void> {
  const { commandWidth } = getCommandWidth();

  const identifiedMap = await batchIdentifyProcesses(targetProcesses);
  const displayed = targetProcesses.slice(0, PROCESS_DISPLAY_LIMIT);

  const processOptions = displayed.map((proc) => {
    const smartName = resolveDisplayName(proc.pid, identifiedMap, proc.command);
    const shortCmd = truncateCommand(smartName, commandWidth);

    const pidStr = proc.pid.toString().padStart(7);
    const cpuStr = colorizePercentPadded(proc.cpu);
    const memStr = colorizePercentPadded(proc.memory);

    return {
      name: `PID ${chalk.cyan(pidStr)} CPU ${cpuStr} MEM ${memStr} ${chalk.gray('│')} ${shortCmd}`,
      value: proc.pid,
      short: `PID ${proc.pid} - ${shortCmd}`,
      checked: false
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
        default: true
      }]);

      if (confirm) {
        await killProcesses(selectedPids, processMonitor);
      } else {
        console.log(chalk.gray('Operation cancelled'));
      }
    } else {
      console.log(chalk.gray('No processes selected'));
    }
  } catch (error: unknown) {
    if (isUserCancellation(error)) {
      console.log(chalk.gray('\nOperation cancelled'));
    } else {
      throw error;
    }
  }
}

async function killProcesses(pids: number[], processMonitor: ProcessMonitor): Promise<void> {
  let killed = 0;
  let permissionDenied = 0;

  const processes = await processMonitor.getAllProcesses();
  const processMap = new Map(processes.map(p => [p.pid, p]));

  const processesToIdentify = pids.map(pid => {
    const proc = processMap.get(pid);
    return proc ? { pid, command: proc.command } : { pid, command: 'Unknown' };
  });
  const identifiedMap = await ProcessIdentifier.identifyBatch(processesToIdentify);

  for (const pid of pids) {
    const identity = identifiedMap.get(pid);
    const processName = identity ? identity.displayName : 'Unknown';

    try {
      const success = await processMonitor.killProcess(pid);
      if (success) {
        console.log(chalk.green(`✓ Terminated PID ${pid} - ${processName}`));
        killed++;
      } else {
        try {
          await execAsync(`kill -0 ${pid}`, { timeout: 5000 });
          console.log(chalk.red(`✗ Failed to terminate PID ${pid} - ${processName} - Operation not permitted`));
          permissionDenied++;
        } catch {
          console.log(chalk.gray(`○ PID ${pid} - ${processName} no longer exists`));
        }
      }
    } catch {
      console.log(chalk.red(`✗ Failed to terminate PID ${pid} - ${processName}`));
    }
  }

  const messages = [];
  if (killed > 0) {
    messages.push(chalk.green(`✓ Successfully terminated ${killed} process(es)`));
  }
  if (permissionDenied > 0) {
    messages.push(chalk.yellow(`⚠ Permission denied for ${permissionDenied} process(es) (try with sudo)`));
  }

  if (messages.length > 0) {
    console.log('\n' + messages.join('\n'));
  }
}
