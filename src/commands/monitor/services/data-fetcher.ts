import { CostMetrics, SystemMetrics, DailyUsage as MonitorDailyUsage } from '../types.js';
import { UsageAnalyzer } from '../../../utils/usage-analyzer.js';
import { JSONLParser } from '../../../utils/jsonl-parser.js';
import { ProcessMonitor } from '../../../utils/process-monitor.js';
import { GPUMonitor } from '../../../utils/gpu-monitor.js';
import { DailyUsage as ClaudeUsageDailyUsage } from '../../../types/claude-usage.js';

export class DataFetcher {
  private usageAnalyzer: UsageAnalyzer;
  private jsonlParser: JSONLParser;
  private processMonitor: ProcessMonitor;
  private gpuMonitor: GPUMonitor;
  private yesterdayAndBeforeCache: MonitorDailyUsage[] | null = null;  // Cache for yesterday and before
  private lastFullParse: number = 0;
  private YESTERDAY_CACHE_DURATION = 3600000; // Cache yesterday's data for 1 hour

  constructor() {
    this.usageAnalyzer = new UsageAnalyzer();
    this.jsonlParser = new JSONLParser(undefined, true, true);
    this.processMonitor = new ProcessMonitor();
    this.gpuMonitor = new GPUMonitor();
  }

  async fetchCostMetrics(): Promise<{ metrics: CostMetrics; dailyUsage: MonitorDailyUsage[]; todayProjectCosts?: Map<string, number> }> {
    try {
      const now = Date.now();
      
      // Always parse today's logs for real-time updates (this is fast - only 1 day)
      const todayMessages = await this.jsonlParser.parseLogs(1);
      // Analyze today's data
      const todayUsage = this.usageAnalyzer.analyzeDailyUsage(todayMessages);
      
      // Get yesterday and before data (cached for 1 hour since it doesn't change)
      let yesterdayAndBefore: MonitorDailyUsage[] = [];
      if (this.yesterdayAndBeforeCache && (now - this.lastFullParse) < this.YESTERDAY_CACHE_DURATION) {
        yesterdayAndBefore = this.yesterdayAndBeforeCache;
      } else {
        // Parse all logs to get historical data (expensive, but only done once per hour)
        const allMessages = await this.jsonlParser.parseAllLogs();
        const allUsage = this.usageAnalyzer.analyzeDailyUsage(allMessages);
        
        // Get today's date
        const formatter = new Intl.DateTimeFormat('en-CA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
        const today = formatter.format(new Date());
        
        // Cache everything except today, convert to monitor format
        this.yesterdayAndBeforeCache = allUsage.filter(d => d.date !== today).map((d: ClaudeUsageDailyUsage) => ({
          date: d.date,
          totalCost: d.totalCost,
          tokenCount: d.totalTokens,
          sessionCount: d.conversations
        }));
        this.lastFullParse = now;
        yesterdayAndBefore = this.yesterdayAndBeforeCache;
      }
      
      // Convert today's data to monitor format and combine with historical cache
      const todayUsageFormatted: MonitorDailyUsage[] = todayUsage.map((d: ClaudeUsageDailyUsage) => ({
        date: d.date,
        totalCost: d.totalCost,
        tokenCount: d.totalTokens,
        sessionCount: d.conversations
      }));
      const dailyUsage = [...yesterdayAndBefore, ...todayUsageFormatted];
      // const sessions = this.usageAnalyzer.analyzeSessionUsage(messages);
      
      // Get today's data using local timezone (same as usageAnalyzer)
      const formatter = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      const today = formatter.format(new Date());
      const todayData = todayUsage.find((d: ClaudeUsageDailyUsage) => d.date === today);
      
      // Get the most recent model from today's messages
      let todayModel: string | undefined;
      if (todayData) {
        // Use the already parsed today messages
        if (todayMessages.length > 0) {
          const recentMessage = todayMessages
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .find(m => m.model);
          
          if (recentMessage && recentMessage.model) {
            todayModel = recentMessage.model;
          }
        }
      }
      
      // Calculate today's project costs
      const todayProjectCosts = new Map<string, number>();
      if (todayData) {
        // Use the already parsed today messages
        for (const message of todayMessages) {
          // Extract project name from cwd path (e.g., "/Users/user/repos/meerkat" -> "meerkat")
          let projectId = 'unknown';
          if ((message as any).cwd) {
            const cwdParts = (message as any).cwd.split('/');
            projectId = cwdParts[cwdParts.length - 1] || 'unknown';
          } else if ((message as any).project_id) {
            projectId = (message as any).project_id;
          }
          
          const cost = message.cost || 0;
          todayProjectCosts.set(projectId, (todayProjectCosts.get(projectId) || 0) + cost);
        }
      }

      // Get last 7 days for week metrics
      const last7Days = dailyUsage.slice(-7);
      const weekCosts = last7Days.map(d => d.totalCost);
      const weekSessions = last7Days.reduce((sum, d) => 
        sum + d.sessionCount, 0);

      const metrics: CostMetrics = {
        today: todayData?.totalCost || 0,
        todayTokens: todayData?.totalTokens || 0,
        todaySessions: todayData?.conversations || 0,
        week: weekCosts.reduce((sum, cost) => sum + cost, 0),
        weekSessions,
        weekCosts,
        todayModel
      };

      // Already in the correct format

      return { metrics, dailyUsage, todayProjectCosts };
    } catch (error) {
      // Return safe defaults on error
      console.error('fetchCostMetrics error:', error);
      return {
        metrics: {
          today: 0,
          todayTokens: 0,
          todaySessions: 0,
          week: 0,
          weekSessions: 0,
          weekCosts: [],
          todayModel: undefined
        },
        dailyUsage: [],
        todayProjectCosts: new Map()
      };
    }
  }

  async fetchSystemMetrics(): Promise<SystemMetrics> {
    const sysInfo = await this.processMonitor.getSystemStats();
    const gpuInfo = await this.gpuMonitor.getGPUInfo();
    
    return {
      cpu: sysInfo.cpuUsage,
      memory: (sysInfo.memoryUsed / sysInfo.memoryTotal) * 100,
      gpu: gpuInfo?.usage,
      vram: gpuInfo?.memory ? 
        (gpuInfo.memory.used / gpuInfo.memory.total) * 100 : undefined
    };
  }

  getProcessMonitor(): ProcessMonitor {
    return this.processMonitor;
  }

  getGPUMonitor(): GPUMonitor {
    return this.gpuMonitor;
  }
}