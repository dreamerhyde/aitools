import { ProcessMonitor } from '../utils/process-monitor.js';
import { JSONLParser } from '../utils/jsonl-parser.js';
import { UsageAnalyzer } from '../utils/usage-analyzer.js';
import { formatCost, formatNumber } from '../utils/formatters.js';
import chalk from 'chalk';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as figlet from 'figlet';

interface SessionInfo {
  sessionId: string;
  user: string;
  startTime: Date;
  lastActivity: Date;
  messageCount: number;
  recentMessages: ConversationMessage[];
  currentTopic?: string;
}

interface ConversationMessage {
  timestamp: Date;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
}

interface CostMetrics {
  today: number;
  todayTokens: number;
  todaySessions: number;
  week: number;
  weekSessions: number;
  weekCosts: number[];
}

export class MonitorCommand {
  private screen: any = null;
  private grid: any = null;
  private costTrendChart: any = null;
  private costBox: any = null;
  private metricsBox: any = null;
  private activeSessionsBox: any = null;
  private sessionBoxes: Map<string, any> = new Map();
  private processMonitor: ProcessMonitor;
  private jsonParser: JSONLParser;
  private usageAnalyzer: UsageAnalyzer;
  private updateInterval: NodeJS.Timeout | null = null;
  private activeSessions: Map<string, SessionInfo> = new Map();
  private costMetrics: CostMetrics | null = null;
  private blessed: any;
  private contrib: any;
  private currentFontIndex: number = 0;
  private allFonts: figlet.Fonts[] = [];
  
  // We'll load all available fonts dynamically

  constructor() {
    this.processMonitor = new ProcessMonitor();
    this.jsonParser = new JSONLParser(undefined, true, true); // silent mode for TUI
    this.usageAnalyzer = new UsageAnalyzer();
    
    // Load all available figlet fonts
    this.loadAllFonts();
  }
  
  private loadAllFonts(): void {
    // Fixed to use DOS Rebel font only
    this.allFonts = ['DOS Rebel'];
  }

  async execute(): Promise<void> {
    // Check if running in a proper TTY environment
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
      console.error(chalk.red('Error: Monitor mode requires an interactive terminal (TTY)'));
      console.error(chalk.yellow('This command cannot run in:'));
      console.error(chalk.yellow('- Piped output (e.g., aitools monitor | grep ...)'));
      console.error(chalk.yellow('- Non-interactive shells'));
      console.error(chalk.yellow('- CI/CD environments'));
      console.error('');
      console.error(chalk.cyan('Alternative: Use "aitools list --hooks" for non-interactive output'));
      process.exit(1);
    }

    // Check terminal capabilities
    const term = process.env.TERM || '';
    if (!term || term === 'dumb') {
      console.error(chalk.red('Error: Terminal does not support TUI features'));
      console.error(chalk.yellow(`Current TERM: ${term || '(not set)'}`));
      console.error(chalk.cyan('Try setting: export TERM=xterm-256color'));
      process.exit(1);
    }

