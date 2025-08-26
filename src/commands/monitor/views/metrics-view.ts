import chalk from 'chalk';
import { SystemMetrics } from '../types.js';
import { createMiniBar } from '../utils/formatters.js';

export class MetricsView {
  private metricsBox: any;
  private screenManager: any;
  private grid: any;
  private resourceCache: any = null;

  constructor(screenManager: any, grid: any) {
    this.screenManager = screenManager;
    this.grid = grid;
  }

  initialize(): void {
    const blessed = this.screenManager.getBlessed();
    const screen = this.screenManager.getScreen();
    
    // System Resources box - fixed height 12 lines
    this.metricsBox = blessed.box({
      parent: screen,
      top: 8, // Start below Projects/Sessions (now height 8)
      left: '66%', // Same as Projects/Sessions row
      width: '34%', // 4/12 columns (spans both Projects and Sessions width)
      height: 12, // Fixed height
      label: ' System Resources ',
      border: { type: 'line', fg: 'gray' },
      style: {
        fg: 'white',
        border: { fg: 'gray' }
      },
      padding: {
        left: 1,
        right: 0
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true
    });
  }

  async updateSystemResources(resources: any): Promise<void> {
    if (!this.metricsBox) return;
    
    // Cache the resources
    this.resourceCache = resources;
    
    const resourceDisplay: string[] = [];
    
    // Add empty line at the top
    resourceDisplay.push('');
    
    // Calculate available width for progress bar
    const boxWidth = (this.metricsBox.width as number) || 40;
    const availableWidth = boxWidth - 2 - 1 - 4 - 7;
    const barWidth = Math.max(20, availableWidth);
    
    // CPU section with bar and details
    const cpuBar = createMiniBar(resources.cpu, 100, barWidth);
    resourceDisplay.push(`${chalk.bold('CPU')} ${cpuBar} ${chalk.yellow(resources.cpu.toFixed(1) + '%')}`);
    resourceDisplay.push(chalk.gray(`${resources.cpuInfo}`));
    
    resourceDisplay.push(''); // spacing between CPU and MEM
    
    // Memory section with bar and details
    const memBar = createMiniBar(resources.memory, 100, barWidth);
    resourceDisplay.push(`${chalk.bold('MEM')} ${memBar} ${chalk.cyan(resources.memory.toFixed(1) + '%')}`);
    resourceDisplay.push(chalk.gray(`${resources.memUsed}/${resources.memTotal} GB`));
    
    resourceDisplay.push(''); // spacing between MEM and GPU
    
    // GPU section - always show if gpuInfo exists
    if (resources.gpuInfo) {
      const gpuUsage = resources.gpu || 0;
      const gpuBar = createMiniBar(gpuUsage, 100, barWidth);
      resourceDisplay.push(`${chalk.bold('GPU')} ${gpuBar} ${chalk.magenta(gpuUsage.toFixed(1) + '%')}`);
      resourceDisplay.push(chalk.gray(`${resources.gpuInfo}`));
    }
    
    this.metricsBox.setContent(resourceDisplay.join('\n'));
    this.screenManager.render();
  }

  destroy(): void {
    // Cleanup if needed
  }
}