import { Command } from 'commander';
import { ProcessMonitor } from '../../utils/process-monitor.js';
import { UIHelper } from '../../utils/ui.js';
import { extractSmartProcessName } from '../../commands/monitor/utils/sanitizers.js';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { promisify } from 'util';

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
        
        // Handle port-based killing
        if (options.port) {
          await killByPort(options.port, processMonitor);
          return;
        }
        
        // Regular kill mode (not port-based)
        const processes = await processMonitor.getAllProcesses();
        
        let targetProcesses = processes;
        if (options.hooks) {
          targetProcesses = processes.filter(p => p.isHook);
          if (targetProcesses.length === 0) {
            console.log(chalk.gray('No hook processes found'));
            return;
          }
        } else {
          // Apply CPU threshold filter
          const cpuThreshold = parseFloat(options.cpu);
          targetProcesses = processes.filter(p => p.cpu >= cpuThreshold);
        }
        
        // Sort processes
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
        
        // Check if we should show port selection
        const { stdout: portCheck } = await execAsync('lsof -i -n -P | grep LISTEN').catch(() => ({ stdout: '' }));
        const hasListeningPorts = portCheck.trim().length > 0;
        
        if (hasListeningPorts && !options.hooks) {
          const shouldOfferPortMode = await offerPortMode(processes, portCheck, processMonitor);
          if (shouldOfferPortMode) return;
        }
        
        // Regular PID selection mode
        await selectAndKillProcesses(targetProcesses, processMonitor);
        
      } catch (error: any) {
        // Handle user cancellation gracefully
        if (error.name === 'ExitPromptError' || error.message?.includes('SIGINT')) {
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
    // Get processes on the specified port
    const lsofCmd = `lsof -i :${port} -t`;
    const { stdout } = await execAsync(lsofCmd).catch(() => ({ stdout: '' }));
    
    if (!stdout) {
      console.log(chalk.gray(`No processes found on port ${port}`));
      return;
    }
    
    const pids = stdout.split('\n').filter(pid => pid.trim()).map(pid => parseInt(pid));
    const uniquePids = [...new Set(pids)]; // Remove duplicates
    
    // Get process details for confirmation
    const processes = await processMonitor.getAllProcesses();
    const portProcesses = processes.filter(p => uniquePids.includes(p.pid));
    
    if (portProcesses.length === 0) {
      console.log(chalk.gray(`No processes found on port ${port}`));
      return;
    }
    
    // Show what will be killed
    console.log(chalk.cyan(`Processes on port ${port}:\n`));
    portProcesses.forEach(proc => {
      const smartName = extractSmartProcessName(proc.command);
      console.log(`  PID ${chalk.cyan(proc.pid.toString().padStart(7))} - ${smartName}`);
    });
    
    // Confirm termination
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
  } catch (error: any) {
    // Handle user cancellation gracefully
    if (error.name === 'ExitPromptError' || error.message?.includes('SIGINT')) {
      console.log(chalk.gray('\nOperation cancelled'));
      return;
    }
    throw error; // Re-throw for parent handler
  }
}

async function offerPortMode(processes: any[], portCheck: string, processMonitor: ProcessMonitor): Promise<boolean> {
  try {
    // Offer choice between process selection and port selection
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
    // Get all listening ports
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
    
    // Sort ports numerically
    const sortedPorts = Array.from(portMap.entries()).sort((a, b) => 
      parseInt(a[0]) - parseInt(b[0])
    );
    
    const portChoices = sortedPorts.map(([port, pids]) => {
      // Get detailed process info for this port
      const portProcesses = processes.filter(p => pids.has(p.pid));
      
      // Get the main process (highest CPU usage)
      const mainProcess = portProcesses.sort((a, b) => b.cpu - a.cpu)[0];
      if (!mainProcess) return null;
      
      // Use shared extractSmartProcessName for consistency
      const smartName = extractSmartProcessName(mainProcess.command);
      
      // Calculate total resource usage
      const totalCpu = portProcesses.reduce((sum, p) => sum + p.cpu, 0);
      const totalMem = portProcesses.reduce((sum, p) => sum + p.memory, 0);
      
      // Format port with color coding
      const portStr = port.padStart(5);
      let portDisplay = portStr;
      if (['80', '443', '8080', '8000', '3000', '5173', '5432', '3306'].includes(port)) {
        portDisplay = chalk.yellow(portStr);
      } else if (parseInt(port) < 1024) {
        portDisplay = chalk.red(portStr);
      } else {
        portDisplay = chalk.cyan(portStr);
      }
      
      // Format CPU and memory with color coding
      const cpuVal = totalCpu.toFixed(1).padStart(5);
      const memVal = totalMem.toFixed(1).padStart(5);
      
      const cpuStr = totalCpu > 20 ? chalk.red(cpuVal + '%') : 
                     totalCpu > 10 ? chalk.yellow(cpuVal + '%') : 
                     chalk.white(cpuVal + '%');
      const memStr = totalMem > 20 ? chalk.red(memVal + '%') : 
                     totalMem > 10 ? chalk.yellow(memVal + '%') : 
                     chalk.white(memVal + '%');
      
      // Format PID list
      const pidList = Array.from(pids).sort((a, b) => a - b);
      const pidStr = pidList.length <= 3 
        ? chalk.gray(`PID:[${pidList.join(',')}]`)
        : chalk.gray(`PID:[${pidList.slice(0, 2).join(',')},..+${pidList.length - 2}]`);
      
      return {
        name: `Port ${portDisplay} CPU ${cpuStr} MEM ${memStr} ${chalk.gray('│')} ${smartName} ${pidStr}`,
        value: port,
        short: `Port ${port} PIDs:${pidList.join(',')} - ${smartName}`
      };
    }).filter(Boolean);
    
    const { selectedPorts } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedPorts',
      message: 'Select ports to terminate processes on:',
      choices: portChoices,
      loop: false
    }]);
    
    if (selectedPorts && selectedPorts.length > 0) {
      // Collect all PIDs from selected ports
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
  } catch (error: any) {
    // Handle user cancellation gracefully
    if (error.name === 'ExitPromptError' || error.message?.includes('SIGINT')) {
      console.log(chalk.gray('\nOperation cancelled'));
      return true; // Exit without error
    }
    throw error; // Re-throw for parent handler
  }
}

