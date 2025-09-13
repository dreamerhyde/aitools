import { Command } from 'commander';
import { ProcessMonitor } from '../../utils/process-monitor.js';
import { UIHelper } from '../../utils/ui.js';
import { identifyProcess, type IdentifiedProcess } from '../../utils/process-identifier.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function setupPortCommand(processCommand: Command): void {
  processCommand
    .command('port')
    .alias('ports')
    .description('Show processes listening on network ports')
    .option('--tcp', 'Show only TCP ports')
    .option('--udp', 'Show only UDP ports')
    .option('--all', 'Show all connections including ESTABLISHED')
    .option('--detail', 'Show detailed connection info')
    .action(async (options) => {
      try {
        // Default to showing only LISTEN unless --all is specified
        const showAll = options.all;
        const showListen = !showAll;
        
        // Use lsof to get port information
        let lsofCmd = 'lsof -i -n -P';
        if (options.tcp) lsofCmd += ' -iTCP';
        if (options.udp) lsofCmd += ' -iUDP';
        if (showListen && !showAll) lsofCmd += ' | grep LISTEN';
        
        const { stdout } = await execAsync(lsofCmd).catch(() => ({ stdout: '' }));
        
        if (!stdout) {
          console.log(chalk.gray('No processes listening on ports'));
          return;
        }
        
        // Parse lsof output
        const lines = stdout.split('\n').filter(line => line.trim());
        const ports = new Map<string, any[]>();
        const pidsToIdentify = new Set<number>();
        
        // First pass: collect all PIDs and basic info
        const rawProcesses: Array<{ pid: number; command: string; port: string; user: string; type: string; name: string; state: string }> = [];
        
        lines.forEach((line, index) => {
          if (index === 0) return; // Skip header
          
          const parts = line.split(/\s+/);
          if (parts.length < 9) return;
          
          const [command, pid, user, , type, , , , name] = parts;
          
          // Extract port from name (e.g., *:8080, 127.0.0.1:3000)
          const portMatch = name?.match(/:(\d+)(\s+\((.+)\))?$/);
          if (!portMatch) return;
          
          const port = portMatch[1];
          const state = portMatch[3] || 'LISTEN';
          const pidNum = parseInt(pid);
          
          pidsToIdentify.add(pidNum);
          rawProcesses.push({
            pid: pidNum,
            command,
            port,
            user,
            type,
            name: name.replace(/\s+\(.+\)$/, ''),
            state
          });
        });
        
        // Get full process info for all PIDs
        const processMonitor = new ProcessMonitor();
        const allProcesses = await processMonitor.getAllProcesses();
        const processMap = new Map(allProcesses.map(p => [p.pid, p]));
        
        // Prepare processes for identification
        // For Docker Desktop, we need to identify each port separately even if same PID
        const processesToIdentify: Array<{ pid: number; command: string; port?: number; key: string }> = [];
        
        rawProcesses.forEach(proc => {
          const fullProcess = processMap.get(proc.pid);
          const port = parseInt(proc.port);
          const key = `${proc.pid}:${port}`;
          
          processesToIdentify.push({
            pid: proc.pid,
            command: fullProcess ? fullProcess.command : proc.command,
            port,
            key
          });
        });
        
        // Identify processes individually (cannot batch due to port-specific identification)
        // Docker Desktop uses same PID for multiple ports, so we need per-port identification
        const identifiedMap = new Map<string, IdentifiedProcess>();
        
        for (const processInfo of processesToIdentify) {
          if (!identifiedMap.has(processInfo.key)) {
            const identified = await identifyProcess({
              pid: processInfo.pid,
              command: processInfo.command,
              port: processInfo.port
            });
            identifiedMap.set(processInfo.key, identified);
          }
        }
        
        // Build final port map with identified names
        rawProcesses.forEach(proc => {
          // Use same key format as when storing
          const portNum = parseInt(proc.port);
          const key = `${proc.pid}:${portNum}`;
          const identifiedInfo = identifiedMap.get(key);
          
          // For fallback, use identified info or command substring
          const displayName = identifiedInfo ? identifiedInfo.displayName : proc.command.substring(0, 50);
          
          if (!ports.has(proc.port)) {
            ports.set(proc.port, []);
          }
          
          ports.get(proc.port)?.push({
            command: displayName,
            pid: proc.pid,
            user: proc.user,
            type: proc.type,
            name: proc.name,
            state: proc.state,
            category: identifiedInfo?.category || 'unknown'
          });
        });
        
        if (ports.size === 0) {
          console.log(chalk.gray('No processes listening on ports'));
          return;
        }
        
        // Sort ports numerically
        const sortedPorts = Array.from(ports.entries()).sort((a, b) => 
          parseInt(a[0]) - parseInt(b[0])
        );
        
        // Display table based on mode
        displayPortsTable(sortedPorts, options, showAll);
        
      } catch (error) {
        UIHelper.showError(`Port command failed: ${error}`);
        process.exit(1);
      }
    });
}

function displayPortsTable(sortedPorts: [string, any[]][], options: any, showAll: boolean): void {
  if (!options.detail && showAll) {
    // Summary mode for --all: group connections by port
    const table = new Table({
      head: ['Port', 'Process', 'PID', 'Connections', 'Status'],
      style: {
        head: ['cyan'],
        border: ['gray']
      },
      colAligns: ['right', 'left', 'right', 'right', 'left']
    });
    
    sortedPorts.forEach(([port, processes]) => {
      // Group by process name
      const processByName = new Map<string, { pids: Set<number>, states: Map<string, number> }>();
      
      processes.forEach(proc => {
        if (!processByName.has(proc.command)) {
          processByName.set(proc.command, { pids: new Set(), states: new Map() });
        }
        const group = processByName.get(proc.command)!;
        group.pids.add(proc.pid);
        group.states.set(proc.state, (group.states.get(proc.state) || 0) + 1);
      });
      
      processByName.forEach((group, procName) => {
        // Color code common ports
        let portDisplay = port;
        if (['80', '443', '8080', '8000', '3000', '5173'].includes(port)) {
          portDisplay = chalk.yellow(port);
        } else if (parseInt(port) < 1024) {
          portDisplay = chalk.red(port); // System ports
        }
        
        // Format connection count
        const totalConns = Array.from(group.states.values()).reduce((a, b) => a + b, 0);
        
        // Format states
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
    // Detail mode or LISTEN only mode: show all connections
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
        // Color code common ports
        let portDisplay = port;
        if (['80', '443', '8080', '8000', '3000', '5173'].includes(port)) {
          portDisplay = chalk.yellow(port);
        } else if (parseInt(port) < 1024) {
          portDisplay = chalk.red(port); // System ports
        }
        
        // State indicator
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