    // Dynamically import blessed to avoid bundling issues
    try {
      this.blessed = await import('blessed');
      this.contrib = await import('blessed-contrib');
    } catch (error) {
      console.error(chalk.red('Error: blessed TUI library not available'));
      console.error(chalk.yellow('Please run in development mode: bun run dev monitor'));
      console.error(chalk.yellow('Or install blessed: bun add blessed blessed-contrib'));
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
      title: 'AI Tools Monitor - Claude Code Session Tracker',
      fullUnicode: true,
      dockBorders: true,
      warnings: false,
      // Disable mouse tracking to prevent escape sequence issues
      mouse: false,
      // Force terminal type for better compatibility
      terminal: process.env.TERM || 'xterm-256color',
      // Disable auto-padding that might cause issues
      autoPadding: false
    });

    // Create grid layout - dynamically sized to leave space for status bar
    const termHeight = process.stdout.rows || 24;
    const gridRows = Math.max(10, Math.min(12, termHeight - 2)); // Leave 2 rows for status bar
    
    this.grid = new this.contrib.grid({
      rows: gridRows,
      cols: 12,
      screen: this.screen
    });
  }

  private createLayout(): void {
    // Top: Today's cost - big number display (0,0) -> (2,12)
    this.costBox = this.grid.set(0, 0, 2, 12, this.blessed.box, {
      label: ' Today\'s Spend ',
      border: { type: 'line', fg: 'green' },
      style: {
        fg: 'white',
        border: { fg: 'green' }
      },
      align: 'center',
      valign: 'middle'
    });

    // Left: Cost trend chart (2,0) -> (6,4)
    this.costTrendChart = this.grid.set(2, 0, 4, 4, this.contrib.bar, {
      label: ' 7-Day Cost Trend ',
      barWidth: 6,
      barSpacing: 1,
      xOffset: 1,
      maxHeight: 9,
      height: '100%',
      border: { type: 'line', fg: 'cyan' },
      style: {
        fg: 'cyan',
        border: { fg: 'cyan' },
        bar: { bg: 'cyan', fg: 'white' }
      }
    });

    // Middle: Session statistics (2,4) -> (6,8)
    this.metricsBox = this.grid.set(2, 4, 4, 4, this.blessed.box, {
      label: ' Session Stats ',
      border: { type: 'line', fg: 'yellow' },
      style: {
        fg: 'white',
        border: { fg: 'yellow' }
      },
      padding: 1
    });

    // Right: Active sessions overview (2,8) -> (6,12)
    this.activeSessionsBox = this.grid.set(2, 8, 4, 4, this.blessed.box, {
      label: ' Active Sessions ',
      border: { type: 'line', fg: 'magenta' },
      style: {
        fg: 'white',
        border: { fg: 'magenta' }
      },
      padding: 1
    });

    // Bottom: Dynamic session boxes (6,0) -> (11,12) - reduced to avoid status bar overlap
    // This area will be managed dynamically

    // Status Bar - positioned at bottom with proper background
    const statusBar = this.blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: ' [q] Quit  [r] Refresh  [k] Kill Process  [↑↓] Navigate  [Enter] View Details ',
      style: {
        fg: 'cyan',
        bg: 'black',
        bold: true
      },
      tags: true,
      shrink: false
    });

    this.screen.render();
  }

  private setupEventHandlers(): void {
    if (!this.screen) return;

    // Quit
    this.screen.key(['q', 'C-c'], () => {
      this.cleanup();
      process.exit(0);
    });

    // Refresh
    this.screen.key(['r'], async () => {
      this.log('Manual refresh triggered');
      await this.updateData();
    });


    // Kill process
    this.screen.key(['k'], async () => {
      if (this.processes.length > 0 && this.selectedProcessIndex < this.processes.length) {
        const process = this.processes[this.selectedProcessIndex];
        this.log(`Killing process ${process.pid}: ${process.command}`);
        try {
          await this.killProcess(process.pid);
          this.log(`Successfully killed process ${process.pid}`);
          await this.updateData();
        } catch (error) {
          this.log(`Failed to kill process ${process.pid}: ${error}`);
        }
      }
    });

    // Navigation
    this.screen.key(['up'], () => {
      if (this.selectedProcessIndex > 0) {
        this.selectedProcessIndex--;
        this.updateProcessTable();
      }
    });

    this.screen.key(['down'], () => {
      if (this.selectedProcessIndex < this.processes.length - 1) {
        this.selectedProcessIndex++;
        this.updateProcessTable();
      }
    });

    // Enter for details
    this.screen.key(['enter'], () => {
      if (this.processes.length > 0 && this.selectedProcessIndex < this.processes.length) {
        const process = this.processes[this.selectedProcessIndex];
        this.showProcessDetails(process);
      }
    });
  }

  private async startMonitoring(): Promise<void> {
    // Initial data load
    await this.updateData();

    // Update every 2 seconds
    this.updateInterval = setInterval(async () => {
      await this.updateData();
    }, 2000);

    // Start watching log files for real-time updates
    this.watchLogFile();
  }

  private async updateData(): Promise<void> {
    try {
      // Get cost data
      await this.updateCostData();
      
      // Update active sessions from ~/.claude.json
      await this.updateActiveSessionsFromConfig();
      
      // Update session stats
      this.updateSessionStats();
      
      // Update active sessions list
      this.updateActiveSessionsList();
      
      // Update session boxes
      this.updateSessionBoxes();
      
      // Render screen
      this.screen?.render();
    } catch (error) {
      this.log(`Error updating data: ${error}`);
    }
  }

  private async updateCostData(): Promise<void> {
    try {
      const messages = await this.jsonParser.parseAllLogs();
      const dailyUsage = this.usageAnalyzer.analyzeDailyUsage(messages);
      
      // Get today's data
      const today = new Date().toISOString().split('T')[0];
      const todayData = dailyUsage.find(d => d.date === today);
      
      // Get last 7 days for chart
      const last7Days = dailyUsage.slice(-7);
      const weekCosts = last7Days.map(d => d.totalCost);
      const weekSessions = last7Days.reduce((sum, d) => sum + d.sessions, 0);
      
      this.costMetrics = {
        today: todayData?.totalCost || 0,
        todayTokens: todayData?.totalTokens || 0,
        todaySessions: todayData?.sessions || 0,
        week: weekCosts.reduce((sum, cost) => sum + cost, 0),
        weekSessions,
        weekCosts
      };
      
      this.updateCostDisplay();
      this.updateTrendChart();
      
    } catch (error) {
      this.log(`Error updating cost data: ${error}`);
    }
  }

  private async getLatestConversationInfo(projectPath: string): Promise<{topic: string, messageCount: number}> {
    try {
      const { execSync } = require('child_process');
      // Convert project path to log directory format
      const logDirName = projectPath.replace(/\//g, '-').substring(1);
      const logDir = path.join(os.homedir(), '.claude/projects', '-' + logDirName);
      
      // Find the most recent log file
      const recentLog = execSync(
        `find "${logDir}" -name "*.jsonl" -type f -exec ls -t {} + 2>/dev/null | head -1`
      ).toString().trim();
      
      if (!recentLog) {
        return { topic: 'No recent activity', messageCount: 0 };
      }
      
      // Count user messages (conversations)
      const messageCount = parseInt(execSync(
        `grep '"type":"user"' "${recentLog}" | grep '"content":' | grep -v '"type":"tool_result"' | wc -l`
      ).toString().trim()) || 0;
      
      // Get the latest user question (type: "user" with string content) - get more content
      let userQuestion = execSync(
        `tail -200 "${recentLog}" | jq -r 'select(.type == "user" and (.message.content | type == "string")) | .message.content' 2>/dev/null | tail -1`
      ).toString().trim();
      
      // Get the latest AI response - get the full content from the last assistant message
      const aiResponseCmd = `tail -100 "${recentLog}" | grep '"type":"assistant"' | tail -1`;
      const lastAssistantLine = execSync(aiResponseCmd + ' 2>/dev/null || echo "{}"').toString().trim();
      
      let aiResponse = '';
      if (lastAssistantLine && lastAssistantLine !== '{}') {
        try {
          const parsed = JSON.parse(lastAssistantLine);
          if (parsed.message && parsed.message.content) {
            // Handle array of content items
            for (const item of parsed.message.content) {
              if (item.type === 'text' && item.text) {
                aiResponse = item.text;
                break;
              } else if (typeof item === 'string') {
                aiResponse = item;
                break;
              }
            }
            // Take first 800 chars for display
            aiResponse = aiResponse.substring(0, 800);
          }
        } catch (e) {
          // Fallback to jq method
          aiResponse = execSync(
            `echo '${lastAssistantLine.replace(/'/g, "'\\''")}' | jq -r '.message.content[0].text // empty' 2>/dev/null`
          ).toString().trim();
        }
      }
      
      // Format the display with colors
      let display = '';
      
      if (userQuestion) {
        // Highlight code and bold text
        userQuestion = userQuestion.replace(/`([^`]+)`/g, (match, code) => {
          return chalk.yellow.bold(code);
        });
        userQuestion = userQuestion.replace(/\*\*([^*]+)\*\*/g, (match, text) => {
          return chalk.bold(text);
        });
        
        // Preserve original line breaks and wrap long lines
        const originalLines = userQuestion.split('\n');
        let allLines = [];
        const maxWidth = 38;
        
        for (const line of originalLines) {
          if (line.length <= maxWidth) {
            allLines.push(line);
          } else {
            // Wrap long lines at word boundaries
            const words = line.split(' ');
            let currentLine = '';
            
            for (const word of words) {
              const plainWord = word.replace(/\x1b\[[0-9;]*m/g, '');
              const plainLine = currentLine.replace(/\x1b\[[0-9;]*m/g, '');
              
              if (plainLine.length === 0) {
                currentLine = word;
              } else if ((plainLine + ' ' + plainWord).length <= maxWidth) {
                currentLine += ' ' + word;
              } else {
                allLines.push(currentLine);
                currentLine = word;
              }
            }
            if (currentLine) allLines.push(currentLine);
          }
          
          if (allLines.length >= 5) break; // Limit to 5 lines
        }
        
        // Take only first 5 lines
        allLines = allLines.slice(0, 5);
        
        display = `${chalk.cyan.bold('Q:')} ${chalk.cyan(allLines[0] || '')}`;
        for (let i = 1; i < allLines.length; i++) {
          display += `\n   ${chalk.cyan(allLines[i])}`;
        }
      }
      
      if (aiResponse) {
        // Highlight code in backticks
        aiResponse = aiResponse.replace(/`([^`]+)`/g, (match, code) => {
          return chalk.yellow.bold(code);
        });
        
        // Bold text with ** **
        aiResponse = aiResponse.replace(/\*\*([^*]+)\*\*/g, (match, text) => {
          return chalk.bold(text);
        });
        
        // Preserve original line breaks and wrap long lines
        const originalLines = aiResponse.split('\n');
        let allLines = [];
        const maxWidth = 38;
        
        for (const line of originalLines) {
          if (line.length <= maxWidth) {
            allLines.push(line);
          } else {
            // Wrap long lines at word boundaries
            const words = line.split(' ');
            let currentLine = '';
            
            for (const word of words) {
              const plainWord = word.replace(/\x1b\[[0-9;]*m/g, '');
              const plainLine = currentLine.replace(/\x1b\[[0-9;]*m/g, '');
              
              if (plainLine.length === 0) {
                currentLine = word;
              } else if ((plainLine + ' ' + plainWord).length <= maxWidth) {
                currentLine += ' ' + word;
              } else {
                allLines.push(currentLine);
                currentLine = word;
              }
            }
            if (currentLine) allLines.push(currentLine);
          }
          
          if (allLines.length >= 15) break; // Limit to 15 lines
        }
        
        // Take only first 15 lines
        allLines = allLines.slice(0, 15);
        
        if (display) {
          display += `\n${chalk.green.bold('A:')} ${allLines[0] || ''}`;
          for (let i = 1; i < allLines.length; i++) {
            display += `\n   ${allLines[i]}`;
          }
        } else {
          display = `${chalk.green.bold('A:')} ${allLines[0] || ''}`;
          for (let i = 1; i < allLines.length; i++) {
            display += `\n   ${allLines[i]}`;
          }
        }
      }
      
      return { 
        topic: display || chalk.dim('Active conversation'),
        messageCount: messageCount
      };
    } catch (error) {
      return { topic: chalk.dim('Active'), messageCount: 0 };
    }
  }

  private async updateActiveSessionsFromConfig(): Promise<void> {
    try {
      // Get recently active projects based on log file modifications (within 10 minutes)
      const { execSync } = require('child_process');
      const recentLogs = execSync(
        'find ~/.claude/projects -name "*.jsonl" -mmin -10 2>/dev/null | head -20'
      ).toString().trim().split('\n').filter(Boolean);
      
      // Extract project paths from log file paths
      const activeProjectPaths = new Set<string>();
      recentLogs.forEach(logPath => {
        // Format: ~/.claude/projects/-Users-albertliu-repositories-aitools/xxx.jsonl
        const match = logPath.match(/\/projects\/(.+?)\//);
        if (match) {
          // Convert back to normal path format
          const projectPath = '/' + match[1].replace(/-/g, '/').substring(1);
          activeProjectPaths.add(projectPath);
        }
      });
      
      const configPath = path.join(os.homedir(), '.claude.json');
      
      if (!fs.existsSync(configPath)) {
        return;
      }
      
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Only show projects that have recent log activity
      if (configData.projects) {
        const activeProjects = Object.entries(configData.projects).filter(
          ([projectPath, _]: [string, any]) => {
            return activeProjectPaths.has(projectPath);
          }
        );
        
        // Update active sessions based on projects
        const currentTime = new Date();
        for (const [projectPath, project] of activeProjects) {
          const sessionId = `claude-${projectPath.slice(-8)}`; // Use last 8 chars of project path
          
          // Use the project path key directly, take the last part after /
          const displayName = projectPath.split('/').pop() || projectPath;
          
          const conversationInfo = await this.getLatestConversationInfo(projectPath);
          
          if (!this.activeSessions.has(sessionId)) {
            this.activeSessions.set(sessionId, {
              sessionId,
              user: displayName,
              startTime: new Date(project.lastAccessed || currentTime),
              lastActivity: currentTime,
              messageCount: conversationInfo.messageCount,
              recentMessages: [],
              currentTopic: conversationInfo.topic
            });
          } else {
            // Update session info
            const session = this.activeSessions.get(sessionId)!;
            session.user = displayName;
            session.lastActivity = currentTime;
            session.messageCount = conversationInfo.messageCount;
            session.currentTopic = conversationInfo.topic;
          }
        }
        
        // Remove sessions that are no longer active
        for (const [sessionId, session] of this.activeSessions) {
          if (sessionId.startsWith('claude-')) {
            const projectStillActive = activeProjects.some(([projectId]) => 
              sessionId === `claude-${projectId.slice(-8)}`
            );
            if (!projectStillActive) {
              this.activeSessions.delete(sessionId);
              if (this.sessionBoxes.has(sessionId)) {
                this.sessionBoxes.get(sessionId).destroy();
                this.sessionBoxes.delete(sessionId);
              }
            }
          }
        }
      }
    } catch (error) {
      // Silent fail if config reading fails
      this.log(`Could not read Claude config: ${error}`);
    }
  }

  private updateCostDisplay(): void {
    if (!this.costBox || !this.costMetrics) return;
    
    const cost = this.costMetrics.today;
    const sessions = this.costMetrics.todaySessions;
    const tokens = formatNumber(this.costMetrics.todayTokens);
    
    // Create figlet ASCII art with color
    const costStr = `$${cost.toFixed(2)}`;
    
    try {
      // Use current selected font
      const selectedFont = this.allFonts[this.currentFontIndex];
      const figletOptions = {
        font: selectedFont,
        horizontalLayout: 'default' as figlet.KerningMethods,
        verticalLayout: 'default' as figlet.KerningMethods
      };
      
      const bigCost = figlet.textSync(costStr, figletOptions);
      
      // Apply green color to the big cost display
      const coloredCost = chalk.green.bold(bigCost);
      
      this.costBox.setContent(
        `\n${coloredCost}\n\n` +
        `   ${chalk.cyan(sessions + ' sessions')} | ${chalk.yellow(tokens + ' tokens')}   `
      );
    } catch (error) {
      // Fallback to simple display if figlet fails
      this.costBox.setContent(
        `\n${chalk.green.bold('$' + cost.toFixed(2))}\n\n` +
        `${sessions} sessions | ${tokens} tokens`
      );
    }
  }
  
  
  private updateTrendChart(): void {
    if (!this.costTrendChart || !this.costMetrics) return;
    
    // Get the last 7 days dates
    const dates = [];
    const data = [...this.costMetrics.weekCosts];
    const today = new Date();
    
    // Generate date labels (MM/DD format)
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      dates.push(`${month}/${day}`);
    }
    
    // Pad with zeros if less than 7 days
    while (data.length < 7) {
      data.unshift(0);
    }
    
    // Only take last 7 values
    const last7Data = data.slice(-7);
    
    const chartData = {
      titles: dates,
      data: last7Data.map(cost => {
        // Format to integer for cleaner display
        return Math.round(cost) || 0;
      })
    };
    
    this.costTrendChart.setData(chartData);
  }

  private updateSessionStats(): void {
    if (!this.metricsBox || !this.costMetrics) return;
    
    const activeCount = this.activeSessions.size;
    const avgCostPerSession = this.costMetrics.todaySessions > 0 ? 
      (this.costMetrics.today / this.costMetrics.todaySessions).toFixed(2) : '0.00';
    const avgTokensPerSession = this.costMetrics.todayTokens > 0 ? 
      Math.round(this.costMetrics.todayTokens / this.costMetrics.todaySessions) : 0;
    
    const content = [
      chalk.white.bold('═══ Sessions ═══'),
      '',
      `${chalk.cyan('Today:')}      ${chalk.white.bold(this.costMetrics.todaySessions)} sessions`,
      `${chalk.blue('This Week:')} ${chalk.white.bold(this.costMetrics.weekSessions)} total`,
      `${chalk.green('Active Now:')} ${activeCount > 0 ? chalk.green.bold(activeCount) : chalk.gray('0')}`,
      '',
      chalk.white.bold('═══ Average ═══'),
      '',
      `${chalk.yellow('Per Session:')} ${chalk.white.bold('$' + avgCostPerSession)}`,
      `${chalk.magenta('Tokens:')}     ${chalk.white.bold(formatNumber(avgTokensPerSession))}`
    ].join('\n');
    
    this.metricsBox.setContent(content);
  }

  private updateActiveSessionsList(): void {
    if (!this.activeSessionsBox) return;
    
    const sessionList: string[] = [];
    
    for (const [id, session] of this.activeSessions) {
      const minutesAgo = Math.round((Date.now() - session.lastActivity.getTime()) / 60000);
      const timeStr = minutesAgo === 0 ? chalk.green('now') : chalk.yellow(`${minutesAgo}m ago`);
      sessionList.push(`${chalk.cyan.bold(session.user)} (${timeStr})`);
      sessionList.push(`  ${chalk.white(session.messageCount)} msgs`);
      if (session.currentTopic) {
        sessionList.push(`  ${chalk.gray('"' + session.currentTopic.substring(0, 20) + '...')}"`); 
      }
      sessionList.push('');
    }
    
    if (sessionList.length === 0) {
      sessionList.push(chalk.gray('No active sessions'));
    }
    
    this.activeSessionsBox.setContent(sessionList.join('\n'));
  }

  private watchLogFile(): void {
    this.jsonParser.findLogFiles().then(logFiles => {
      if (logFiles.length === 0) {
        this.log('No Claude log files found');
        return;
      }
      
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
      
      this.log(`Monitoring: ${path.basename(logPath)}`);
    }).catch(error => {
      this.log(`Failed to watch logs: ${error}`);
    });
  }
  
  private processLogEntry(entry: any): void {
    const sessionId = entry.sessionId || entry.request_id || 'unknown';
    const now = new Date();
    
    // Only update existing sessions from config, don't create new ones from log
    if (!this.activeSessions.has(sessionId)) {
      return; // Skip creating sessions from log entries
    }
    
    const session = this.activeSessions.get(sessionId)!;
    session.lastActivity = now;
    session.messageCount++;
    
    // Process messages
    if (entry.request?.messages) {
      const lastMessage = entry.request.messages[entry.request.messages.length - 1];
      if (lastMessage?.content) {
        const content = lastMessage.content.substring(0, 100);
        session.currentTopic = content;
        session.recentMessages.push({
          timestamp: now,
          role: 'user',
          content
        });
      }
    }
    
    // Keep only last 5 messages per session
    if (session.recentMessages.length > 5) {
      session.recentMessages = session.recentMessages.slice(-5);
    }
    
    // Update dynamic session boxes
    this.updateSessionBoxes();
    this.screen?.render();
  }
  
  private updateSessionBoxes(): void {
    // Clean up inactive sessions (older than 5 minutes)
    const now = new Date();
    for (const [id, session] of this.activeSessions) {
      const minutesInactive = (now.getTime() - session.lastActivity.getTime()) / 60000;
      if (minutesInactive > 5) {
        // Remove session box if exists
        if (this.sessionBoxes.has(id)) {
          const box = this.sessionBoxes.get(id);
          box.destroy();
          this.sessionBoxes.delete(id);
        }
        this.activeSessions.delete(id);
      }
    }
    
    // Calculate available space for session boxes
    const termHeight = process.stdout.rows || 24;
    const gridRows = Math.max(10, Math.min(12, termHeight - 2));
    const sessionStartRow = 6;
    const availableRows = Math.max(2, gridRows - sessionStartRow - 1); // Leave 1 row buffer
    const boxHeight = Math.min(4, availableRows); // Max height of 4, but can be smaller
    
    // Create/update session boxes
    let boxIndex = 0;
    for (const [id, session] of this.activeSessions) {
      const row = sessionStartRow + Math.floor(boxIndex / 3) * boxHeight; // Dynamic row calculation
      const col = (boxIndex % 3) * 4; // 4 columns per box
      
      // Skip if box would go off screen
      if (row + boxHeight > gridRows - 1) {
        break; // Don't create boxes that would overflow
      }
      
      if (!this.sessionBoxes.has(id)) {
        // Determine border color based on activity
        const minutesAgo = Math.round((now.getTime() - session.lastActivity.getTime()) / 60000);
        const borderColor = minutesAgo === 0 ? 'green' : minutesAgo < 5 ? 'yellow' : 'blue';
        
        // Create new session box using grid positioning with dynamic height
        const box = this.grid.set(row, col, boxHeight, 4, this.blessed.box, {
          label: ` ${chalk.bold(session.user)} `,
          border: { type: 'line', fg: borderColor },
          style: {
            fg: 'white',
            border: { fg: borderColor }
          },
          padding: {
            left: 1,
            right: 1,
            top: 0,
            bottom: 0
          },
          scrollable: true,
          tags: true,
          wrap: true
        });
        this.sessionBoxes.set(id, box);
      }
      
      // Update box content with better design
      const box = this.sessionBoxes.get(id)!;
      const minutesAgo = Math.round((now.getTime() - session.lastActivity.getTime()) / 60000);
      const timeStr = minutesAgo === 0 ? chalk.green('● now') : chalk.yellow(`○ ${minutesAgo}m ago`);
      const messageStr = session.messageCount > 0 ? `${chalk.bold(session.messageCount)} msgs` : chalk.dim('0 msgs');
      
      const content = [
        `${timeStr}  ${chalk.dim('│')}  ${chalk.magenta(messageStr)}`,
        chalk.dim('─'.repeat(30)),
        '',
        session.currentTopic || chalk.dim('No recent activity')
      ].join('\n');
      
      box.setContent(content);
      boxIndex++;
    }
  }

  private getTrend(dailyUsage: Array<{date: string, totalCost: number}>): string {
    if (dailyUsage.length < 2) return 'N/A';
    
    const recent = dailyUsage.slice(-7);
    const older = dailyUsage.slice(-14, -7);
    
    if (older.length === 0) return 'N/A';
    
    const recentAvg = recent.reduce((sum, d) => sum + d.totalCost, 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d.totalCost, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (change > 10) return `↑ ${change.toFixed(0)}%`;
    if (change < -10) return `↓ ${Math.abs(change).toFixed(0)}%`;
    return '→ Stable';
  }

  private showProcessDetails(process: SessionInfo): void {
    const detailBox = this.blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: '40%',
      content: [
        ` Process Details `,
        '',
        ` PID:     ${process.pid}`,
        ` Command: ${process.command}`,
        ` CPU:     ${process.cpu.toFixed(2)}%`,
        ` Memory:  ${process.memory.toFixed(2)}%`,
        ` Time:    ${process.time}`,
        ` Status:  ${process.status}`,
        '',
        ' Press [Esc] to close'
      ].join('\n'),
      border: {
        type: 'line',
        fg: 'cyan'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        }
      },
      padding: 1,
      keys: true
    });

    detailBox.key(['escape'], () => {
      detailBox.destroy();
      this.screen?.render();
    });

    detailBox.focus();
    this.screen?.render();
  }

  private async killProcess(pid: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const kill = spawn('kill', ['-9', pid.toString()]);
      kill.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed with code ${code}`));
        }
      });
    });
  }

  private log(message: string): void {
    // For now, just store logs - could add a debug log box later
    const timestamp = new Date().toLocaleTimeString();
    console.error(`[${timestamp}] ${message}`);
  }

  private cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (this.screen) {
      try {
        // Ensure proper cleanup of screen resources
        this.screen.leave();
        this.screen.destroy();
      } catch (error) {
        // Ignore cleanup errors
      } finally {
        this.screen = null;
      }
    }
    
    // Reset terminal state
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[?1049l'); // Exit alternate buffer
      process.stdout.write('\x1b[?25h');   // Show cursor
      process.stdout.write('\x1b[0m');     // Reset colors
    }
  }
}