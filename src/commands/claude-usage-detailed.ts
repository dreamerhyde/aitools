import chalk from 'chalk';
import Table from 'cli-table3';
import { DailyUsage } from '../types/claude-usage.js';
import { UsageSummaryDisplay } from './claude-usage-summary.js';

export class DetailedUsageDisplay {
  static showChartAndSummary(dailyUsage: DailyUsage[]): void {
    // Process all data
    const allData = dailyUsage;
    
    // Get last 7 days for summary calculations
    const tableData = dailyUsage.slice(-7);
    
    // Calculate totals for table period
    const subtotal = tableData.reduce((acc, day) => {
      let dayInput = 0, dayOutput = 0, dayCacheCreate = 0, dayCacheRead = 0;
      
      day.modelBreakdown.forEach(model => {
        dayInput += model.inputTokens;
        dayOutput += model.outputTokens;
        dayCacheCreate += model.cacheCreation;
        dayCacheRead += model.cacheRead;
      });
      
      return {
        cost: acc.cost + day.totalCost,
        input: acc.input + dayInput,
        output: acc.output + dayOutput,
        cacheCreate: acc.cacheCreate + dayCacheCreate,
        cacheRead: acc.cacheRead + dayCacheRead,
        tokens: acc.tokens + day.totalTokens,
        sessions: acc.sessions + day.conversations
      };
    }, { cost: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, tokens: 0, sessions: 0 });
    
    // Show cost chart first
    const chartData = this.generateContinuous30Days(allData);
    if (chartData.length > 1) {
      this.showCostChart(chartData);
    }
    
    // Show summary using new class
    UsageSummaryDisplay.showSummaryOnly(allData, tableData, subtotal);
  }

  static showDetailedDailyReport(dailyUsage: DailyUsage[]): void {
    console.log();
    console.log(chalk.bold('Claude Code Token Usage Report - Daily (Last 7 days)'));
    console.log(chalk.dim('─'.repeat(process.stdout.columns || 88)));

    const table = new Table({
      head: [
        'Date', 
        'Sessions',
        'Models',
        'Input', 
        'Output', 
        'Cache Create',
        'Cache Read',
        'Total Tokens',
        'Cost (USD)'
      ],
      colWidths: [12, 10, 18, 10, 10, 13, 13, 13, 12],
      style: { 
        head: ['cyan'],
        border: ['gray']
      },
      chars: {
        'top': '─',
        'top-mid': '┬',
        'top-left': '┌',
        'top-right': '┐',
        'bottom': '─',
        'bottom-mid': '┴',
        'bottom-left': '└',
        'bottom-right': '┘',
        'left': '│',
        'left-mid': '├',
        'mid': '─',
        'mid-mid': '┼',
        'right': '│',
        'right-mid': '┤',
        'middle': '│'
      }
    });

    // Process all data for subtotal
    const allData = dailyUsage;
    
    // Get last 7 days for table display
    const tableData = dailyUsage.slice(-7);
    
    tableData.forEach(day => {
      // Aggregate token counts by type
      let totalInput = 0, totalOutput = 0, totalCacheCreate = 0, totalCacheRead = 0;
      const modelNames: string[] = [];
      
      day.modelBreakdown.forEach((model, modelName) => {
        totalInput += model.inputTokens;
        totalOutput += model.outputTokens;
        totalCacheCreate += model.cacheCreation;
        totalCacheRead += model.cacheRead;
        
        // Format model name and filter out synthetic models
        const formattedName = this.formatModelNameShort(modelName);
        if (formattedName !== '<synthetic>' && !modelNames.includes(formattedName)) {
          modelNames.push(formattedName);
        }
      });
      
      const totalTokens = totalInput + totalOutput + totalCacheCreate + totalCacheRead;
      
      table.push([
        day.date,
        chalk.cyan(day.conversations.toString()),
        modelNames.map(m => `- ${m}`).join('\n'),
        this.formatNumber(totalInput),
        this.formatNumber(totalOutput),
        this.formatNumber(totalCacheCreate),
        this.formatNumber(totalCacheRead),
        this.formatNumber(totalTokens),
        chalk.green(`$${day.totalCost.toFixed(2)}`)
      ]);
    });

    // Add subtotal row for displayed period
    const subtotal = tableData.reduce((acc, day) => {
      let dayInput = 0, dayOutput = 0, dayCacheCreate = 0, dayCacheRead = 0;
      
      day.modelBreakdown.forEach(model => {
        dayInput += model.inputTokens;
        dayOutput += model.outputTokens;
        dayCacheCreate += model.cacheCreation;
        dayCacheRead += model.cacheRead;
      });
      
      return {
        cost: acc.cost + day.totalCost,
        input: acc.input + dayInput,
        output: acc.output + dayOutput,
        cacheCreate: acc.cacheCreate + dayCacheCreate,
        cacheRead: acc.cacheRead + dayCacheRead,
        tokens: acc.tokens + day.totalTokens,
        sessions: acc.sessions + day.conversations
      };
    }, { cost: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, tokens: 0, sessions: 0 });
    
    // Add subtotal row
    table.push([
      chalk.bold('Subtotal'),
      chalk.cyan(subtotal.sessions.toString()),
      '',
      this.formatNumber(subtotal.input),
      this.formatNumber(subtotal.output),
      this.formatNumber(subtotal.cacheCreate),
      this.formatNumber(subtotal.cacheRead),
      this.formatNumber(subtotal.input + subtotal.output + subtotal.cacheCreate + subtotal.cacheRead),
      chalk.green.bold(`$${subtotal.cost.toFixed(2)}`)
    ]);
    
    console.log(table.toString());
    
    // Show summary using new class
    UsageSummaryDisplay.showSummaryOnly(allData, tableData, subtotal);
    
    // Show cost chart - generate continuous 30 days including gaps
    const chartData = this.generateContinuous30Days(allData);
    
    if (chartData.length > 1) {
      this.showCostChart(chartData);
    }
  }

