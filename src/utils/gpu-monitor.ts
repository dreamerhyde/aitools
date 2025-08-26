import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

export interface GPUInfo {
  usage: number;
  memory: {
    used: number;
    total: number;
  };
  temperature: number | null;
  power: number | null;
  name: string;
  cores?: number;
}

export class GPUMonitor {
  private platform: string;
  private gpuCache: {
    lastUpdate: number;
    data: GPUInfo | null;
    interval: number;
  };

  constructor() {
    this.platform = os.platform();
    this.gpuCache = {
      lastUpdate: 0,
      data: null,
      interval: 2000 // Cache for 2 seconds to avoid excessive system calls
    };
  }

  /**
   * Get GPU information based on platform
   */
  async getGPUInfo(): Promise<GPUInfo> {
    const now = Date.now();
    
    // Return cached data if still valid
    if (this.gpuCache.data && (now - this.gpuCache.lastUpdate) < this.gpuCache.interval) {
      return this.gpuCache.data;
    }

    try {
      let gpuData: GPUInfo;
      
      switch (this.platform) {
        case 'darwin':
          gpuData = await this.getMacOSGPU();
          break;
        case 'win32':
          gpuData = await this.getWindowsGPU();
          break;
        case 'linux':
          gpuData = await this.getLinuxGPU();
          break;
        default:
          gpuData = this.getDefaultGPU();
      }

      // Only cache if we got meaningful data
      if (gpuData.name !== 'Unknown GPU' || gpuData.usage > 0) {
        this.gpuCache.data = gpuData;
        this.gpuCache.lastUpdate = now;
      } else if (this.gpuCache.data) {
        // If detection failed but we have cached data, use it
        return this.gpuCache.data;
      }
      
      return gpuData;
    } catch (error: any) {
      // If we have cached data, return it instead of default
      if (this.gpuCache.data) {
        return this.gpuCache.data;
      }
      // Only return default if we have no cached data
      return this.getDefaultGPU();
    }
  }

  /**
   * Get macOS GPU information
   */
  private async getMacOSGPU(): Promise<GPUInfo> {
    const gpuData: GPUInfo = {
      usage: 0,
      memory: { used: 0, total: 0 },
      temperature: null,
      power: null,
      name: 'Unknown GPU'
    };

    try {
      // Method 1: Get GPU info from ioreg/system_profiler
      const ioregResult = await this.getMacOSGPUFromIOReg();
      if (ioregResult.name && ioregResult.name !== 'Unknown GPU') {
        gpuData.name = ioregResult.name;
      }
      if (ioregResult.memory.total > 0) {
        gpuData.memory = ioregResult.memory;
      }
      if (ioregResult.cores) {
        gpuData.cores = ioregResult.cores;
      }

      // Method 2: Try to get system-wide GPU usage from ioreg
      const activityResult = await this.getMacOSGPUFromActivity();
      if (activityResult.usage > 0) {
        gpuData.usage = activityResult.usage;
      }

      // Method 3: Get GPU usage from top command (process-based) as fallback
      if (gpuData.usage === 0) {
        const topResult = await this.getMacOSGPUFromTop();
        if (topResult.usage > 0) {
          gpuData.usage = topResult.usage;
        }
      }
      
      // Get memory usage from ioreg if available
      try {
        const { stdout } = await execAsync('ioreg -r -d 1 -w 0 -c "IOAccelerator" | grep -E "In use system memory"');
        const memMatch = stdout.match(/"In use system memory"=(\d+)/);
        const allocMatch = stdout.match(/"Alloc system memory"=(\d+)/);
        
        if (memMatch && allocMatch) {
          gpuData.memory.used = Math.round(parseInt(memMatch[1]) / (1024 * 1024)); // Convert to MB
          gpuData.memory.total = Math.round(parseInt(allocMatch[1]) / (1024 * 1024)); // Convert to MB
        }
      } catch {
        // Memory info not available
      }

    } catch (error: any) {
      // Silent fallback
    }

    return gpuData;
  }

  /**
   * Get GPU usage from top command (macOS)
   */
  private async getMacOSGPUFromTop(): Promise<{ usage: number }> {
    try {
      const { stdout } = await execAsync('top -l 1 -s 0 -stats pid,command,cpu,gpu | grep -v "0.0" | grep -v "GPU"');
      
      let totalGPU = 0;
      let processCount = 0;
      
      const lines = stdout.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const gpuUsage = parseFloat(parts[3]);
          if (!isNaN(gpuUsage) && gpuUsage > 0) {
            totalGPU += gpuUsage;
            processCount++;
          }
        }
      }
      
