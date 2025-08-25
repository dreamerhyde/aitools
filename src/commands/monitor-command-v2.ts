import { ProcessMonitor } from '../utils/process-monitor.js';
import { JSONLParser } from '../utils/jsonl-parser.js';
import { UsageAnalyzer } from '../utils/usage-analyzer.js';
import { formatCost, formatNumber } from '../utils/formatters.js';
import chalk from 'chalk';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ActiveSession {
  user: string;
  startTime: Date;
  lastActivity: Date;
  messageCount: number;
  currentTopic?: string;
}

interface ConversationMessage {
  timestamp: Date;
  user: string;
  role: 'user' | 'assistant';
  preview: string;
  tokens?: number;
}

export class MonitorCommandV2 {
  private screen: any = null;
  private grid: any = null;
  private costTodayBox: any = null;
  private costChartBox: any = null;
  private sessionsBox: any = null;
  private activeNowBox: any = null;
  private conversationStream: any = null;
  private statusBar: any = null;
  
  private jsonParser: JSONLParser;
  private usageAnalyzer: UsageAnalyzer;
  private updateInterval: NodeJS.Timeout | null = null;
  
  private activeSessions: Map<string, ActiveSession> = new Map();
  private conversationBuffer: ConversationMessage[] = [];
  private todayCost: number = 0;
  private weekCosts: number[] = []; // Last 7 days
  
  private blessed: any;
  private contrib: any;

  constructor() {
    this.jsonParser = new JSONLParser(undefined, true, true);
    this.usageAnalyzer = new UsageAnalyzer();
  }

  async execute(): Promise<void> {
    // Check TTY environment
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
      console.error(chalk.red('Error: Monitor requires an interactive terminal'));
      console.error(chalk.cyan('Alternative: Use "aitools cost today" for CLI output'));
      process.exit(1);
    }

    // Import blessed libraries
    try {
      this.blessed = await import('blessed');
      this.contrib = await import('blessed-contrib');
    } catch (error) {
      console.error(chalk.red('Error: TUI libraries not available'));
      console.error(chalk.yellow('Run: bun add blessed blessed-contrib'));
      process.exit(1);
    }

