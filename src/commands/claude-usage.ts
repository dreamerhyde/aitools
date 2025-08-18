import chalk from 'chalk';
import { UIHelper } from '../utils/ui.js';
import { JSONLParser } from '../utils/jsonl-parser.js';
import { UsageAnalyzer } from '../utils/usage-analyzer.js';
import { MockDataGenerator } from '../utils/mock-data-generator.js';
import { DetailedUsageDisplay } from './claude-usage-detailed.js';
import { AllDaysUsageDisplay } from './claude-usage-all-days.js';
import { 
  SessionUsage
} from '../types/claude-usage.js';
import Table from 'cli-table3';
import inquirer from 'inquirer';

export class ClaudeUsageCommand {
  private parser: JSONLParser;
  private analyzer: UsageAnalyzer;

  constructor(logPath?: string, timezone?: string, useDynamicPricing: boolean = true) {
    this.parser = new JSONLParser(logPath, useDynamicPricing);
    this.analyzer = new UsageAnalyzer(timezone);
  }

  async execute(options: any): Promise<void> {
    UIHelper.showHeader();
    console.log(chalk.bold.cyan('Claude Code Usage Analytics'));

    try {
      // Parse all log files
      const spinner = UIHelper.showSpinner('Analyzing Claude usage data...');
      const messages = await this.parser.parseAllLogs(
        options.from ? new Date(options.from) : undefined,
        options.to ? new Date(options.to) : undefined
      );
      
      // Stop spinner and completely clear the line
      spinner.stop();
      if (process.stdout.isTTY) {
        // Clear spinner line completely
        process.stdout.write('\r\x1b[2K');
      }

      if (messages.length === 0) {
        UIHelper.showWarning('No usage data found.');
        console.log();
        const { generateSample } = await inquirer.prompt([{
          type: 'confirm',
          name: 'generateSample',
          message: 'Would you like to generate sample data for demonstration?',
          default: true
        }]);
        
        if (generateSample) {
          const sampleFile = await MockDataGenerator.generateSampleLogs();
          console.log(chalk.green(`✓ Generated sample data at: ${sampleFile}`));
          console.log(chalk.gray('Running analysis on sample data...'));
          console.log();
          
          // Re-parse with sample data
          const sampleMessages = await this.parser.parseAllLogs();
          if (sampleMessages.length > 0) {
            messages.push(...sampleMessages);
          }
        } else {
          return;
        }
      }

      // Interactive mode selection if no specific mode provided
      if (!options.daily && !options.monthly && !options.session && !options.blocks) {
        const { mode } = await inquirer.prompt([{
          type: 'list',
          name: 'mode',
          message: 'Select analysis mode:',
          choices: [
            { name: '📊 Daily Usage', value: 'daily' },
            { name: '📅 Monthly Summary', value: 'monthly' },
            { name: '💬 Session Analysis', value: 'session' },
            { name: '⏱️ Billing Blocks (5-hour windows)', value: 'blocks' },
            { name: '📈 Overall Summary', value: 'summary' },
            { name: '🔄 Live Monitor', value: 'live' }
          ]
        }]);

        switch (mode) {
          case 'daily':
            await this.showDailyUsage(messages, false);
            break;
          case 'monthly':
            await this.showMonthlyUsage(messages);
            break;
          case 'session':
            await this.showSessionUsage(messages);
            break;
          case 'blocks':
            await this.showBillingBlocks(messages, options.live);
            break;
          case 'summary':
            await this.showSummary(messages);
            break;
          case 'live':
            await this.showLiveMonitor();
            break;
        }
      } else {
        // Execute specific mode
        if (options.daily) await this.showDailyUsage(messages, options.showDetail || false);
        if (options.monthly) await this.showMonthlyUsage(messages);
        if (options.session) await this.showSessionUsage(messages);
        if (options.blocks) await this.showBillingBlocks(messages, options.live);
      }
    } catch (error: any) {
      UIHelper.showError(`Failed to analyze usage: ${error.message}`);
      if (process.env.DEBUG) {
        console.error('Stack trace:', error.stack);
      }
      process.exit(1);
    }
  }

  private async showDailyUsage(messages: any[], showDetail: boolean = false): Promise<void> {
    const dailyUsage = this.analyzer.analyzeDailyUsage(messages);
    
    if (showDetail) {
      // Show full table with ALL days
      AllDaysUsageDisplay.showAllDaysReport(dailyUsage);
    } else {
      // Show chart and summary only
      DetailedUsageDisplay.showChartAndSummary(dailyUsage);
    }
  }