async function selectAndKillProcesses(targetProcesses: any[], processMonitor: ProcessMonitor): Promise<void> {
  const termWidth = process.stdout.columns || 120;
  const commandWidth = Math.max(50, termWidth - 40);
  
  const processOptions = targetProcesses.slice(0, 30).map((proc) => {
    // Use smart process name extraction
    const smartName = extractSmartProcessName(proc.command);
    const shortCmd = smartName.length > commandWidth ? 
      smartName.substring(0, commandWidth - 3) + '...' : 
      smartName;
    
    // Format with fixed widths for consistency
    const pidStr = proc.pid.toString().padStart(7);
    const cpuVal = proc.cpu.toFixed(1).padStart(5);
    const memVal = proc.memory.toFixed(1).padStart(5);
    
    // Color code based on CPU usage
    const cpuStr = proc.cpu > 20 ? chalk.red(cpuVal + '%') : 
                   proc.cpu > 10 ? chalk.yellow(cpuVal + '%') : 
                   chalk.white(cpuVal + '%');
    const memStr = proc.memory > 20 ? chalk.red(memVal + '%') : 
                   proc.memory > 10 ? chalk.yellow(memVal + '%') : 
                   chalk.white(memVal + '%');
    
    return {
      name: `PID ${chalk.cyan(pidStr)} CPU ${cpuStr} MEM ${memStr} ${chalk.gray('│')} ${shortCmd}`,
      value: proc.pid,
      short: `PID ${proc.pid} - ${shortCmd}`,
      checked: false // Don't pre-select any processes
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
  } catch (error: any) {
    // User cancelled with Ctrl+C
    if (error.name === 'ExitPromptError' || !error.name) {
      console.log(chalk.gray('\nOperation cancelled'));
    } else {
      throw error;
    }
  }
}

async function killProcesses(pids: number[], processMonitor: ProcessMonitor): Promise<void> {
  let killed = 0;
  let permissionDenied = 0;
  
  // Get process details for better display
  const processes = await processMonitor.getAllProcesses();
  const processMap = new Map(processes.map(p => [p.pid, p]));
  
  for (const pid of pids) {
    const proc = processMap.get(pid);
    const processName = proc ? extractSmartProcessName(proc.command) : 'Unknown';
    
    try {
      const success = await processMonitor.killProcess(pid);
      if (success) {
        console.log(chalk.green(`✓ Terminated PID ${pid} - ${processName}`));
        killed++;
      } else {
        // Check if it's a permission error
        try {
          await execAsync(`kill -0 ${pid}`);
          // Process exists but couldn't be killed
          console.log(chalk.red(`✗ Failed to terminate PID ${pid} - ${processName} - Operation not permitted`));
          permissionDenied++;
        } catch {
          // Process doesn't exist or already terminated
          console.log(chalk.gray(`○ PID ${pid} - ${processName} no longer exists`));
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`✗ Failed to terminate PID ${pid} - ${processName}`));
    }
  }
  
  // Display summary
  const messages = [];
  if (killed > 0) {
    messages.push(chalk.green(`✓ Successfully terminated ${killed} process(es)`));
  }
  if (permissionDenied > 0) {
    messages.push(chalk.yellow(`⚠ Permission denied for ${permissionDenied} process(es)` +
      (permissionDenied > 0 ? ' (try with sudo)' : '')));
  }
  
  if (messages.length > 0) {
    console.log('\n' + messages.join('\n'));
  }
}