import { exec } from 'child_process';
import { promisify } from 'util';
import { ProcessInfo, SystemStats, HookDetectionResult, MonitorOptions } from '../types/index.js';

const execAsync = promisify(exec);

export class ProcessMonitor {
  private options: MonitorOptions;

  constructor(options: Partial<MonitorOptions> = {}) {
    this.options = {
      cpuThreshold: 5.0,
      memoryThreshold: 1.0,
      timeThreshold: 300, // 5 minutes
      includeSystem: false,
      ...options
    };
  }

  async getSystemStats(): Promise<SystemStats> {
    try {
      const { stdout: vmStat } = await execAsync('vm_stat');
      const { stdout: topOutput } = await execAsync('top -l 1 -n 0 | head -10');
      
      const memoryInfo = this.parseMemoryInfo(vmStat);
      const cpuInfo = this.parseCpuInfo(topOutput);
      
      return {
        totalMemory: memoryInfo.total,
        freeMemory: memoryInfo.free,
        activeMemory: memoryInfo.active,
        cpuUsage: cpuInfo.cpu,
        loadAverage: cpuInfo.loadAverage
      };
    } catch (error) {
      throw new Error(`Failed to get system status: ${error}`);
    }
  }

  async getAllProcesses(): Promise<ProcessInfo[]> {
    try {
      const { stdout } = await execAsync(
        'ps -Ao pid,ppid,pcpu,pmem,etime,stat,command | tail -n +2'
      );
      
      return stdout.trim().split('\n').map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 7) return null;
        
        const [pid, ppid, cpu, memory, etime, stat, ...commandParts] = parts;
        const command = commandParts.join(' ');
        
        return {
          pid: parseInt(pid),
          ppid: parseInt(ppid),
          command,
          cpu: parseFloat(cpu),
          memory: parseFloat(memory),
          startTime: etime,
          isHook: this.isLikelyHook(command),
          status: this.parseStatus(stat)
        };
      }).filter((proc): proc is ProcessInfo => proc !== null);
    } catch (error) {
      throw new Error(`Failed to get process list: ${error}`);
    }
  }

  async detectSuspiciousHooks(): Promise<HookDetectionResult> {
    const processes = await this.getAllProcesses();
    const systemStats = await this.getSystemStats();
    
    // Detect duplicate processes (same command running multiple times)
    const commandCounts = new Map<string, number>();
    processes.forEach(proc => {
      const baseCommand = proc.command.split(' ')[0]; // Get base command
      commandCounts.set(baseCommand, (commandCounts.get(baseCommand) || 0) + 1);
    });
    
    // Detect abnormal processes: sleeping but consuming CPU (zombie-like behavior)
    const suspiciousProcesses = processes.filter(proc => {
      // Hook processes that are suspicious
      if (proc.isHook) {
        // Restart/quick scripts shouldn't run long
        const isRestartScript = proc.command.includes('restart') || 
                               proc.command.includes('reload') || 
                               proc.command.includes('refresh');
        
        // Claude hooks are especially suspicious
        const isClaudeHook = proc.command.includes('.claude/hooks/');
        
        // Multiple instances of same hook
        const baseCommand = proc.command.split(' ')[0];
        const hasDuplicates = (commandCounts.get(baseCommand) || 0) > 1;
        
        // Any Claude hook using CPU while sleeping is abnormal
        if (isClaudeHook && proc.status === 'sleeping' && proc.cpu > 1) {
          return true;
        }
        
        // Restart scripts running for more than 1 minute
        if (isRestartScript && this.parseElapsedSeconds(proc.startTime) > 60) {
          return true;
        }
        
        // Multiple instances of the same hook
        if (isClaudeHook && hasDuplicates) {
          return true;
        }
        
        // General: sleeping but using significant CPU
        if (proc.status === 'sleeping' && proc.cpu >= 5) {
          return true;
        }
        
        // Long running hooks
        if (this.isLongRunning(proc.startTime)) {
          return true;
        }
        
        // High CPU hooks
        if (proc.cpu > this.options.cpuThreshold) {
          return true;
        }
      }
      return false;
    });
    
    const highCpuProcesses = processes.filter(proc => 
      proc.cpu > this.options.cpuThreshold && !proc.isHook
    );
    
    const longRunningBash = processes.filter(proc =>
      proc.command.includes('bash') && 
      this.isLongRunning(proc.startTime) &&
      (proc.cpu > 0 || proc.status === 'sleeping') // Include sleeping bash with any CPU usage
    );
    
    return {
      suspiciousProcesses,
      highCpuProcesses,
      longRunningBash,
      systemStats
    };
  }

  async killProcess(pid: number): Promise<boolean> {
    try {
      await execAsync(`kill -TERM ${pid}`);
      // Wait 5 seconds, force kill if still alive
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      try {
        await execAsync(`kill -0 ${pid}`);
        await execAsync(`kill -KILL ${pid}`);
      } catch {
        // Process already terminated
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to terminate process ${pid}:`, error);
      return false;
    }
  }

  private isLikelyHook(command: string): boolean {
    // Exclude aitools itself from hook detection
    if (command.includes('aitools/dist/cli.js') || 
        command.includes('ai ps hooks') ||
        command.includes('ai process hooks')) {
      return false;
    }
    
    const hookPatterns = [
      /hook/i,
      /claude.*code/i,
      /git.*hook/i,
      /pre-commit/i,
      /post-commit/i,
      /husky/i,
      /lint-staged/i
    ];
    
    return hookPatterns.some(pattern => pattern.test(command));
  }

  private parseStatus(stat: string): ProcessInfo['status'] {
    const firstChar = stat.charAt(0).toUpperCase();
    switch (firstChar) {
      case 'R': return 'running';
      case 'S': return 'sleeping';
      case 'Z': return 'zombie';
      case 'T': return 'stopped';
      default: return 'running';
    }
  }

  private isLongRunning(etime: string): boolean {
    return this.parseElapsedSeconds(etime) > this.options.timeThreshold;
  }
  
  private parseElapsedSeconds(etime: string): number {
    // Parse etime format (could be MM:SS or HH:MM:SS or DD-HH:MM:SS)
    const parts = etime.split(/[-:]/);
    let totalSeconds = 0;
    
    if (parts.length === 2) {
      // MM:SS
      totalSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (parts.length === 3) {
      // HH:MM:SS
      totalSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    } else if (parts.length === 4) {
      // DD-HH:MM:SS
      totalSeconds = parseInt(parts[0]) * 86400 + parseInt(parts[1]) * 3600 + 
                    parseInt(parts[2]) * 60 + parseInt(parts[3]);
    }
    
    return totalSeconds;
  }

  private parseMemoryInfo(vmStat: string): { total: string; free: string; active: string } {
    const lines = vmStat.split('\n');
    const pageSize = 4096; // macOS page size
    
    let freePages = 0;
    let activePages = 0;
    let speculativePages = 0;
    
    lines.forEach(line => {
      if (line.includes('Pages free:')) {
        freePages = parseInt(line.split(':')[1].trim().replace('.', ''));
      } else if (line.includes('Pages active:')) {
        activePages = parseInt(line.split(':')[1].trim().replace('.', ''));
      } else if (line.includes('Pages speculative:')) {
        speculativePages = parseInt(line.split(':')[1].trim().replace('.', ''));
      }
    });
    
    const freeMemory = Math.round((freePages + speculativePages) * pageSize / 1024 / 1024);
    const activeMemory = Math.round(activePages * pageSize / 1024 / 1024);
    const totalMemory = Math.round((freePages + activePages + speculativePages) * pageSize / 1024 / 1024);
    
    return {
      total: `${totalMemory}MB`,
      free: `${freeMemory}MB`,
      active: `${activeMemory}MB`
    };
  }

  private parseCpuInfo(topOutput: string): { cpu: number; loadAverage: number[] } {
    const lines = topOutput.split('\n');
    let cpuUsage = 0;
    let loadAverage: number[] = [0, 0, 0];
    
    lines.forEach(line => {
      if (line.includes('CPU usage:')) {
        const match = line.match(/(\d+\.\d+)% user/);
        if (match) {
          cpuUsage = parseFloat(match[1]);
        }
      } else if (line.includes('Load Avg:')) {
        const match = line.match(/Load Avg: ([\d.]+), ([\d.]+), ([\d.]+)/);
        if (match) {
          loadAverage = [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])];
        }
      }
    });
    
    return { cpu: cpuUsage, loadAverage };
  }
}