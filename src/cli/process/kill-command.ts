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
        
      } catch (error) {
        UIHelper.showError(`Kill command failed: ${error}`);
        process.exit(1);
      }
    });
}

async function killByPort(port: string, processMonitor: ProcessMonitor): Promise<void> {
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
    default: false
  }]);
  
  if (confirm) {
    await killProcesses(portProcesses.map(p => p.pid), processMonitor);
  } else {
    console.log(chalk.gray('Operation cancelled'));
  }
}

async function offerPortMode(processes: any[], portCheck: string, processMonitor: ProcessMonitor): Promise<boolean> {
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
      
      const [command, pid, user, fd, type, device, size, node, name] = parts;
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
      // Get process names for this port
      const portProcesses = processes.filter(p => pids.has(p.pid));
      const processNames = [...new Set(portProcesses.map(p => 
        extractSmartProcessName(p.command).split('/').pop()
      ))].join(', ');
      
      // Color code common ports
      let portDisplay = port;
      if (['80', '443', '8080', '8000', '3000', '5173'].includes(port)) {
        portDisplay = chalk.yellow(port);
      } else if (parseInt(port) < 1024) {
        portDisplay = chalk.red(port);
      }
      
      return {
        name: `Port ${portDisplay} - ${processNames} (${pids.size} process${pids.size > 1 ? 'es' : ''})`,
        value: port
      };
    });
    
    const { selectedPorts } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedPorts',
      message: 'Select ports to terminate processes on:',
      choices: portChoices
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
        default: false
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
  
  for (const pid of pids) {
    try {
      const success = await processMonitor.killProcess(pid);
      if (success) {
        console.log(chalk.green(`✓ Terminated PID ${pid}`));
        killed++;
      } else {
        // Check if it's a permission error
        try {
          await execAsync(`kill -0 ${pid}`);
          // Process exists but couldn't be killed
          console.log(chalk.red(`✗ Failed to terminate PID ${pid} - Operation not permitted`));
          permissionDenied++;
        } catch {
          // Process doesn't exist or already terminated
          console.log(chalk.gray(`○ PID ${pid} no longer exists`));
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`✗ Failed to terminate PID ${pid}`));
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