  private async showMonthlyUsage(messages: any[]): Promise<void> {
    const monthlyUsage = this.analyzer.analyzeMonthlyUsage(messages);
    
    console.log();
    console.log(chalk.bold('Monthly Usage Summary'));
    console.log('─'.repeat(50));

    const table = new Table({
      head: ['Month', 'Total Cost', 'Tokens', 'Days Active', 'Avg Daily'],
      colWidths: [10, 12, 15, 12, 12],
      style: { head: ['cyan'] }
    });

    Array.from(monthlyUsage.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([month, usage]) => {
        const avgDaily = usage.totalCost / Math.max(1, usage.days);
        
        table.push([
          month,
          chalk.green(`$${usage.totalCost.toFixed(2)}`),
          this.formatNumber(usage.totalTokens),
          usage.days.toString(),
          chalk.yellow(`$${avgDaily.toFixed(2)}`)
        ]);
      });

    console.log(table.toString());
    
    // Model breakdown for current month
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentMonthUsage = monthlyUsage.get(currentMonth);
    
    if (currentMonthUsage) {
      console.log();
      console.log(chalk.bold(`Current Month (${currentMonth}) Model Breakdown:`));
      console.log('─'.repeat(50));
      
      const modelTable = new Table({
        head: ['Model', 'Messages', 'Tokens', 'Cost'],
        colWidths: [30, 12, 15, 12],
        style: { head: ['cyan'] }
      });
      
      Array.from(currentMonthUsage.modelBreakdown.values())
        .sort((a, b) => b.cost - a.cost)
        .forEach(model => {
          modelTable.push([
            this.formatModelName(model.model),
            model.count.toString(),
            this.formatNumber(model.inputTokens + model.outputTokens),
            chalk.green(`$${model.cost.toFixed(4)}`)
          ]);
        });
      
      console.log(modelTable.toString());
    }
  }

