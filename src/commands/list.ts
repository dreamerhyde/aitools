import { ProcessMonitor } from '../utils/process-monitor.js';
import { UIHelper } from '../utils/ui.js';

export interface ListCommandOptions {
  all?: boolean;
  hooks?: boolean;
  cpu?: number;
  memory?: number;
  sort?: 'pid' | 'cpu' | 'memory' | 'time';
  limit?: number;
}

export class ListCommand {
  private monitor: ProcessMonitor;

  constructor() {
    this.monitor = new ProcessMonitor();
  }

  async execute(options: ListCommandOptions = {}): Promise<void> {
    const spinner = UIHelper.createSpinner('Fetching process list...');
    spinner.start();

    try {
      let processes = await this.monitor.getAllProcesses();
      spinner.stop();

      // Apply filters
      if (options.hooks) {
        processes = processes.filter(p => p.isHook);
      }

      if (options.cpu !== undefined) {
        processes = processes.filter(p => p.cpu >= options.cpu!);
      }

      if (options.memory !== undefined) {
        processes = processes.filter(p => p.memory >= options.memory!);
      }

      // Sort
      processes = this.sortProcesses(processes, options.sort || 'cpu');

      // Limit results
      if (options.limit) {
        processes = processes.slice(0, options.limit);
      }

      // Display results
      UIHelper.showHeader();
      
      let title = 'All Processes';
      if (options.hooks) title = 'Hook-related Processes';
      else if (options.cpu !== undefined) title = `Processes with CPU ≥ ${options.cpu}%`;
      else if (options.memory !== undefined) title = `Processes with Memory ≥ ${options.memory}%`;

      UIHelper.showProcessTable(processes, title, options.limit || 50);

      // Display statistics
      console.log(`\n▪ Found ${processes.length} matching processes`);
      
      if (processes.length > 0) {
        const totalCpu = processes.reduce((sum, p) => sum + p.cpu, 0);
        const totalMemory = processes.reduce((sum, p) => sum + p.memory, 0);
        const hookCount = processes.filter(p => p.isHook).length;
        
        console.log(`   → Total CPU Usage: ${totalCpu.toFixed(1)}%`);
        console.log(`   → Total Memory Usage: ${totalMemory.toFixed(1)}%`);
        console.log(`   → Hook Process Count: ${hookCount}`);
      }

    } catch (error) {
      spinner.stop();
      UIHelper.showError(`Failed to fetch process list: ${error}`);
      process.exit(1);
    }
  }

  private sortProcesses(processes: any[], sortBy: string) {
    switch (sortBy) {
      case 'pid':
        return processes.sort((a, b) => a.pid - b.pid);
      case 'cpu':
        return processes.sort((a, b) => b.cpu - a.cpu);
      case 'memory':
        return processes.sort((a, b) => b.memory - a.memory);
      case 'time':
        return processes.sort((a, b) => a.startTime.localeCompare(b.startTime));
      default:
        return processes.sort((a, b) => b.cpu - a.cpu);
    }
  }
}