      return {
        usage: Math.min(totalGPU, 100) // Cap at 100%
      };
    } catch (error) {
      return { usage: 0 };
    }
  }

  /**
   * Get GPU info from ioreg (macOS)
   */
  private async getMacOSGPUFromIOReg(): Promise<{ name: string; memory: { used: number; total: number }; cores?: number }> {
    const result: { name: string; memory: { used: number; total: number }; cores?: number } = {
      name: 'Unknown GPU',
      memory: { used: 0, total: 0 }
    };

    try {
      // Try system_profiler first for accurate GPU name and core count
      const { stdout: spOutput } = await execAsync('system_profiler SPDisplaysDataType | grep -E "(Chipset Model|Total Number of Cores)"');
      
      const chipsetMatch = spOutput.match(/Chipset Model:\s+(.+)/);
      if (chipsetMatch) {
        result.name = chipsetMatch[1].trim();
      }
      
      const coresMatch = spOutput.match(/Total Number of Cores:\s+(\d+)/);
      if (coresMatch) {
        result.cores = parseInt(coresMatch[1]);
      }
    } catch {
      // Fallback to ioreg
      try {
        const { stdout } = await execAsync('ioreg -r -d 1 -w 0 -c "IOAccelerator"');
        
        // Parse GPU name from ioreg
        const nameMatch = stdout.match(/"model" = <"([^"]+)"/);
        if (nameMatch) {
          result.name = nameMatch[1];
        }
        
        // Try to get VRAM info
        const vramMatch = stdout.match(/"VRAM,totalMB" = (\d+)/);
        if (vramMatch) {
          result.memory.total = parseInt(vramMatch[1]);
        }
      } catch {
        // Silent fail
      }
    }

    return result;
  }

  /**
   * Get GPU usage from system activity (macOS)
   */
  private async getMacOSGPUFromActivity(): Promise<{ usage: number }> {
    try {
      // Try to get GPU usage from ioreg PerformanceStatistics
      const { stdout } = await execAsync('ioreg -r -d 1 -w 0 -c "IOAccelerator" | grep "Device Utilization"');
      const match = stdout.match(/"Device Utilization %"=(\d+)/);
      if (match) {
        return { usage: parseInt(match[1]) };
      }
      
      return { usage: 0 };
    } catch (error) {
      return { usage: 0 };
    }
  }

  /**
   * Get Windows GPU information
   */
  private async getWindowsGPU(): Promise<GPUInfo> {
    const gpuData: GPUInfo = {
      usage: 0,
      memory: { used: 0, total: 0 },
      temperature: null,
      power: null,
      name: 'Unknown GPU'
    };

    try {
      // Method 1: Try NVIDIA GPU first
      const nvidiaResult = await this.getWindowsNvidiaGPU();
      if (nvidiaResult.usage && nvidiaResult.usage > 0 || nvidiaResult.name !== 'Unknown GPU') {
        return { ...gpuData, ...nvidiaResult };
      }

      // Method 2: Try WMI for other GPUs
      const wmiResult = await this.getWindowsWMIGPU();
      return { ...gpuData, ...wmiResult };

    } catch (error: any) {
      console.warn('Windows GPU monitoring error:', error.message);
    }

    return gpuData;
  }

  /**
   * Get NVIDIA GPU info (Windows)
   */
  private async getWindowsNvidiaGPU(): Promise<Partial<GPUInfo>> {
    try {
      const { stdout } = await execAsync('nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,name,temperature.gpu,power.draw --format=csv,noheader,nounits');
      
      const line = stdout.trim().split('\n')[0];
      const [usage, memUsed, memTotal, name, temp, power] = line.split(', ');

      return {
        usage: parseFloat(usage) || 0,
        memory: {
          used: parseInt(memUsed) || 0,
          total: parseInt(memTotal) || 0
        },
        temperature: parseInt(temp) || null,
        power: parseFloat(power) || null,
        name: name || 'NVIDIA GPU'
      };
    } catch (error) {
      return {
        usage: 0,
        name: 'Unknown GPU',
        memory: { used: 0, total: 0 }
      };
    }
  }

  /**
   * Get GPU info via WMI (Windows)
   */
  private async getWindowsWMIGPU(): Promise<Partial<GPUInfo>> {
    try {
      // Get GPU name
      const { stdout: nameStdout } = await execAsync('wmic path win32_VideoController get name /value');
      const nameMatch = nameStdout.match(/Name=(.+)/);
      const gpuName = nameMatch ? nameMatch[1].trim() : 'Unknown GPU';

      // Get GPU memory (if available)
      const { stdout: memStdout } = await execAsync('wmic path win32_VideoController get AdapterRAM /value');
      const memMatch = memStdout.match(/AdapterRAM=(\d+)/);
      const totalMemory = memMatch ? Math.floor(parseInt(memMatch[1]) / (1024 * 1024)) : 0;

      // Try to get GPU usage (this might not work on all systems)
      let usage = 0;
      try {
        const { stdout: usageStdout } = await execAsync('typeperf "\\GPU Engine(*)\\Utilization Percentage" -sc 1');
        // Parse usage from typeperf output (complex parsing needed)
        const usageMatch = usageStdout.match(/(\d+\.\d+)/);
        usage = usageMatch ? parseFloat(usageMatch[1]) : 0;
      } catch (usageError) {
        // GPU usage monitoring not available
      }

      return {
        usage,
        name: gpuName,
        memory: { used: 0, total: totalMemory }
      };
    } catch (error) {
      return {
        usage: 0,
        name: 'Unknown GPU',
        memory: { used: 0, total: 0 }
      };
    }
  }

  /**
   * Get Linux GPU information
   */
  private async getLinuxGPU(): Promise<GPUInfo> {
    const gpuData: GPUInfo = {
      usage: 0,
      memory: { used: 0, total: 0 },
      temperature: null,
      power: null,
      name: 'Unknown GPU'
    };

    try {
      // Try NVIDIA first
      const nvidiaResult = await this.getLinuxNvidiaGPU();
      if (nvidiaResult.usage! > 0 || nvidiaResult.name !== 'Unknown GPU') {
        return { ...gpuData, ...nvidiaResult } as GPUInfo;
      }

      // Try AMD GPU
      const amdResult = await this.getLinuxAMDGPU();
      return { ...gpuData, ...amdResult } as GPUInfo;

    } catch (error: any) {
      console.warn('Linux GPU monitoring error:', error.message);
    }

    return gpuData;
  }

  /**
   * Get NVIDIA GPU info (Linux)
   */
  private async getLinuxNvidiaGPU(): Promise<Partial<GPUInfo>> {
    try {
      const { stdout } = await execAsync('nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,name,temperature.gpu,power.draw --format=csv,noheader,nounits');
      
      const line = stdout.trim().split('\n')[0];
      const [usage, memUsed, memTotal, name, temp, power] = line.split(', ');

      return {
        usage: parseFloat(usage) || 0,
        memory: {
          used: parseInt(memUsed) || 0,
          total: parseInt(memTotal) || 0
        },
        temperature: parseInt(temp) || null,
        power: parseFloat(power) || null,
        name: name || 'NVIDIA GPU'
      };
    } catch (error) {
      return {
        usage: 0,
        name: 'Unknown GPU',
        memory: { used: 0, total: 0 }
      };
    }
  }

  /**
   * Get AMD GPU info (Linux)
   */
  private async getLinuxAMDGPU(): Promise<Partial<GPUInfo>> {
    try {
      // Try to read from sysfs
      const { stdout } = await execAsync('find /sys/class/drm -name "card*" -type d | head -1');
      const cardPath = stdout.trim();
      
      if (cardPath) {
        const { stdout: usageStdout } = await execAsync(`cat ${cardPath}/device/gpu_busy_percent 2>/dev/null || echo 0`);
        const usage = parseInt(usageStdout.trim()) || 0;
        
        return {
          usage,
          name: 'AMD GPU',
          memory: { used: 0, total: 0 }
        };
      }
    } catch (error) {
      // AMD GPU monitoring not available
    }

    return {
      usage: 0,
      name: 'Unknown GPU',
      memory: { used: 0, total: 0 }
    };
  }

  /**
   * Default GPU data when monitoring is not available
   */
  private getDefaultGPU(): GPUInfo {
    // Try to detect Apple Silicon even when detailed monitoring fails
    if (this.platform === 'darwin') {
      try {
        const { execSync } = require('child_process');
        const arch = execSync('uname -m').toString().trim();
        if (arch === 'arm64') {
          return {
            usage: 0,
            memory: { used: 0, total: 0 },
            temperature: null,
            power: null,
            name: 'Apple Silicon GPU'
          };
        }
      } catch {
        // Fallback to generic
      }
    }
    
    return {
      usage: 0,
      memory: { used: 0, total: 0 },
      temperature: null,
      power: null,
      name: 'GPU'
    };
  }

  /**
   * Get formatted GPU string for display
   */
  async getGPUDisplay(): Promise<string> {
    const gpuInfo = await this.getGPUInfo();
    
    let displayText = `${gpuInfo.usage.toFixed(1)}%`;
    
    if (gpuInfo.memory.total > 0) {
      const memUsagePercent = (gpuInfo.memory.used / gpuInfo.memory.total * 100).toFixed(1);
      displayText += ` (${memUsagePercent}% VRAM)`;
    }
    
    if (gpuInfo.temperature !== null) {
      displayText += ` ${gpuInfo.temperature}°C`;
    }
    
    return displayText;
  }

  /**
   * Get GPU info for table display
   */
  async getGPUTableRow(): Promise<{ name: string; usage: string; memory: string; temp: string }> {
    const info = await this.getGPUInfo();
    
    const memoryStr = info.memory.total > 0 
      ? `${info.memory.used}/${info.memory.total}MB`
      : 'N/A';
      
    const tempStr = info.temperature !== null 
      ? `${info.temperature}°C` 
      : 'N/A';
    
    return {
      name: info.name,
      usage: `${info.usage.toFixed(1)}%`,
      memory: memoryStr,
      temp: tempStr
    };
  }
}