  private async showSessionUsage(messages: any[]): Promise<void> {
    const sessions = this.analyzer.analyzeSessionUsage(messages);
    
    console.log();
    console.log(chalk.bold('Session Analysis'));
    console.log('─'.repeat(50));

    // Interactive session selection
    const { selectedSessions } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedSessions',
      message: 'Select sessions to view details:',
      choices: sessions.slice(0, 20).map(session => ({
        name: `${session.title || session.conversationId.slice(0, 8)} - ${
          chalk.green(`$${session.totalCost.toFixed(4)}`)
        } - ${new Date(session.startTime).toLocaleString()}`,
        value: session
      })),
      pageSize: 10
    }]);

    if (selectedSessions.length > 0) {
      console.log();
      console.log(chalk.bold('Session Details'));
      console.log('─'.repeat(50));

      selectedSessions.forEach((session: SessionUsage) => {
        console.log();
        console.log(chalk.yellow(`▸ ${session.title || session.conversationId}`));
        console.log(`  Start: ${new Date(session.startTime).toLocaleString()}`);
        console.log(`  End: ${new Date(session.endTime).toLocaleString()}`);
        console.log(`  Duration: ${this.formatDuration(session.endTime.getTime() - session.startTime.getTime())}`);
        console.log(`  Messages: ${session.messageCount}`);
        console.log(`  Tokens: ${this.formatNumber(session.totalTokens)}`);
        console.log(`  Cost: ${chalk.green(`$${session.totalCost.toFixed(4)}`)}`);
        console.log(`  Models: ${session.models.map(m => this.formatModelName(m)).join(', ')}`);
      });
    }
  }

  private async showBillingBlocks(messages: any[], live: boolean = false): Promise<void> {
    const blocks = this.analyzer.analyzeBillingBlocks(messages, 5);
    
    console.log();
    console.log(chalk.bold('5-Hour Billing Blocks'));
    console.log('─'.repeat(50));

    const table = new Table({
      head: ['Block Start', 'Status', 'Sessions', 'Tokens', 'Cost'],
      colWidths: [20, 10, 10, 15, 12],
      style: { head: ['cyan'] }
    });

    blocks.slice(0, 10).forEach(block => {
      const status = block.isActive ? chalk.green('● Active') : chalk.gray('○ Closed');
      
      table.push([
        new Date(block.startTime).toLocaleString(),
        status,
        block.sessions.length.toString(),
        this.formatNumber(block.totalTokens),
        chalk.green(`$${block.totalCost.toFixed(4)}`)
      ]);
    });

    console.log(table.toString());

    // Show current active block details
    const activeBlock = blocks.find(b => b.isActive);
    if (activeBlock) {
      console.log();
      console.log(chalk.bold.green('Current Active Block'));
      console.log('─'.repeat(50));
      console.log(`Started: ${new Date(activeBlock.startTime).toLocaleString()}`);
      console.log(`Expires: ${new Date(activeBlock.endTime).toLocaleString()}`);
      console.log(`Time remaining: ${this.formatDuration(activeBlock.endTime.getTime() - Date.now())}`);
      console.log(`Current cost: ${chalk.green(`$${activeBlock.totalCost.toFixed(4)}`)}`);
      console.log(`Active sessions: ${activeBlock.sessions.length}`);
    }

    if (live) {
      console.log();
      console.log(chalk.yellow('Live monitoring mode - Press Ctrl+C to exit'));
      // TODO: Implement live monitoring with file watching
    }
  }

  private async showSummary(messages: any[]): Promise<void> {
    const summary = this.analyzer.generateSummary(messages);
    
    console.log();
    console.log(chalk.bold('Overall Usage Summary'));
    console.log('─'.repeat(50));
    
    console.log(`Period: ${summary.dateRange.start.toLocaleDateString()} - ${summary.dateRange.end.toLocaleDateString()}`);
    console.log(`Total Cost: ${chalk.green.bold(`$${summary.totalCost.toFixed(2)}`)}`);
    console.log(`Total Tokens: ${chalk.cyan(this.formatNumber(summary.totalTokens))}`);
    console.log(`Total Conversations: ${summary.totalConversations}`);
    console.log(`Most Used Model: ${this.formatModelName(summary.topModel)}`);
    console.log(`Average Daily Cost: ${chalk.yellow(`$${summary.averageDailyCost.toFixed(2)}`)}`);
    
    // Cost projection
    const daysInMonth = 30;
    const projectedMonthlyCost = summary.averageDailyCost * daysInMonth;
    console.log(`Projected Monthly: ${chalk.magenta(`$${projectedMonthlyCost.toFixed(2)}`)}`);
  }

  private async showLiveMonitor(): Promise<void> {
    console.log();
    console.log(chalk.bold.yellow('Live Usage Monitor'));
    console.log('─'.repeat(50));
    console.log(chalk.gray('Monitoring Claude usage in real-time...'));
    console.log(chalk.gray('Press Ctrl+C to exit'));
    
    // TODO: Implement file watching and live updates
    setInterval(async () => {
      // Refresh and show current stats
      process.stdout.write('\x1Bc'); // Clear console
      UIHelper.showHeader();
      console.log(chalk.bold.cyan('Claude Usage Analytics - Live Mode'));
      console.log('─'.repeat(50));
      
      const messages = await this.parser.parseAllLogs();
      const blocks = this.analyzer.analyzeBillingBlocks(messages, 5);
      const activeBlock = blocks.find(b => b.isActive);
      
      if (activeBlock) {
        console.log(chalk.green('● Active Billing Block'));
        console.log(`Time remaining: ${this.formatDuration(activeBlock.endTime.getTime() - Date.now())}`);
        console.log(`Current cost: ${chalk.green(`$${activeBlock.totalCost.toFixed(4)}`)}`);
        console.log(`Tokens used: ${this.formatNumber(activeBlock.totalTokens)}`);
      }
      
      console.log();
      console.log(chalk.gray('Last updated: ' + new Date().toLocaleTimeString()));
    }, 5000);
  }

  private formatNumber(num: number): string {
    return num.toLocaleString();
  }

  private formatModelName(model: string): string {
    // Format model names like ccusage - Prioritize Claude 4 models
    const modelLower = model.toLowerCase();
    
    // Claude 4 models (highest priority)
    if (modelLower.includes('claude-4-opus') || modelLower.includes('opus-4') || modelLower.includes('opus_4')) return 'opus-4';
    if (modelLower.includes('claude-4-sonnet') || modelLower.includes('sonnet-4') || modelLower.includes('sonnet_4')) return 'sonnet-4';
    
    // Claude 3.5 models
    if (modelLower.includes('claude-3-5-sonnet')) return 'sonnet-3.5';
    if (modelLower.includes('claude-3-5-haiku') || modelLower.includes('haiku-3.5')) return 'haiku-3.5';
    
    // Legacy Claude 3 models
    if (modelLower.includes('opus') && !modelLower.includes('4')) return 'opus-3';
    if (modelLower.includes('sonnet') && !modelLower.includes('4') && !modelLower.includes('3-5')) return 'sonnet-3';
    if (modelLower.includes('haiku') && !modelLower.includes('3.5') && !modelLower.includes('3-5')) return 'haiku-3';
    
    return model;
  }

  private formatDuration(ms: number): string {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}