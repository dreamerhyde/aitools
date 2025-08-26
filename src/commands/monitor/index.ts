import chalk from 'chalk';
import { ScreenManager } from './components/screen-manager.js';
import { CostView } from './views/cost-view.js';
import { MetricsView } from './views/metrics-view.js';
import { SessionsView } from './views/sessions-view.js';
import { ProcessesView } from './views/processes-view.js';
import { SessionBoxesView } from './views/session-boxes-view.js';
import { DataFetcher } from './services/data-fetcher.js';
import { SessionManager } from './services/session-manager.js';
import { LogWatcher } from './services/log-watcher.js';
import { updateActiveSessionsFromConfig as updateSessionsFromConfig } from '../../utils/session-utils.js';
import { CostMetrics } from './types.js';

export class MonitorCommand {
  private screenManager: ScreenManager;
  private costView: CostView | null = null;
  private metricsView: MetricsView | null = null;
  private sessionsView: SessionsView | null = null;
  private processesView: ProcessesView | null = null;
  private sessionBoxesView: SessionBoxesView | null = null;
  
  private dataFetcher: DataFetcher;
  private sessionManager: SessionManager;
  private logWatcher: LogWatcher | null = null;
  
  private updateInterval: NodeJS.Timeout | null = null;
  private grid: any = null;
  private costMetrics: CostMetrics | null = null;
  private todayProjectCosts: Map<string, number> = new Map();

  constructor() {
    this.screenManager = new ScreenManager();
    this.dataFetcher = new DataFetcher();
    this.sessionManager = new SessionManager();
  }

  async execute(): Promise<void> {
    // Check if running in a proper TTY environment
    if (!process.stdout.isTTY) {
      console.error(chalk.red('Error: Monitor mode requires an interactive terminal (TTY)'));
      console.error(chalk.yellow('This mode cannot run in non-TTY environments like CI/CD pipelines'));
      process.exit(1);
    }

    try {
      await this.initializeScreen();
      this.createLayout();
      this.setupEventHandlers();
      
      // Start watching log file
      this.watchLogFile();
      
      // Initial load of sessions from config
      await this.updateActiveSessionsFromConfig();
      
      // Initial updates
      await this.updateAllViews();
      
      // Set up periodic updates
      this.updateInterval = setInterval(async () => {
        await this.updateActiveSessionsFromConfig(); // Refresh sessions from config
        await this.updateAllViews();
      }, 5000);

      // Keep the screen alive
      this.screenManager.render();
      
    } catch (error) {
      this.cleanup();
      console.error(chalk.red('Monitor error:'), error);
      process.exit(1);
    }
  }

  private async initializeScreen(): Promise<void> {
    await this.screenManager.initialize();
  }

  private createLayout(): void {
    // Create fixed grid layout - always 12x12, no dynamic sizing
    this.grid = this.screenManager.createGrid(12, 12);
    
    // Initialize views with original layout positions
    this.costView = new CostView(this.screenManager, this.grid);
    this.costView.initialize();
    
    this.sessionsView = new SessionsView(this.screenManager, this.grid);
    this.sessionsView.initialize();
    
    this.metricsView = new MetricsView(this.screenManager, this.grid);
    this.metricsView.initialize();
    
    this.processesView = new ProcessesView(this.screenManager, this.grid);
    this.processesView.initialize();
    
    // Initialize session boxes view (for dynamic Q/A display at bottom)
    const blessed = this.screenManager.getBlessed();
    this.sessionBoxesView = new SessionBoxesView(this.screenManager, this.grid, blessed);
    
    // Add status bar at bottom
    const screen = this.screenManager.getScreen();
    
    const statusBar = blessed.box({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: ' [q] Quit  [r] Refresh  [k] Kill Process (High CPU)  [↑↓] Navigate Sessions ',
      style: {
        fg: 'cyan',
        bg: 'black',
        bold: true
      },
      tags: true,
      shrink: false
    });
  }

  private setupEventHandlers(): void {
    this.screenManager.setupKeyBindings({
      'r': () => this.updateAllViews(),
      'c': () => this.sessionManager.clearSessions(),
      'f': () => {
        if (this.costView) {
          this.costView.rotateFont();
          this.updateAllViews();
        }
      },
      'quit': () => this.cleanup()
    });
  }

  private watchLogFile(): void {
    this.logWatcher = new LogWatcher('.claude_logs.jsonl', (entry) => {
      this.sessionManager.processLogEntry(entry);
    });
    this.logWatcher.start();
  }

