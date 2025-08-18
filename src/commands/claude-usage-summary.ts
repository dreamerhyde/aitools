import chalk from 'chalk';
import { DailyUsage } from '../types/claude-usage.js';

export class UsageSummaryDisplay {
  static showSummaryOnly(allData: DailyUsage[], tableData: DailyUsage[], subtotal: any): void {
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
    
    // Calculate totals for ALL data (not just displayed)
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
    
    console.log();
    console.log(chalk.bold('Summary'));
    
    // Show table period vs all-time
    console.log(chalk.gray('Last 7 days:'));
    console.log(`  Total: ${chalk.green.bold(`$${subtotal.cost.toFixed(2)}`)} (${tableData.length} days)`);
    console.log(`  Average per day: ${chalk.yellow(`$${(subtotal.cost / tableData.length).toFixed(2)}`)}`);
    console.log(`  Sessions: ${chalk.cyan(subtotal.sessions.toString())}`);
    console.log(`  Tokens: ${chalk.cyan(this.formatNumber(subtotal.input + subtotal.output + subtotal.cacheCreate + subtotal.cacheRead))}`);
    
    if (allData.length > tableData.length) {
      console.log();
      console.log(chalk.gray('All Available Data:'));
      console.log(`  Total: ${chalk.green.bold(`$${totals.cost.toFixed(2)}`)} (${allData.length} days)`);
      console.log(`  Average per day: ${chalk.yellow(`$${(totals.cost / allData.length).toFixed(2)}`)}`);
      console.log(`  Sessions: ${chalk.cyan(totals.sessions.toString())}`);
      console.log(`  Tokens: ${chalk.cyan(this.formatNumber(totals.input + totals.output + totals.cacheCreate + totals.cacheRead))}`);
    }
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

  private static formatNumber(num: number): string {
    return num.toLocaleString();
  }
}