  /**
   * Generate continuous 30 days of data, filling gaps with empty entries
   */
  private static generateContinuous30Days(allData: DailyUsage[]): DailyUsage[] {
    const result: DailyUsage[] = [];
    const today = new Date();
    
    // Create a map for quick lookup of existing data
    const dataMap = new Map<string, DailyUsage>();
    allData.forEach(day => {
      dataMap.set(day.date, day);
    });
    
    // Generate 30 consecutive days ending today
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // Format date using user's timezone
      const formatter = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      const dateStr = formatter.format(date);
      
      if (dataMap.has(dateStr)) {
        // Use existing data
        result.push(dataMap.get(dateStr)!);
      } else {
        // Create empty entry for missing day
        result.push({
          date: dateStr,
          totalCost: 0,
          totalTokens: 0,
          conversations: 0,
          modelBreakdown: new Map()
        });
      }
    }
    
    return result;
  }
  
  static showCostChart(dailyUsage: DailyUsage[]): void {
    // Calculate totals and averages for the chart period (30 days)
    const chartTotals = dailyUsage.reduce((acc, day) => ({
      cost: acc.cost + day.totalCost,
      tokens: acc.tokens + day.totalTokens
    }), { cost: 0, tokens: 0 });
    
    const avgCost = chartTotals.cost / 30;
    const avgTokens = chartTotals.tokens / 30;
    
    // Get month info for header
    const firstMonth = dailyUsage[0]?.date.substring(5, 7);
    const lastMonth = dailyUsage[dailyUsage.length - 1]?.date.substring(5, 7);
    
    console.log();
    if (firstMonth === lastMonth) {
      console.log(chalk.bold(`Daily Cost Trend (Month: ${firstMonth}) - 30 Days: `) + chalk.green.bold(`$${chartTotals.cost.toFixed(2)}`) + chalk.bold(` | `) + chalk.cyan(`${this.formatNumber(chartTotals.tokens)} tokens`));
    } else {
      console.log(chalk.bold(`Daily Cost Trend (Months: ${firstMonth}-${lastMonth}) - 30 Days: `) + chalk.green.bold(`$${chartTotals.cost.toFixed(2)}`) + chalk.bold(` | `) + chalk.cyan(`${this.formatNumber(chartTotals.tokens)} tokens`));
    }
    console.log(chalk.gray(`Average per day: `) + chalk.green(`$${avgCost.toFixed(2)}`) + chalk.gray(` | `) + chalk.cyan(`${this.formatNumber(Math.round(avgTokens))} tokens`));
    console.log();
    
    // Find max cost for scaling (ensure it's not zero)
    const maxCost = Math.max(1, Math.max(...dailyUsage.map(d => d.totalCost)));
    const chartHeight = 10;
    const chartWidth = Math.min(dailyUsage.length * 3, 120); // Increase limit for 30 days
    
    // Create chart
    const chart: string[][] = [];
    for (let i = 0; i < chartHeight; i++) {
      chart[i] = new Array(chartWidth).fill(' ');
    }
    
    // Draw bars
    dailyUsage.forEach((day, index) => {
      const barHeight = Math.ceil((day.totalCost / maxCost) * (chartHeight - 1));
      const x = index * 3;
      
      for (let y = 0; y < barHeight; y++) {
        const chartY = chartHeight - 1 - y;
        if (x < chartWidth) {
          // Choose color based on cost
          let barChar = '█';
          if (day.totalCost > maxCost * 0.8) {
            barChar = chalk.red('█');
          } else if (day.totalCost > maxCost * 0.5) {
            barChar = chalk.yellow('█');
          } else {
            barChar = chalk.green('█');
          }
          chart[chartY][x] = barChar;
          if (x + 1 < chartWidth) chart[chartY][x + 1] = barChar;
        }
      }
    });
    
    // Print Y-axis labels and chart
    for (let i = 0; i < chartHeight; i++) {
      const value = ((chartHeight - i) / chartHeight * maxCost).toFixed(0);
      const label = `$${value.padStart(4)}`;
      console.log(chalk.gray(label) + chalk.dim(' │') + chart[i].join(''));
    }
    
    // Print X-axis (shifted right to align with dates)
    console.log(chalk.dim('      └' + '─'.repeat(Math.min(chartWidth, 120))));
    
    // Show day numbers aligned with bars (slightly shifted right for better centering)
    const dateRow = '       '; // 7 spaces for Y-axis alignment (one extra for shift)
    
    // Create array to hold exact character positions
    const dateChars: string[] = new Array(chartWidth + 1).fill(' ');
    
    dailyUsage.forEach((day, index) => {
      const x = index * 3;
      if (x < chartWidth) {
        const dayNum = day.date.substring(8, 10);
        // Shift dates slightly to the right (add 1 to position)
        // This centers the date better under the 2-char wide bar
        if (x < dateChars.length) {
          dateChars[x] = dayNum[0];
        }
        if (x + 1 < dateChars.length) {
          dateChars[x + 1] = dayNum[1];
        }
      }
    });
    
    console.log(chalk.gray(dateRow + dateChars.join('')));
    
    // Print legend
    console.log();
    console.log(chalk.gray('Legend: ') + 
      chalk.green('■') + ' Low  ' +
      chalk.yellow('■') + ' Medium  ' +
      chalk.red('■') + ' High');
    
    // Clear any remaining spinner artifacts
    if (process.stdout.isTTY) {
      process.stdout.write('\u001b[?25h'); // Show cursor
    }
  }

  private static formatModelNameShort(model: string): string {
    // Filter out synthetic models
    if (model === '<synthetic>') return '<synthetic>';
    
    const modelLower = model.toLowerCase();
    if (modelLower.includes('opus-4') || modelLower.includes('opus_4')) return 'opus-4';
    if (modelLower.includes('sonnet-4') || modelLower.includes('sonnet_4')) return 'sonnet-4';
    if (modelLower.includes('claude-3-5-sonnet')) return 'sonnet-4';
    if (modelLower.includes('haiku') && modelLower.includes('3-5')) return 'haiku-3.5';
    if (modelLower.includes('opus') && !modelLower.includes('4')) return 'opus-3';
    if (modelLower.includes('sonnet') && !modelLower.includes('4')) return 'sonnet-3';
    return model;
  }

  private static formatNumber(num: number): string {
    return num.toLocaleString();
  }
}