  private async getSystemResources(): Promise<any> {
    const { execSync } = require('child_process');
    
    try {
      // Get CPU info
      let cpuInfo = 'Unknown';
      let gpuInfo = undefined;
      let gpu = undefined;
      
      // Get GPU info from GPUMonitor
      try {
        const gpuData = await this.dataFetcher.getGPUMonitor().getGPUInfo();
        gpu = gpuData.usage;
        
        if (gpuData.cores) {
          gpuInfo = `${gpuData.cores} cores`;
        } else {
          gpuInfo = 'GPU';
        }
        
        // Add VRAM info if available
        if (gpuData.memory.total > 0) {
          const memPercent = ((gpuData.memory.used / gpuData.memory.total) * 100);
          const memPercentStr = memPercent.toFixed(0);
          
          let vramColor = chalk.green;
          if (memPercent > 80) vramColor = chalk.red;
          else if (memPercent > 60) vramColor = chalk.yellow;
          else if (memPercent > 40) vramColor = chalk.cyan;
          
          gpuInfo += ` • ${vramColor(memPercentStr + '% VRAM')}`;
        }
        
        if (gpuData.temperature !== null) {
          gpuInfo += ` • ${gpuData.temperature}°C`;
        }
      } catch (gpuError) {
        // Fallback to CPU detection
      }
      
      // Get CPU architecture info
      try {
        const cpuArch = execSync('uname -m').toString().trim();
        const coreCount = execSync('sysctl -n hw.ncpu').toString().trim();
        
        if (cpuArch === 'arm64') {
          // Apple Silicon
          try {
            const cpuBrand = execSync('sysctl -n machdep.cpu.brand_string 2>/dev/null').toString().trim();
            const chipMatch = cpuBrand.match(/Apple (M\d+\s*\w*)/);
            const chipName = chipMatch ? chipMatch[1] : 'Apple Silicon';
            cpuInfo = `${chipName} (${coreCount} cores)`;
            
            // Set default GPU info if not detected
            if (!gpuInfo) {
              gpuInfo = this.getDefaultGPUCores(chipName);
            }
          } catch {
            cpuInfo = `Apple Silicon (${coreCount} cores)`;
          }
        } else {
          // Intel Mac
          const cpuBrand = execSync('sysctl -n machdep.cpu.brand_string').toString().trim();
          const shortBrand = cpuBrand.replace(/\(R\)/g, '').replace(/\(TM\)/g, '').replace(/CPU.*/, '').trim();
          cpuInfo = `${shortBrand} (${coreCount} cores)`;
        }
      } catch {
        cpuInfo = 'Unknown CPU';
      }
      
      // Get system stats
      const sysInfo = await this.dataFetcher.getProcessMonitor().getSystemStats();
      
      // Get memory info
      const memUsed = (sysInfo.memoryUsed / (1024 * 1024 * 1024)).toFixed(1);
      const memTotal = (sysInfo.memoryTotal / (1024 * 1024 * 1024)).toFixed(1);
      const memPercent = (sysInfo.memoryUsed / sysInfo.memoryTotal) * 100;
      
      return {
        cpu: sysInfo.cpuUsage,
        memory: memPercent,
        gpu: gpu,
        cpuInfo: cpuInfo,
        gpuInfo: gpuInfo,
        memUsed: memUsed,
        memTotal: memTotal
      };
    } catch (error) {
      // Return fallback values
      return {
        cpu: 0,
        memory: 0,
        gpu: undefined,
        cpuInfo: 'Unknown',
        gpuInfo: undefined,
        memUsed: '0',
        memTotal: '0'
      };
    }
  }

  private getDefaultGPUCores(chipName: string): string {
    if (chipName.includes('M1')) {
      if (chipName.includes('Pro')) return '14-16 cores';
      if (chipName.includes('Max')) return '24-32 cores';
      if (chipName.includes('Ultra')) return '48-64 cores';
      return '7-8 cores';
    } else if (chipName.includes('M2')) {
      if (chipName.includes('Pro')) return '16-19 cores';
      if (chipName.includes('Max')) return '30-38 cores';
      if (chipName.includes('Ultra')) return '60-76 cores';
      return '8-10 cores';
    } else if (chipName.includes('M3')) {
      if (chipName.includes('Pro')) return '14-18 cores';
      if (chipName.includes('Max')) return '30-40 cores';
      return '8-10 cores';
    } else if (chipName.includes('M4')) {
      if (chipName.includes('Pro')) return '16-20 cores';
      if (chipName.includes('Max')) return '32-40 cores';
      return '10 cores';
    }
    return 'GPU';
  }

  private async updateActiveSessionsFromConfig(): Promise<void> {
    try {
      await updateSessionsFromConfig((sessionId, displayName, currentTime, messageCount, topic, model, currentAction, recentMessages) => {
        this.sessionManager.updateSessionFromConfig(
          sessionId,
          displayName,
          currentTime,
          messageCount,
          topic,
          model,
          currentAction,
          recentMessages
        );
      });
    } catch (error) {
      this.log(`Failed to update sessions from config: ${error}`);
    }
  }
  
  private async updateAllViews(): Promise<void> {
    try {
      // Fetch latest data
      const { metrics, dailyUsage, todayProjectCosts } = await this.dataFetcher.fetchCostMetrics();
      this.costMetrics = metrics;
      this.todayProjectCosts = todayProjectCosts || new Map();
      
      const activeSessions = this.sessionManager.getActiveSessions();
      const systemResources = await this.getSystemResources();
      
      // Update all views with proper data
      if (this.costView) {
        this.costView.updateCostDisplay(this.costMetrics, activeSessions);
        this.costView.updateTrendChart(dailyUsage, this.costMetrics);
      }
      
      if (this.sessionsView) {
        this.sessionsView.updateActiveSessionsList(activeSessions, this.costMetrics, this.todayProjectCosts);
      }
      
      if (this.metricsView) {
        await this.metricsView.updateSystemResources(systemResources);
      }
      
      if (this.processesView) {
        await this.processesView.updateHighCpuProcesses(this.dataFetcher.getProcessMonitor());
      }
      
      if (this.sessionBoxesView) {
        this.sessionBoxesView.updateSessionBoxes(activeSessions);
      }
      
      this.screenManager.render();
    } catch (error) {
      this.log(`Update error: ${error}`);
    }
  }

  private log(message: string): void {
    // Simple logging for debugging
    const screen = this.screenManager.getScreen();
    if (screen) {
      screen.debug(message);
    }
  }

  private cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (this.logWatcher) {
      this.logWatcher.stop();
    }
    
    if (this.costView) {
      this.costView.destroy();
    }
    
    if (this.metricsView) {
      this.metricsView.destroy();
    }
    
    if (this.sessionsView) {
      this.sessionsView.destroy();
    }
    
    if (this.processesView) {
      this.processesView.destroy();
    }
    
    if (this.sessionBoxesView) {
      this.sessionBoxesView.destroy();
    }
    
    this.screenManager.destroy();
  }
}