    this.initializeScreen();
    this.createLayout();
    this.setupEventHandlers();
    await this.startMonitoring();
  }

  private initializeScreen(): void {
    this.screen = this.blessed.screen({
      smartCSR: true,
      title: 'AI Tools Monitor - Live Session Tracker',
      fullUnicode: true,
      dockBorders: true,
      warnings: false,
      mouse: false,
      terminal: process.env.TERM || 'xterm-256color',
      autoPadding: false
    });

    // Create responsive grid
    this.grid = new this.contrib.grid({
      rows: 12,
      cols: 12,
      screen: this.screen
    });
  }

  private createLayout(): void {
    // Top: Big cost display (0,0) -> (2,12)
    this.costTodayBox = this.grid.set(0, 0, 2, 12, this.blessed.box, {
      label: ' Today\'s Spend ',
      border: { type: 'line', fg: 'green' },
      style: {
        fg: 'white',
        border: { fg: 'green' }
      },
      align: 'center',
      valign: 'middle'
    });

    // Left: Cost chart (2,0) -> (6,4)
    this.costChartBox = this.grid.set(2, 0, 4, 4, this.contrib.bar, {
      label: ' 7-Day Trend ',
      barWidth: 4,
      barSpacing: 2,
      xOffset: 0,
      maxHeight: 10,
      border: { type: 'line', fg: 'cyan' },
      style: {
        fg: 'cyan',
        border: { fg: 'cyan' }
      }
    });

    // Middle: Session stats (2,4) -> (6,8)
    this.sessionsBox = this.grid.set(2, 4, 4, 4, this.blessed.box, {
      label: ' Session Stats ',
      border: { type: 'line', fg: 'yellow' },
      style: {
        fg: 'white',
        border: { fg: 'yellow' }
      },
      padding: 1
    });

    // Right: Active sessions (2,8) -> (6,12)
    this.activeNowBox = this.grid.set(2, 8, 4, 4, this.blessed.list, {
      label: ' Active Now ',
      border: { type: 'line', fg: 'magenta' },
      style: {
        fg: 'white',
        border: { fg: 'magenta' },
        selected: {
          bg: 'blue'
        }
      },
      keys: true,
      vi: true,
      mouse: false
    });

    // Bottom: Conversation stream (6,0) -> (12,12)
    this.conversationStream = this.grid.set(6, 0, 6, 12, this.blessed.log, {
      label: ' Live Conversation Stream ',
      border: { type: 'line', fg: 'blue' },
      style: {
        fg: 'white',
        border: { fg: 'blue' }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: false,
      keys: true,
      vi: true,
      padding: { left: 1 }
    });

    // Status bar at absolute bottom
    this.statusBar = this.blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: ' [q] Quit  [r] Refresh  [c] Clear Stream  [↑↓] Scroll ',
      style: { fg: 'cyan' },
      tags: true
    });

    this.screen.render();
  }

  private setupEventHandlers(): void {
    // Quit
    this.screen.key(['q', 'C-c'], () => {
      this.cleanup();
      process.exit(0);
    });

    // Refresh
    this.screen.key(['r'], async () => {
      await this.updateAllData();
      this.addToStream('System', 'Manual refresh triggered');
    });

    // Clear stream
    this.screen.key(['c'], () => {
      this.conversationBuffer = [];
      this.conversationStream.setContent('');
      this.addToStream('System', 'Stream cleared');
      this.screen.render();
    });

    // Focus navigation
    this.screen.key(['tab'], () => {
      if (this.screen.focused === this.activeNowBox) {
        this.conversationStream.focus();
      } else {
        this.activeNowBox.focus();
      }
    });
  }

  private async startMonitoring(): Promise<void> {
    // Initial load
    await this.updateAllData();
    
    // Start watching log file for real-time updates
    this.watchLogFile();
    
    // Update stats every 5 seconds
    this.updateInterval = setInterval(async () => {
      await this.updateCostData();
      await this.updateSessionData();
      this.updateActiveSessionsList();
      this.screen.render();
    }, 5000);
  }

  private async updateAllData(): Promise<void> {
    await this.updateCostData();
    await this.updateSessionData();
    this.updateActiveSessionsList();
    this.screen.render();
  }

  private async updateCostData(): Promise<void> {
    try {
      const messages = await this.jsonParser.parseAllLogs();
      const dailyUsage = this.usageAnalyzer.analyzeDailyUsage(messages);
      
      // Get today's cost
      const today = new Date().toISOString().split('T')[0];
      const todayData = dailyUsage.find(d => d.date === today);
      this.todayCost = todayData?.totalCost || 0;
      
      // Update big number display
      this.costTodayBox.setContent(
        `\n${chalk.bold.green('$' + this.todayCost.toFixed(2))}\n` +
        `${todayData?.sessions || 0} sessions | ${formatNumber(todayData?.totalTokens || 0)} tokens`
      );
      
      // Get last 7 days for chart
      const last7Days = dailyUsage.slice(-7);
      this.weekCosts = last7Days.map(d => d.totalCost);
      
      // Update chart
      const chartData = {
        titles: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].slice(-last7Days.length),
        data: this.weekCosts.map(cost => Math.round(cost * 10) / 10)
      };
      this.costChartBox.setData(chartData);
      
    } catch (error) {
      this.costTodayBox.setContent('\nError loading cost data');
    }
  }

  private async updateSessionData(): Promise<void> {
    try {
      const messages = await this.jsonParser.parseAllLogs();
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Filter messages
      const todayMessages = messages.filter(m => m.timestamp.startsWith(today));
      const weekMessages = messages.filter(m => new Date(m.timestamp) >= weekAgo);
      
      // Calculate stats
      const todaySessions = new Set(todayMessages.map(m => m.sessionId || 'unknown')).size;
      const weekSessions = new Set(weekMessages.map(m => m.sessionId || 'unknown')).size;
      const avgPerDay = weekSessions / 7;
      
      // Token stats
      const todayTokens = todayMessages.reduce((sum, m) => 
        sum + (m.usage?.input || 0) + (m.usage?.output || 0), 0
      );
      
      // Update display
      this.sessionsBox.setContent([
        `Today:     ${todaySessions} sessions`,
        `Week:      ${weekSessions} total`,
        `Average:   ${avgPerDay.toFixed(1)}/day`,
        '',
        `Tokens:    ${formatNumber(todayTokens)}`,
        `Avg/sess:  ${todaySessions > 0 ? formatNumber(Math.round(todayTokens / todaySessions)) : '0'}`
      ].join('\n'));
      
    } catch (error) {
      this.sessionsBox.setContent('Error loading sessions');
    }
  }

  private updateActiveSessionsList(): void {
    const now = new Date();
    const activeList: string[] = [];
    
    // Remove inactive sessions (no activity for 5 minutes)
    for (const [id, session] of this.activeSessions) {
      const inactiveMinutes = (now.getTime() - session.lastActivity.getTime()) / 60000;
      if (inactiveMinutes > 5) {
        this.activeSessions.delete(id);
      } else {
        const duration = Math.round((now.getTime() - session.startTime.getTime()) / 60000);
        const status = inactiveMinutes < 1 ? '●' : '○';
        activeList.push(`${status} ${session.user} (${duration}m) - ${session.messageCount} msgs`);
      }
    }
    
    if (activeList.length === 0) {
      activeList.push('No active sessions');
    }
    
    this.activeNowBox.setItems(activeList);
  }

  private async watchLogFile(): Promise<void> {
    try {
      const logFiles = await this.jsonParser.findLogFiles();
      if (logFiles.length === 0) {
        this.addToStream('System', 'No Claude log files found');
        return;
      }
      
      // Watch the most recent log file
      const logPath = logFiles[logFiles.length - 1];
      const tail = spawn('tail', ['-f', logPath]);
      
      tail.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            try {
              const entry = JSON.parse(line);
              this.processLogEntry(entry);
            } catch {
              // Not valid JSON
            }
          }
        });
      });
      
      this.addToStream('System', `Monitoring: ${path.basename(logPath)}`);
    } catch (error) {
      this.addToStream('System', `Failed to watch logs: ${error}`);
    }
  }

  private processLogEntry(entry: any): void {
    const now = new Date();
    const sessionId = entry.sessionId || 'unknown';
    const role = entry.type === 'request' ? 'user' : 'assistant';
    
    // Track active session
    if (!this.activeSessions.has(sessionId)) {
      this.activeSessions.set(sessionId, {
        user: `User${this.activeSessions.size + 1}`,
        startTime: now,
        lastActivity: now,
        messageCount: 0,
        currentTopic: entry.request?.messages?.[0]?.content?.substring(0, 50)
      });
    }
    
    const session = this.activeSessions.get(sessionId)!;
    session.lastActivity = now;
    session.messageCount++;
    
    // Add to conversation stream
    if (entry.request?.messages?.length > 0) {
      const content = entry.request.messages[0].content;
      const preview = content.length > 80 ? 
        content.substring(0, 77) + '...' : content;
      
      this.addToStream(session.user, preview, role);
    }
    
    // Update displays
    this.updateActiveSessionsList();
    this.screen.render();
  }

  private addToStream(user: string, message: string, role: 'user' | 'assistant' | 'system' = 'system'): void {
    const timestamp = new Date().toLocaleTimeString();
    const roleColor = role === 'user' ? 'cyan' : 
                     role === 'assistant' ? 'green' : 'yellow';
    
    const formatted = `[${timestamp}] ${chalk[roleColor](user)}: ${message}`;
    this.conversationStream.log(formatted);
    
    // Keep buffer for potential export
    this.conversationBuffer.push({
      timestamp: new Date(),
      user,
      role: role as any,
      preview: message
    });
    
    // Limit buffer size
    if (this.conversationBuffer.length > 1000) {
      this.conversationBuffer = this.conversationBuffer.slice(-500);
    }
  }

  private cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (this.screen) {
      try {
        this.screen.leave();
        this.screen.destroy();
      } catch (error) {
        // Ignore cleanup errors
      } finally {
        this.screen = null;
      }
    }
    
    // Reset terminal
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[?1049l'); // Exit alternate buffer
      process.stdout.write('\x1b[?25h');   // Show cursor
      process.stdout.write('\x1b[0m');     // Reset colors
    }
  }
}