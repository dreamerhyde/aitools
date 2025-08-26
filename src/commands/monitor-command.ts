import { ProcessMonitor } from '../utils/process-monitor.js';
import { GPUMonitor } from '../utils/gpu-monitor.js';
import { JSONLParser } from '../utils/jsonl-parser.js';
import { UsageAnalyzer } from '../utils/usage-analyzer.js';
import { formatCost, formatNumber } from '../utils/formatters.js';
import chalk from 'chalk';
import * as figlet from 'figlet';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ChartGenerator } from '../utils/chart-generator.js';

// Utility function to sanitize text for safe terminal display
function sanitizeForTerminal(str: string): string {
  return str
    // Remove ALL potentially problematic Unicode characters
    // Keep only: Basic Latin, Latin-1 Supplement, and CJK
    .replace(/[^\u0020-\u007E\u00A0-\u00FF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFF9F\u4E00-\u9FAF\u3400-\u4DBF]/g, '')
    // Remove control characters except newlines and tabs
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
      if (match === '\n' || match === '\t') return match;
      return '';
    })
    // Remove variation selectors and joiners
    .replace(/[\uFE00-\uFE0F]/g, '')
    .replace(/[\u200C-\u200D]/g, '')
    // Remove combining marks that might affect width
    .replace(/[\u0300-\u036F]/g, '');
}

interface SessionInfo {
  sessionId: string;
  user: string;
  startTime: Date;
  lastActivity: Date;
  messageCount: number;
  recentMessages: ConversationMessage[];
  currentTopic?: string;
  currentModel?: string;
  currentAction?: string;
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
  private highCpuProcessesBox: any = null;
  private sessionBoxes: Map<string, any> = new Map();
  private processMonitor: ProcessMonitor;
  private gpuMonitor: GPUMonitor;
  private jsonParser: JSONLParser;
  private usageAnalyzer: UsageAnalyzer;
  private updateInterval: NodeJS.Timeout | null = null;
  private activeSessions: Map<string, SessionInfo> = new Map();
  private costMetrics: CostMetrics | null = null;
  private blessed: any;
  private contrib: any;
  private currentFontIndex: number = 0;
  private allFonts: figlet.Fonts[] = [];

  constructor() {
    this.processMonitor = new ProcessMonitor();
    this.gpuMonitor = new GPUMonitor();
    this.jsonParser = new JSONLParser(undefined, true, true); // silent mode for TUI
    this.usageAnalyzer = new UsageAnalyzer();
    
    // Load fonts but default to a simple one
    this.loadFonts();
    
  }
  
