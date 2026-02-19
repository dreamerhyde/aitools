import { Command } from 'commander';
import { ProcessMonitor } from '../../utils/process-monitor.js';
import { UIHelper } from '../../utils/ui.js';
import { identifyProcess, type IdentifiedProcess } from '../../utils/process-identifier.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import { exec } from 'child_process';
import { promisify } from 'util';
import { colorizePort } from '../../utils/process-helpers.js';

const execAsync = promisify(exec);

interface PortProcessEntry {
  command: string;
  pid: number;
  user: string;
  type: string;
  name: string;
  state: string;
  category: string;
}

interface RawProcess {
  pid: number;
  command: string;
  port: string;
  user: string;
  type: string;
  name: string;
  state: string;
}

interface PortCommandOptions {
  tcp?: boolean;
  udp?: boolean;
  all?: boolean;
  detail?: boolean;
}

export function setupPortCommand(processCommand: Command): void {
  processCommand
    .command('port')
    .alias('ports')
    .description('Show processes listening on network ports')
    .option('--tcp', 'Show only TCP ports')
    .option('--udp', 'Show only UDP ports')
    .option('--all', 'Show all connections including ESTABLISHED')
    .option('--detail', 'Show detailed connection info')
    .action(async (options: PortCommandOptions) => {
      try {
        const showAll = options.all;

        let lsofCmd = 'lsof -i -n -P';
        if (options.tcp) lsofCmd += ' -iTCP';
        if (options.udp) lsofCmd += ' -iUDP';
        if (!showAll) lsofCmd += ' | grep LISTEN';

        const { stdout } = await execAsync(lsofCmd, { timeout: 5000 }).catch(() => ({ stdout: '' }));

        if (!stdout) {
          console.log(chalk.gray('No processes listening on ports'));
          return;
        }

        const lines = stdout.split('\n').filter(line => line.trim());
        const ports = new Map<string, PortProcessEntry[]>();

        const rawProcesses: RawProcess[] = [];

        for (const line of lines.slice(1)) {
          const parts = line.split(/\s+/);
          if (parts.length < 9) continue;

          const [command, pid, user, , type, , , , name] = parts;

          const portMatch = name?.match(/:(\d+)(\s+\((.+)\))?$/);
          if (!portMatch) continue;

          rawProcesses.push({
            pid: parseInt(pid),
            command,
            port: portMatch[1],
            user,
            type,
            name: name.replace(/\s+\(.+\)$/, ''),
            state: portMatch[3] || 'LISTEN',
          });
        }

        const processMonitor = new ProcessMonitor();
        const allProcesses = await processMonitor.getAllProcesses();
        const processMap = new Map(allProcesses.map(p => [p.pid, p]));

        // Identify per pid:port (Docker Desktop reuses PID across ports)
        const identifiedMap = new Map<string, IdentifiedProcess>();

        for (const proc of rawProcesses) {
          const portNum = parseInt(proc.port);
          const key = `${proc.pid}:${portNum}`;

          if (!identifiedMap.has(key)) {
            const fullProcess = processMap.get(proc.pid);
            const identified = await identifyProcess({
              pid: proc.pid,
              command: fullProcess ? fullProcess.command : proc.command,
              port: portNum,
            });
            identifiedMap.set(key, identified);
          }

          const identifiedInfo = identifiedMap.get(key);
          const displayName = identifiedInfo ? identifiedInfo.displayName : proc.command.substring(0, 50);

          if (!ports.has(proc.port)) {
            ports.set(proc.port, []);
          }

          ports.get(proc.port)!.push({
            command: displayName,
            pid: proc.pid,
            user: proc.user,
            type: proc.type,
            name: proc.name,
            state: proc.state,
            category: identifiedInfo?.category || 'unknown',
          });
        }

        if (ports.size === 0) {
          console.log(chalk.gray('No processes listening on ports'));
          return;
        }

        const sortedPorts = Array.from(ports.entries()).sort((a, b) =>
          parseInt(a[0]) - parseInt(b[0])
        );

        displayPortsTable(sortedPorts, options, !!showAll);

      } catch (error) {
        UIHelper.showError(`Port command failed: ${error}`);
        process.exit(1);
      }
    });
}

function displayPortsTable(sortedPorts: [string, PortProcessEntry[]][], options: PortCommandOptions, showAll: boolean): void {
  if (!options.detail && showAll) {
    const table = new Table({
      head: ['Port', 'Process', 'PID', 'Connections', 'Status'],
      style: {
        head: ['cyan'],
        border: ['gray']
      },
      colAligns: ['right', 'left', 'right', 'right', 'left']
    });

    sortedPorts.forEach(([port, processes]) => {
      const processByName = new Map<string, { pids: Set<number>; states: Map<string, number> }>();

      processes.forEach(proc => {
        if (!processByName.has(proc.command)) {
          processByName.set(proc.command, { pids: new Set(), states: new Map() });
        }
        const group = processByName.get(proc.command)!;
        group.pids.add(proc.pid);
        group.states.set(proc.state, (group.states.get(proc.state) || 0) + 1);
      });

      processByName.forEach((group, procName) => {
        const portDisplay = colorizePort(port);

        const totalConns = Array.from(group.states.values()).reduce((a, b) => a + b, 0);

        const stateStrs: string[] = [];
        group.states.forEach((count, state) => {
          if (state === 'LISTEN') {
            stateStrs.push(chalk.green('●') + ` LISTEN`);
          } else if (state === 'ESTABLISHED') {
            stateStrs.push(chalk.blue(`${count} ESTAB`));
          } else if (state === 'CLOSE_WAIT') {
            stateStrs.push(chalk.yellow(`${count} CLOSE`));
          } else {
            stateStrs.push(`${count} ${state}`);
          }
        });

        table.push([
          portDisplay,
          procName,
          Array.from(group.pids).join(','),
          totalConns.toString(),
          stateStrs.join(', ')
        ]);
      });
    });

    console.log(table.toString());
    console.log(chalk.gray(`\nShowing ${sortedPorts.length} port(s)`));

  } else {
    const table = new Table({
      head: ['Port', 'Type', 'PID', 'Process', 'Address', 'State'],
      style: {
        head: ['cyan'],
        border: ['gray']
      },
      colAligns: ['right', 'center', 'right', 'left', 'left', 'center']
    });

    sortedPorts.forEach(([port, processes]) => {
      processes.forEach(proc => {
        const portDisplay = colorizePort(port);

        let stateDisplay = proc.state;
        if (proc.state === 'LISTEN') {
          stateDisplay = chalk.green('●') + ' LISTEN';
        } else if (proc.state === 'ESTABLISHED') {
          stateDisplay = chalk.blue('●') + ' ESTAB';
        } else if (proc.state === 'CLOSE_WAIT') {
          stateDisplay = chalk.yellow('●') + ' CLOSE';
        }

        table.push([
          portDisplay,
          proc.type,
          proc.pid.toString(),
          proc.command,
          proc.name,
          stateDisplay
        ]);
      });
    });

    console.log(table.toString());
    const totalConns = sortedPorts.reduce((sum, [, procs]) => sum + procs.length, 0);
    console.log(chalk.gray(`\nShowing ${sortedPorts.length} port(s) with ${totalConns} connection(s)`));
  }
}
