import chalk from 'chalk';
import Table from 'cli-table3';
import { DailyUsage } from '../types/claude-usage.js';

export class AllDaysUsageDisplay {
  static showAllDaysReport(dailyUsage: DailyUsage[]): void {
    console.log();
    console.log(chalk.bold(`Claude Code Token Usage Report - All Days (${dailyUsage.length} days)`));
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
      // Adjusted column widths for better display
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

    // Process all data
    const allData = dailyUsage;
    
    allData.forEach(day => {
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

    // Add total row for all data
    const totals = allData.reduce((acc, day) => {
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
    
    // Add total row
    table.push([
      chalk.bold('Total'),
      chalk.cyan(totals.sessions.toString()),
      '',
      this.formatNumber(totals.input),
      this.formatNumber(totals.output),
      this.formatNumber(totals.cacheCreate),
      this.formatNumber(totals.cacheRead),
      this.formatNumber(totals.input + totals.output + totals.cacheCreate + totals.cacheRead),
      chalk.green.bold(`$${totals.cost.toFixed(2)}`)
    ]);
    
    console.log(table.toString());
    
    // Show summary
    this.showSummary(allData, totals);
  }

  private static showSummary(allData: DailyUsage[], totals: any): void {
    // Get today and yesterday for comparison using user's timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
    
    const today = formatter.format(new Date());
    const yesterday = formatter.format(new Date(Date.now() - 24 * 60 * 60 * 1000));
    
    const todayUsage = allData.find(d => d.date === today);
    const yesterdayUsage = allData.find(d => d.date === yesterday);
    
    console.log();
    console.log(chalk.bold('Summary'));
    
    // Show all-time stats
    console.log(chalk.gray('All Days:'));
    console.log(`  Total: ${chalk.green.bold(`$${totals.cost.toFixed(2)}`)} (${allData.length} days)`);
    console.log(`  Average per day: ${chalk.yellow(`$${(totals.cost / allData.length).toFixed(2)}`)}`);
    console.log(`  Sessions: ${chalk.cyan(totals.sessions.toString())}`);
    console.log(`  Tokens: ${chalk.cyan(this.formatNumber(totals.input + totals.output + totals.cacheCreate + totals.cacheRead))}`);
    
    console.log();
    // Show today with change from yesterday  
    console.log(chalk.gray('Recent Usage:'));
    if (todayUsage) {
      let todayLine = `  Today (${today}): ${chalk.green(`$${todayUsage.totalCost.toFixed(2)}`)}`;
      
      // Add diff if yesterday exists (git diff style)
      if (yesterdayUsage) {
        const change = todayUsage.totalCost - yesterdayUsage.totalCost;
        const changePercent = yesterdayUsage.totalCost > 0 ? 
          (change / yesterdayUsage.totalCost * 100).toFixed(1) : '∞';
        
        if (change > 0) {
          // Increase
          todayLine += chalk.dim(` (+$${change.toFixed(2)} | +${changePercent}%)`);
        } else if (change < 0) {
          // Decrease
          todayLine += chalk.dim(` (-$${Math.abs(change).toFixed(2)} | ${changePercent}%)`);
        } else {
          todayLine += chalk.dim(` (no change)`);
        }
      }
      console.log(todayLine);
    } else {
      console.log(chalk.gray(`  Today (${today}): No usage`));
    }
    
    if (yesterdayUsage) {
      console.log(`  Yesterday (${yesterday}): ${chalk.cyan(`$${yesterdayUsage.totalCost.toFixed(2)}`)}`);
    } else {
      console.log(chalk.gray(`  Yesterday (${yesterday}): No usage`));
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