  private loadFonts(): void {
    // Use a small set of suitable fonts
    this.allFonts = ['ANSI Shadow', 'Big', 'Standard', 'Small', 'Slant'];
    this.currentFontIndex = 0; // Default to ANSI Shadow
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
      autoPadding: false,
      // Additional fixes for CJK character border corruption
      forceUnicode: true,
      ignoreDockContrast: true,
      // Enable CSR for better scrolling performance
      fastCSR: true
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
    // Row 0: Today's Spend (left) + Projects (right top)
    // Left: Today's Spend (0,0) -> (2,8) - takes 8 columns like 30-Day chart
    this.costBox = this.grid.set(0, 0, 2, 8, this.blessed.box, {
      label: ' Today\'s Spend ',
      border: { type: 'line', fg: 'gray' },
      style: {
        fg: 'white',
        border: { fg: 'gray' }
      },
      align: 'center',
      valign: 'middle'
    });
    
    // Right top: Projects (0,8) -> (1,12) - compact height
    this.activeSessionsBox = this.grid.set(0, 8, 1, 4, this.blessed.box, {
      label: ' Projects ',
      border: { type: 'line', fg: 'gray' },
      style: {
        fg: 'white',
        border: { fg: 'gray' }
      },
      padding: 0
    });
    
    // Right bottom: System Resources (1,8) -> (2,12) - compact height
    this.metricsBox = this.grid.set(1, 8, 1, 4, this.blessed.box, {
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

    // Row 2: 30-Day Cost Trend (left) + High CPU Processes (right)
    // Left: 30-Day Cost Trend (2,0) -> (5,8) - takes 8 columns
    this.costTrendChart = this.grid.set(2, 0, 3, 8, this.blessed.box, {
      label: ' 30-Day Cost Trend ',
      border: { type: 'line', fg: 'gray' },
      style: {
        fg: 'white',
        border: { fg: 'gray' }
      },
      tags: true,
      padding: {
        left: 0,  // No left padding - let chart use full width
        right: 0,
        top: 0,
        bottom: 0
      }
    });
    
    // Right: High CPU Processes (2,8) -> (5,12) - takes 4 columns, same height as chart
    this.highCpuProcessesBox = this.grid.set(2, 8, 3, 4, this.blessed.box, {
      label: ' High CPU Processes ',
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

    // Bottom: Dynamic session boxes (5,0) -> (11,12) - starts right after middle layer
    // This area will be managed dynamically

    // Status Bar - positioned at bottom with proper background
    const statusBar = this.blessed.box({
      parent: this.screen,
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
      
      // Update high CPU processes
      this.updateHighCpuProcesses();
      
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
      
      // Get today's data using local timezone (same as usageAnalyzer)
      const formatter = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      const today = formatter.format(new Date());
      const todayData = dailyUsage.find(d => d.date === today);
      
      // Get last 7 days for chart
      const last7Days = dailyUsage.slice(-7);
      const weekCosts = last7Days.map(d => d.totalCost);
      const weekSessions = last7Days.reduce((sum, d) => sum + d.conversations, 0);
      
      this.costMetrics = {
        today: todayData?.totalCost || 0,
        todayTokens: todayData?.totalTokens || 0,
        todaySessions: todayData?.conversations || 0,
        week: weekCosts.reduce((sum, cost) => sum + cost, 0),
        weekSessions,
        weekCosts
      };
      
      this.updateCostDisplay();
      this.updateTrendChart(dailyUsage);
      
    } catch (error) {
      this.log(`Error updating cost data: ${error}`);
    }
  }

  private async getLatestConversationInfo(projectPath: string): Promise<{topic: string, messageCount: number, model?: string, currentAction?: string}> {
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
        return { topic: 'No recent activity', messageCount: 0, model: undefined };
      }
      
      // Count user messages (conversations)
      const messageCount = parseInt(execSync(
        `grep '"type":"user"' "${recentLog}" | grep '"content":' | grep -v '"type":"tool_result"' | wc -l`,
        { maxBuffer: 1024 * 1024 * 10 }
      ).toString().trim()) || 0;
      
      // Get the last few entries to find the latest Q/A pair with larger buffer
      const recentEntries = execSync(
        `tail -100 "${recentLog}" 2>/dev/null`,
        { maxBuffer: 1024 * 1024 * 10 }  // 10MB buffer
      ).toString().trim().split('\n');
      
      // Find the last assistant response and check for tool usage
      let lastAssistantIndex = -1;
      let lastAssistantLine = '';
      let userQuestion = '';
      let modelName = '';
      let currentAction = '';
      
      // Find last assistant message and check if it's using a tool
      for (let i = recentEntries.length - 1; i >= 0; i--) {
        if (recentEntries[i].includes('"type":"assistant"')) {
          lastAssistantIndex = i;
          lastAssistantLine = recentEntries[i];
          // Try to extract model name and check for tool use
          try {
            const entry = JSON.parse(recentEntries[i]);
            if (entry.message && entry.message.model) {
              modelName = entry.message.model;
            }
            
            // Check if the assistant is using a tool
            if (entry.message && entry.message.content && Array.isArray(entry.message.content)) {
              for (const item of entry.message.content) {
                if (item.type === 'tool_use' && item.name) {
                  // Map tool names to user-friendly actions
                  const toolActions: Record<string, string> = {
                    'Read': '📖 Reading file...',
                    'Write': '✏️ Writing file...',
                    'Edit': '✏️ Editing file...',
                    'MultiEdit': '✏️ Making multiple edits...',
                    'Bash': '⚡ Running command...',
                    'Grep': '🔍 Searching...',
                    'Glob': '🔍 Finding files...',
                    'LS': '📂 Listing directory...',
                    'WebFetch': '🌐 Fetching web content...',
                    'WebSearch': '🔍 Searching web...',
                    'TodoWrite': '✓ Updating tasks...',
                    'Task': '🤖 Running agent...',
                    'NotebookEdit': '📓 Editing notebook...'
                  };
                  
                  currentAction = toolActions[item.name] || `🔧 Using ${item.name}...`;
                  break;
                }
                // Check for thinking or other states
                else if (item.type === 'text' && item.text) {
                  const text = item.text.toLowerCase();
                  if (text.includes('thinking') || text.includes('analyzing')) {
                    currentAction = '💭 Thinking...';
                  } else if (text.includes('reading') || text.includes('examining')) {
                    currentAction = '📖 Reading...';
                  } else if (text.includes('searching')) {
                    currentAction = '🔍 Searching...';
                  }
                }
              }
            }
          } catch (e) {
            // Skip if JSON parsing fails
          }
          break;
        }
      }
      
      // Find the most recent user message before this assistant message
      if (lastAssistantIndex > 0) {
        for (let i = lastAssistantIndex - 1; i >= 0; i--) {
          if (recentEntries[i].includes('"type":"user"')) {
            try {
              const userEntry = JSON.parse(recentEntries[i]);
              if (userEntry.message && userEntry.message.content && typeof userEntry.message.content === 'string') {
                userQuestion = userEntry.message.content;
                break;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
      
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
            // Take first 2000 chars for display (increased from 800)
            aiResponse = aiResponse.substring(0, 2000);
          }
        } catch (e) {
          // Fallback to jq method
          aiResponse = execSync(
            `echo '${lastAssistantLine.replace(/'/g, "'\\''")}' | jq -r '.message.content[0].text // empty' 2>/dev/null`,
            { maxBuffer: 1024 * 1024 * 10 }
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
        // Optimized width for full terminal utilization
        const maxWidth = 60; // Maximize content display while maintaining stability
        
        for (const line of originalLines) {
          // Calculate display width considering CJK characters and removing emoji
          const getDisplayWidth = (str: string) => {
            const plain = str.replace(/\x1b\[[0-9;]*m/g, '');
            const cleanStr = sanitizeForTerminal(plain);
            let width = 0;
            for (const char of cleanStr) {
              // CJK characters and full-width punctuation
              if (char.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/)) {
                width += 2;
              } else {
                width += 1;
              }
            }
            return width;
          };
          
          // Force truncate function to ensure no overflow
          const safeTruncate = (text: string, maxW: number) => {
            const cleanText = sanitizeForTerminal(text);
            if (getDisplayWidth(cleanText) <= maxW) return cleanText;
            
            let result = '';
            let currentWidth = 0;
            
            for (const char of cleanText) {
              const charWidth = char.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/) ? 2 : 1;
              if (currentWidth + charWidth > maxW - 1) { // -1 for safety margin
                result += '…';
                break;
              }
              result += char;
              currentWidth += charWidth;
            }
            return result;
          };
          
          if (getDisplayWidth(line) <= maxWidth) {
            allLines.push(line);
          } else {
            // Force break long lines with strict width control
            let remaining = line;
            while (remaining && allLines.length < 5) {
              if (getDisplayWidth(remaining) <= maxWidth) {
                allLines.push(remaining);
                break;
              }
              
              // Find safe break point by reducing length until it fits
              let safeLength = Math.min(maxWidth, remaining.length);
              let testLine = remaining.substring(0, safeLength);
              
              while (getDisplayWidth(testLine) > maxWidth && safeLength > 1) {
                safeLength--;
                testLine = remaining.substring(0, safeLength);
              }
              
              if (safeLength > 0) {
                // Apply safe truncation to ensure no overflow
                const safeLine = safeTruncate(testLine.trim(), maxWidth);
                allLines.push(safeLine);
                remaining = remaining.substring(safeLength).trim();
              } else {
                // Emergency fallback: take just one character with truncation
                const safeLine = safeTruncate(remaining.substring(0, 1), maxWidth);
                allLines.push(safeLine);
                remaining = remaining.substring(1);
              }
            }
          }
          
          if (allLines.length >= 5) break; // Limit to 5 lines
        }
        
        // Take only first 5 lines
        allLines = allLines.slice(0, 5);
        
        display = `${chalk.white.bold('Q:')} ${chalk.white(allLines[0] || '')}`;
        for (let i = 1; i < allLines.length; i++) {
          display += `\n   ${chalk.white(allLines[i])}`;
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
        // Optimized width for full terminal utilization
        const maxWidth = 60; // Maximize content display while maintaining stability
        
        for (const line of originalLines) {
          // Calculate display width considering CJK characters and removing emoji
          const getDisplayWidth = (str: string) => {
            const plain = str.replace(/\x1b\[[0-9;]*m/g, '');
            const cleanStr = sanitizeForTerminal(plain);
            let width = 0;
            for (const char of cleanStr) {
              // CJK characters and full-width punctuation
              if (char.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/)) {
                width += 2;
              } else {
                width += 1;
              }
            }
            return width;
          };
          
          // Force truncate function to ensure no overflow
          const safeTruncate = (text: string, maxW: number) => {
            const cleanText = sanitizeForTerminal(text);
            if (getDisplayWidth(cleanText) <= maxW) return cleanText;
            
            let result = '';
            let currentWidth = 0;
            
            for (const char of cleanText) {
              const charWidth = char.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/) ? 2 : 1;
              if (currentWidth + charWidth > maxW - 1) { // -1 for safety margin
                result += '…';
                break;
              }
              result += char;
              currentWidth += charWidth;
            }
            return result;
          };
          
          if (getDisplayWidth(line) <= maxWidth) {
            allLines.push(line);
          } else {
            // Force break long lines with strict width control
            let remaining = line;
            while (remaining && allLines.length < 5) {
              if (getDisplayWidth(remaining) <= maxWidth) {
                allLines.push(remaining);
                break;
              }
              
              // Find safe break point by reducing length until it fits
              let safeLength = Math.min(maxWidth, remaining.length);
              let testLine = remaining.substring(0, safeLength);
              
              while (getDisplayWidth(testLine) > maxWidth && safeLength > 1) {
                safeLength--;
                testLine = remaining.substring(0, safeLength);
              }
              
              if (safeLength > 0) {
                // Apply safe truncation to ensure no overflow
                const safeLine = safeTruncate(testLine.trim(), maxWidth);
                allLines.push(safeLine);
                remaining = remaining.substring(safeLength).trim();
              } else {
                // Emergency fallback: take just one character with truncation
                const safeLine = safeTruncate(remaining.substring(0, 1), maxWidth);
                allLines.push(safeLine);
                remaining = remaining.substring(1);
              }
            }
          }
          
          if (allLines.length >= 15) break; // Limit to 15 lines
        }
        
        // Take only first 15 lines
        allLines = allLines.slice(0, 15);
        
        // Format response with better indentation for wrapped lines
        const formattedResponse = [];
        
        // Check if response contains bullet points or structured content
        const hasBullets = aiResponse.includes('•') || aiResponse.includes('- ') || 
                          aiResponse.includes('✅') || aiResponse.includes('✓');
        
        if (hasBullets) {
          // Keep original formatting for structured content
          for (let i = 0; i < allLines.length; i++) {
            const line = allLines[i];
            if (line.startsWith('- ') || line.startsWith('• ') || 
                line.startsWith('✅') || line.startsWith('✓')) {
              // Bullet point line
              formattedResponse.push(chalk.green(line));
            } else if (i > 0 && !line.match(/^[•\-✅✓]/)) {
              // Continuation of previous bullet point
              formattedResponse.push(chalk.green('  ' + line));
            } else {
              formattedResponse.push(chalk.green(line));
            }
          }
        } else {
          // Regular text formatting
          for (const line of allLines) {
            formattedResponse.push(chalk.green(line));
          }
        }
        
        if (display) {
          display += `\n\n${chalk.green.bold('A:')} ${formattedResponse[0] || ''}`;
          for (let i = 1; i < formattedResponse.length; i++) {
            display += `\n   ${formattedResponse[i]}`;
          }
        } else {
          display = `${chalk.green.bold('A:')} ${formattedResponse[0] || ''}`;
          for (let i = 1; i < formattedResponse.length; i++) {
            display += `\n   ${formattedResponse[i]}`;
          }
        }
      }
      
      // If there's a current action but no response yet, show the action
      if (currentAction && !aiResponse) {
        display = `${chalk.white.bold('Q:')} ${chalk.white(userQuestion ? userQuestion.substring(0, 100) + '...' : 'Processing...')}\n\n${chalk.yellow.bold(currentAction)}`;
      }
      
      // Add debug info when no Q/A found
      if (!display) {
        const debugInfo = `Debug: Found ${recentEntries.length} entries, lastAssistantIndex: ${lastAssistantIndex}, userQuestion: "${userQuestion.substring(0, 30)}...", aiResponse: "${aiResponse.substring(0, 50)}..." (total: ${aiResponse.length} chars)`;
        return { 
          topic: debugInfo,
          messageCount: messageCount,
          model: modelName || undefined,
          currentAction: currentAction
        };
      }
      
      return { 
        topic: display || 'Active conversation',  // Remove chalk formatting
        messageCount: messageCount,
        model: modelName || undefined,
        currentAction: currentAction
      };
    } catch (error) {
      return { topic: `Error: ${error}`, messageCount: 0, model: undefined, currentAction: '' };  // Show error for debugging
    }
  }

  private async updateActiveSessionsFromConfig(): Promise<void> {
    try {
      // Get projects with both today's activity and recent activity (10 min)
      const { execSync } = require('child_process');
      
      // Today's active projects (last 24 hours)
      const todayLogs = execSync(
        'find ~/.claude/projects -name "*.jsonl" -mmin -1440 2>/dev/null'
      ).toString().trim().split('\n').filter(Boolean);
      
      // Recently active projects (last 10 minutes)  
      const recentLogs = execSync(
        'find ~/.claude/projects -name "*.jsonl" -mmin -10 2>/dev/null'
      ).toString().trim().split('\n').filter(Boolean);
      
      // Combine both sets
      const allActiveLogs = [...new Set([...todayLogs, ...recentLogs])];
      
      // Extract project paths from log file paths
      const activeProjectPaths = new Set<string>();
      allActiveLogs.forEach(logPath => {
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
              startTime: new Date((project as any).lastAccessed || currentTime),
              lastActivity: currentTime,
              messageCount: conversationInfo.messageCount,
              recentMessages: [],
              currentTopic: conversationInfo.topic,
              currentModel: conversationInfo.model,
              currentAction: conversationInfo.currentAction
            });
          } else {
            // Update session info
            const session = this.activeSessions.get(sessionId)!;
            session.user = displayName;
            session.lastActivity = currentTime;
            session.messageCount = conversationInfo.messageCount;
            session.currentTopic = conversationInfo.topic;
            session.currentModel = conversationInfo.model;
            session.currentAction = conversationInfo.currentAction;
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
    
    // Get today's most used model from cost metrics
    let currentModel = 'No activity today';
    if (this.costMetrics && this.costMetrics.todaySessions > 0) {
      // This should be derived from today's actual usage data
      // For now, check active sessions but filter for today's activity
      const todaysSessions = Array.from(this.activeSessions.values())
        .filter(session => {
          const today = new Date().toDateString();
          return session.lastActivity.toDateString() === today;
        })
        .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
      
      if (todaysSessions.length > 0 && todaysSessions[0].currentModel) {
        // Simplify model name for display
        currentModel = todaysSessions[0].currentModel
          .replace('claude-', '')
          .replace('-20', '-')
          .replace('241022', '');
      } else {
        // Fallback: assume it's Claude 4 Sonnet since that's most common
        currentModel = 'sonnet-4';
      }
    }
    
    // Create figlet ASCII art with space between $ and amount
    const costStr = `$ ${cost.toFixed(2)}`;
    
    try {
      // Use current selected font
      const selectedFont = this.allFonts[this.currentFontIndex];
      const figletOptions = {
        font: selectedFont as figlet.Fonts,
        horizontalLayout: 'default' as figlet.KerningMethods,
        verticalLayout: 'default' as figlet.KerningMethods
      };
      
      const bigCost = figlet.textSync(costStr, figletOptions);
      
      // Apply green color to the big cost display
      const coloredCost = chalk.green.bold(bigCost);
      
      this.costBox.setContent(
        `\n${coloredCost}\n\n` +
        `   ${chalk.cyan(sessions + ' sessions')} | ${chalk.yellow(tokens + ' tokens')}   \n\n` +
        `   ${chalk.magenta('Model:')} ${chalk.white(currentModel)}   `
      );
    } catch (error) {
      // Fallback to simple display if figlet fails
      this.costBox.setContent(
        `\n${chalk.green.bold('$ ' + cost.toFixed(2))}\n\n` +
        `${sessions} sessions | ${tokens} tokens\n\n` +
        `Model: ${currentModel}`
      );
    }
  }
  
  
  private updateTrendChart(dailyUsage?: any[]): void {
    if (!this.costTrendChart || !this.costMetrics) return;
    
    // Get box dimensions - use full available space
    const boxWidth = (this.costTrendChart.width as number) || 60;
    const boxHeight = (this.costTrendChart.height as number) || 10;
    
    // Prepare cost data map from the last 30 days
    const costData = new Map<string, number>();
    
    // Build cost map from actual data
    if (dailyUsage) {
      dailyUsage.forEach(day => {
        costData.set(day.date, day.totalCost);
      });
    }
    
    // Generate continuous 30 days using the shared utility
    const chartData = ChartGenerator.generateContinuous30Days(costData);
    
    // Calculate chart width to fill the entire box
    // Box width minus borders (2) minus Y-axis area (6 chars: "$XXX | ")
    const chartWidth = Math.max(30, boxWidth - 2 - 6);
    
    // Generate chart with full width
    const chartLines = ChartGenerator.generateBarChart(chartData, {
      width: chartWidth,
      height: Math.max(6, boxHeight - 4), // Leave room for labels
      barWidth: 2, // Fixed 2-char width bars
      showDates: true,
      fullDates: true // Always show all dates for 30-day view
    });
    
    // Set content directly without extra padding
    this.costTrendChart.setContent(chartLines.join('\n'));
  }

  private updateSessionStats(): void {
    // Update System Resources box (bottom right)
    if (!this.metricsBox) return;
    
    // Show loading state immediately
    if (!this.resourceCache) {
      this.metricsBox.setContent(chalk.gray('Loading...'));
    }
    
    // Get system resource data (with longer timeout for GPU detection)
    Promise.race([
      this.getSystemResources(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)) // Increased from 1000ms
    ]).then((resources: any) => {
      // Cache the resources
      this.resourceCache = resources;
      
      const resourceDisplay: string[] = [];
      
      // Add empty line at the top
      resourceDisplay.push('');
      
      // Calculate available width for progress bar
      // Box width minus borders (2) minus left padding (1) minus "CPU " (4) minus " XX.X%" (7)
      const boxWidth = (this.metricsBox.width as number) || 40;
      const availableWidth = boxWidth - 2 - 1 - 4 - 7;
      const barWidth = Math.max(20, availableWidth); // Use full available width
      
      // CPU section with bar and details - dynamic width bar
      const cpuBar = this.createMiniBar(resources.cpu, 100, barWidth);
      resourceDisplay.push(`${chalk.bold('CPU')} ${cpuBar} ${chalk.yellow(resources.cpu.toFixed(1) + '%')}`);
      resourceDisplay.push(chalk.gray(`${resources.cpuInfo}`));
      
      resourceDisplay.push(''); // spacing between CPU and MEM
      
      // Memory section with bar and details - dynamic width bar
      const memBar = this.createMiniBar(resources.memory, 100, barWidth);
      resourceDisplay.push(`${chalk.bold('MEM')} ${memBar} ${chalk.cyan(resources.memory.toFixed(1) + '%')}`);
      resourceDisplay.push(chalk.gray(`${resources.memUsed}/${resources.memTotal} GB`));
      
      resourceDisplay.push(''); // spacing between MEM and GPU
      
      // GPU section - always show if gpuInfo exists
      if (resources.gpuInfo) {
        const gpuUsage = resources.gpu || 0; // Default to 0 if undefined
        const gpuBar = this.createMiniBar(gpuUsage, 100, barWidth);
        resourceDisplay.push(`${chalk.bold('GPU')} ${gpuBar} ${chalk.magenta(gpuUsage.toFixed(1) + '%')}`);
        resourceDisplay.push(chalk.gray(`${resources.gpuInfo}`));
      }
      
      this.metricsBox.setContent(resourceDisplay.join('\n'));
    }).catch(() => {
      // Use cached data if available
      if (this.resourceCache) {
        const resources = this.resourceCache as any;
        const resourceDisplay: string[] = [];
        // Calculate dynamic width
        const boxWidth = (this.metricsBox.width as number) || 40;
        const availableWidth = boxWidth - 2 - 1 - 4 - 7;
        const barWidth = Math.max(20, availableWidth); // Use full available width
        
        const cpuBar = this.createMiniBar(resources.cpu, 100, barWidth);
        const memBar = this.createMiniBar(resources.memory, 100, barWidth);
        
        resourceDisplay.push(''); // Add empty line at the top
        resourceDisplay.push(`${chalk.bold('CPU')} ${cpuBar} ${chalk.yellow(resources.cpu.toFixed(1) + '%')}`);
        resourceDisplay.push(chalk.gray(`${resources.cpuInfo}`));
        resourceDisplay.push('');
        resourceDisplay.push(`${chalk.bold('MEM')} ${memBar} ${chalk.cyan(resources.memory.toFixed(1) + '%')}`);
        resourceDisplay.push(chalk.gray(`${resources.memUsed}/${resources.memTotal} GB`));
        
        // Include GPU if available in cache
        if (resources.gpuInfo) {
          resourceDisplay.push('');
          const gpuUsage = resources.gpu || 0;
          const gpuBar = this.createMiniBar(gpuUsage, 100, barWidth);
          resourceDisplay.push(`${chalk.bold('GPU')} ${gpuBar} ${chalk.magenta(gpuUsage.toFixed(1) + '%')}`);
          resourceDisplay.push(chalk.gray(`${resources.gpuInfo}`));
        }
        
        this.metricsBox.setContent(resourceDisplay.join('\n'));
      } else {
        this.metricsBox.setContent(chalk.gray('Resources N/A'));
      }
    });
  }
  
  private resourceCache?: any;
  
  private createMiniBar(value: number, max: number, width: number): string {
    const filled = Math.round((value / max) * width);
    const empty = width - filled;
    
    let color = chalk.green;
    if (value > 80) color = chalk.red;
    else if (value > 60) color = chalk.yellow;
    
    return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }
  
  private async getSystemResources(): Promise<{ 
    cpu: number, 
    cpuInfo: string,
    memory: number, 
    memUsed: string,
    memTotal: string,
    gpu?: number,
    gpuInfo?: string 
  }> {
    const { execSync } = require('child_process');
    
    try {
      // Get CPU info (Apple Silicon vs Intel)
      let cpuInfo = 'Unknown';
      let gpuInfo = undefined;
      let gpu = undefined;
      
      // Get GPU info from GPUMonitor
      try {
        const gpuData = await this.gpuMonitor.getGPUInfo();
        gpu = gpuData.usage;
        
        // For GPU, only show cores count (not chip name to avoid duplication)
        if (gpuData.cores) {
          gpuInfo = `${gpuData.cores} cores`;
        } else {
          gpuInfo = 'GPU';
        }
        
        // Add memory info if available with color coding
        if (gpuData.memory.total > 0) {
          const memPercent = ((gpuData.memory.used / gpuData.memory.total) * 100);
          const memPercentStr = memPercent.toFixed(0);
          
          // Color code VRAM usage
          let vramColor = chalk.green;
          if (memPercent > 80) {
            vramColor = chalk.red;
          } else if (memPercent > 60) {
            vramColor = chalk.yellow;
          } else if (memPercent > 40) {
            vramColor = chalk.cyan;
          }
          
          gpuInfo += ` • ${vramColor(memPercentStr + '% VRAM')}`;
        }
        
        // Add temperature if available
        if (gpuData.temperature !== null) {
          gpuInfo += ` • ${gpuData.temperature}°C`;
        }
      } catch (gpuError) {
        // Fallback to existing detection logic
      }
      
      try {
        // First check if it's Apple Silicon using a more reliable method
        const cpuArch = execSync('uname -m').toString().trim();
        const coreCount = execSync('sysctl -n hw.ncpu').toString().trim();
        
        if (cpuArch === 'arm64') {
          // Apple Silicon - try to get specific chip name
          try {
            const cpuBrand = execSync('sysctl -n machdep.cpu.brand_string 2>/dev/null').toString().trim();
            const chipMatch = cpuBrand.match(/Apple (M\d+\s*\w*)/);
            const chipName = chipMatch ? chipMatch[1] : 'Apple Silicon';
            cpuInfo = `${chipName} (${coreCount} cores)`;
            
            // Set default GPU info if not already detected (only cores, no chip name)
            if (!gpuInfo) {
              // GPU core counts based on chip variant
              if (chipName.includes('M1')) {
                if (chipName.includes('Pro')) {
                  gpuInfo = `14-16 cores`;
                } else if (chipName.includes('Max')) {
                  gpuInfo = `24-32 cores`;
                } else if (chipName.includes('Ultra')) {
                  gpuInfo = `48-64 cores`;
                } else {
                  gpuInfo = `7-8 cores`;
                }
              } else if (chipName.includes('M2')) {
                if (chipName.includes('Pro')) {
                  gpuInfo = `16-19 cores`;
                } else if (chipName.includes('Max')) {
                  gpuInfo = `30-38 cores`;
                } else if (chipName.includes('Ultra')) {
                  gpuInfo = `60-76 cores`;
                } else {
                  gpuInfo = `8-10 cores`;
                }
              } else if (chipName.includes('M3')) {
                if (chipName.includes('Pro')) {
                  gpuInfo = `14-18 cores`;
                } else if (chipName.includes('Max')) {
                  gpuInfo = `30-40 cores`;
                } else {
                  gpuInfo = `8-10 cores`;
                }
              } else if (chipName.includes('M4')) {
                if (chipName.includes('Pro')) {
                  gpuInfo = `16-20 cores`;
                } else if (chipName.includes('Max')) {
                  gpuInfo = `32-40 cores`;
                } else {
                  gpuInfo = `10 cores`;
                }
              } else {
                gpuInfo = `GPU`;
              }
            }
          } catch {
            cpuInfo = `Apple Silicon (${coreCount} cores)`;
            if (!gpuInfo) gpuInfo = 'Integrated GPU';
          }
          if (gpu === undefined) gpu = 0; // Show as 0% rather than N/A
        } else {
          // Intel Mac (x86_64)
          try {
            const cpuBrand = execSync('sysctl -n machdep.cpu.brand_string 2>/dev/null').toString().trim();
            // Extract Intel model info
            const intelMatch = cpuBrand.match(/Intel\(R\)\s+(.+?)\s+CPU/);
            const intelModel = intelMatch ? intelMatch[1] : 'Intel';
            cpuInfo = `${intelModel} (${coreCount} cores)`;
          } catch {
            cpuInfo = `Intel (${coreCount} cores)`;
          }
          // Skip GPU detection for Intel to avoid slowdown
          if (!gpuInfo) gpuInfo = 'GPU';
          if (gpu === undefined) gpu = 0;
        }
      } catch {
        const coreCount = execSync('sysctl -n hw.ncpu').toString().trim();
        cpuInfo = `${coreCount} cores`;
      }
      
      // Get CPU usage
      const cpuOutput = execSync('ps -A -o %cpu | awk \'{s+=$1} END {print s}\'').toString().trim();
      const cpuCores = parseInt(execSync('sysctl -n hw.ncpu').toString().trim());
      const cpu = parseFloat(cpuOutput) / cpuCores; // Convert to percentage of total cores
      
      // Get memory info
      const totalMemBytes = parseInt(execSync('sysctl -n hw.memsize').toString().trim());
      const totalMemGB = (totalMemBytes / (1024 * 1024 * 1024)).toFixed(1);
      
      // Get memory usage with more detail
      const vmStatOutput = execSync('vm_stat').toString();
      const pageSize = 4096; // macOS page size
      
      let pagesActive = 0;
      let pagesWired = 0;
      let pagesCompressed = 0;
      
      vmStatOutput.split('\n').forEach(line => {
        if (line.includes('Pages active:')) {
          pagesActive = parseInt(line.match(/(\d+)/)?.[1] || '0');
        } else if (line.includes('Pages wired down:')) {
          pagesWired = parseInt(line.match(/(\d+)/)?.[1] || '0');
        } else if (line.includes('Pages occupied by compressor:')) {
          pagesCompressed = parseInt(line.match(/(\d+)/)?.[1] || '0');
        }
      });
      
      const usedMemBytes = (pagesActive + pagesWired + pagesCompressed) * pageSize;
      const usedMemGB = (usedMemBytes / (1024 * 1024 * 1024)).toFixed(1);
      const memory = (usedMemBytes / totalMemBytes) * 100;
      
      return { 
        cpu: Math.min(cpu, 100), 
        cpuInfo,
        memory: Math.min(memory, 100),
        memUsed: usedMemGB,
        memTotal: totalMemGB,
        gpu,
        gpuInfo
      };
    } catch (error) {
      // Fallback with dummy data
      return { 
        cpu: 45, 
        cpuInfo: 'Unknown',
        memory: 62,
        memUsed: '10.0',
        memTotal: '16.0'
      };
    }
  }

  private updateActiveSessionsList(): void {
    // Update Projects box (top right) - merged with active sessions info
    if (!this.activeSessionsBox) return;
    
    const projectInfo = [];
    const activeCount = this.activeSessions.size;
    
    if (activeCount > 0) {
      // Get unique projects with session counts
      const projectMap = new Map<string, number>();
      let totalMessages = 0;
      
      for (const [id, session] of this.activeSessions) {
        const project = session.user;
        projectMap.set(project, (projectMap.get(project) || 0) + 1);
        totalMessages += session.messageCount;
      }
      
      // Show project list with session counts
      projectInfo.push(chalk.green.bold(`${activeCount} active sessions`));
      projectInfo.push(chalk.yellow(`${totalMessages} questions asked`));
      projectInfo.push(''); // Empty line
      
      // List projects (max 2 to fit in small box)
      let i = 0;
      for (const [project, count] of projectMap) {
        if (i >= 2) {
          projectInfo.push(chalk.gray(`+${projectMap.size - 2} more`));
          break;
        }
        const shortName = project.split('/').pop() || project;
        projectInfo.push(chalk.cyan(`• ${shortName} (${count})`));
        i++;
      }
    } else {
      projectInfo.push(chalk.gray('No active projects'));
    }
    
    this.activeSessionsBox.setContent(projectInfo.join('\n'));
  }

  private updateHighCpuProcesses(): void {
    if (!this.highCpuProcessesBox) return;
    
    try {
      // Get top 15 processes by CPU usage
      this.processMonitor.getAllProcesses().then(processes => {
        // Sort by CPU usage, take top 15
        const topProcesses = processes
          .filter(p => p && p.cpu >= 0) // Include all processes
          .sort((a, b) => b.cpu - a.cpu)
          .slice(0, 15);
        
        const processInfo = [];
        
        // Header row
        processInfo.push(chalk.gray('CPU%   MEM%  Status     Process'));
        processInfo.push(chalk.gray('─'.repeat(38)));
        
        // Always show exactly 15 rows
        for (let i = 0; i < 15; i++) {
          if (i < topProcesses.length) {
            const proc = topProcesses[i];
            
            // Smart process name extraction
            const smartName = this.extractSmartProcessName(proc.command);
            
            // Format CPU percentage (right aligned, 5 chars)
            const cpuStr = proc.cpu.toFixed(1).padStart(5);
            
            // Format Memory percentage (right aligned, 5 chars)
            const memStr = proc.memory.toFixed(1).padStart(5);
            
            // Format Status (10 chars, left aligned)
            const statusStr = proc.status.padEnd(10);
            
            // Color code based on CPU usage
            let cpuColor = chalk.green;
            if (proc.cpu > 80) cpuColor = chalk.red;
            else if (proc.cpu > 50) cpuColor = chalk.yellow;
            else if (proc.cpu > 20) cpuColor = chalk.cyan;
            
            // Color for memory
            let memColor = chalk.green;
            if (proc.memory > 50) memColor = chalk.red;
            else if (proc.memory > 30) memColor = chalk.yellow;
            else if (proc.memory > 10) memColor = chalk.cyan;
            
            // Color for status
            let statusColor = chalk.green;
            if (proc.status === 'zombie') statusColor = chalk.red;
            else if (proc.status === 'stopped') statusColor = chalk.yellow;
            else if (proc.status === 'sleeping') statusColor = chalk.gray;
            
            // Calculate available width for process name
            const nameWidth = 15; // Adjusted for new columns
            const displayName = smartName.length > nameWidth ? 
              smartName.substring(0, nameWidth - 1) + '…' : 
              smartName;
            
            // Format: CPU% MEM% Status Process Name
            processInfo.push(`${cpuColor(cpuStr)} ${memColor(memStr)} ${statusColor(statusStr)} ${chalk.white(displayName)}`);
          } else {
            // Empty row to maintain 15 rows
            processInfo.push('');
          }
        }
        
        this.highCpuProcessesBox.setContent(processInfo.join('\n'));
      }).catch(error => {
        this.highCpuProcessesBox.setContent(chalk.red(`Error: ${error.message || error}`));
      });
    } catch (error) {
      this.highCpuProcessesBox.setContent(chalk.red(`Monitor error: ${error.message || error}`));
    }
  }

  private extractSmartProcessName(command: string): string {
    // Remove leading/trailing whitespace
    let name = command.trim();
    
    // Common patterns to extract meaningful names
    
    // Pattern 1: macOS system processes in /System/
    if (name.includes('/System/')) {
      // Extract framework or service name
      const match = name.match(/\/([^\/]+)\.(?:app|framework|xpc)/i);
      if (match) return match[1];
    }
    
    // Pattern 2: Applications in /Applications/
    if (name.includes('/Applications/')) {
      const match = name.match(/\/Applications\/([^\/]+)\.app/);
      if (match) return match[1];
    }
    
    // Pattern 3: Node/Bun processes
    if (name.includes('node ') || name.includes('bun ')) {
      // Try to extract script name
      const match = name.match(/(?:node|bun)\s+(?:.*\/)?([^\/\s]+\.(?:js|ts|mjs))/);
      if (match) return `node:${match[1]}`;
      return name.includes('node') ? 'node' : 'bun';
    }
    
    // Pattern 4: Python scripts
    if (name.includes('python')) {
      const match = name.match(/python[23]?\s+(?:.*\/)?([^\/\s]+\.py)/);
      if (match) return `py:${match[1]}`;
      return 'python';
    }
    
    // Pattern 5: Git operations
    if (name.includes('git ')) {
      const match = name.match(/git\s+(\w+)/);
      if (match) return `git:${match[1]}`;
      return 'git';
    }
    
    // Pattern 6: Docker containers
    if (name.includes('docker')) {
      const match = name.match(/docker(?:\s+(\w+))?/);
      if (match && match[1]) return `docker:${match[1]}`;
      return 'docker';
    }
    
    // Pattern 7: Shell scripts
    if (name.includes('bash ') || name.includes('sh ')) {
      const match = name.match(/(?:bash|sh)\s+(?:.*\/)?([^\/\s]+\.sh)/);
      if (match) return `sh:${match[1]}`;
      return 'shell';
    }
    
    // Pattern 8: Chrome/Browser processes
    if (name.includes('Chrome')) {
      if (name.includes('Helper')) return 'Chrome Helper';
      if (name.includes('GPU')) return 'Chrome GPU';
      if (name.includes('Renderer')) return 'Chrome Renderer';
      return 'Chrome';
    }
    
    // Pattern 9: VS Code
    if (name.includes('Code Helper') || name.includes('Electron')) {
      if (name.includes('GPU')) return 'Code GPU';
      if (name.includes('Renderer')) return 'Code Renderer';
      return 'Code Helper';
    }
    
    // Pattern 10: System daemons
    if (name.endsWith('d') && !name.includes('/')) {
      return name; // Keep daemon names as-is (e.g., systemd, sshd)
    }
    
    // Pattern 11: Extract binary name from path
    if (name.startsWith('/')) {
      const parts = name.split('/');
      const lastPart = parts[parts.length - 1];
      // Remove common extensions
      return lastPart.replace(/\.(exe|app|out|bin)$/i, '').split(' ')[0];
    }
    
    // Pattern 12: Command with arguments - take first word
    if (name.includes(' ')) {
      const firstWord = name.split(' ')[0];
      // If it's a path, extract the binary name
      if (firstWord.includes('/')) {
        return firstWord.split('/').pop() || firstWord;
      }
      return firstWord;
    }
    
    // Default: Return first 30 chars of original command
    return name.length > 30 ? name.substring(0, 27) + '...' : name;
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
      
      // Silent - don't show monitoring message
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
    const sessionStartRow = 5; // Start at row 5 (after middle layer which ends at row 5)
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
        // Use consistent gray border color for all boxes
        const minutesAgo = Math.round((now.getTime() - session.lastActivity.getTime()) / 60000);
        const borderColor = 'gray';
        
        // Create new session box using blessed box with proper configuration
        const box = this.grid.set(row, col, boxHeight, 4, this.blessed.box, {
          label: ` ${session.user} `,
          border: { type: 'line', fg: 'gray' },
          style: {
            fg: 'white',
            border: { fg: 'gray' }
          },
          tags: true,
          wrap: true,
          padding: {
            left: 1,
            right: 1
          }
        });
        this.sessionBoxes.set(id, box);
      }
      
      // Update box content with better design
      const box = this.sessionBoxes.get(id)!;
      const minutesAgo = Math.round((now.getTime() - session.lastActivity.getTime()) / 60000);
      const timeStr = minutesAgo === 0 ? chalk.green('* now') : chalk.yellow(`- ${minutesAgo}m ago`);
      const messageStr = session.messageCount > 0 ? `${chalk.bold(session.messageCount)} msgs` : chalk.dim('0 msgs');
      
      // Strip ANSI codes for cleaner display
      const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
      
      // Build content without complex formatting that might break box rendering
      // Green dot for active (now), gray dot for inactive
      const statusLine = minutesAgo === 0 ? '* now' : `- ${minutesAgo}m ago`;
      const msgLine = session.messageCount > 0 ? `${session.messageCount} msgs` : '0 msgs';
      const divider = '─'.repeat(Math.min(25, Math.floor((box.width as number - 4) / 2)));
      
      // Apply colors using blessed tags
      const coloredStatusLine = minutesAgo === 0 
        ? '{green-fg}* now{/green-fg}' 
        : `- ${minutesAgo}m ago`;
      
      // Build content as a single string
      const contentLines = [
        `${coloredStatusLine}  │  ${msgLine}`,
        divider,
        ''
      ];
      
      // Show current action if present (when AI is processing)
      if (session.currentAction) {
        contentLines.push('{yellow-fg}' + stripAnsi(session.currentAction) + '{/yellow-fg}');
        contentLines.push('');
      }
      
      // Show the topic/conversation
      contentLines.push(stripAnsi(session.currentTopic || 'No recent activity'));
      
      const content = contentLines.join('\n');
      
      // Set content directly
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
    return '> Stable';
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