import { CostMetrics, SystemMetrics, DailyUsage } from '../types.js';
import { UsageAnalyzer } from '../../../utils/usage-analyzer.js';
import { JSONLParser } from '../../../utils/jsonl-parser.js';
import { ProcessMonitor } from '../../../utils/process-monitor.js';
import { GPUMonitor } from '../../../utils/gpu-monitor.js';
import { ConversationMessage, SessionUsage, DailyUsage as UsageAnalyzerDailyUsage } from '../../../types/claude-usage.js';

export class DataFetcher {
  private usageAnalyzer: UsageAnalyzer;
  private jsonlParser: JSONLParser;
  private processMonitor: ProcessMonitor;
  private gpuMonitor: GPUMonitor;

  constructor() {
    this.usageAnalyzer = new UsageAnalyzer();
    this.jsonlParser = new JSONLParser(undefined, true, true);
    this.processMonitor = new ProcessMonitor();
    this.gpuMonitor = new GPUMonitor();
  }

  async fetchCostMetrics(): Promise<{ metrics: CostMetrics; dailyUsage: DailyUsage[]; todayProjectCosts?: Map<string, number> }> {
    // Parse ALL logs to get complete data (not just last 7 days)
    const messages = await this.jsonlParser.parseAllLogs();
    const dailyUsage = this.usageAnalyzer.analyzeDailyUsage(messages);
    const sessions = this.usageAnalyzer.analyzeSessionUsage(messages);
    
    // Get today's data using local timezone (same as usageAnalyzer)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
    const today = formatter.format(new Date());
    const todayData = dailyUsage.find((d: UsageAnalyzerDailyUsage) => d.date === today);
    
    // Get the most recent model from today's messages
    let todayModel: string | undefined;
    if (todayData) {
      // Find today's messages and get the most recent model
      const todayMessages = messages.filter(m => {
        const msgDate = formatter.format(new Date(m.timestamp));
        return msgDate === today;
      });
      
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
      const todayMessages = messages.filter(m => {
        const msgDate = formatter.format(new Date(m.timestamp));
        return msgDate === today;
      });
      
      // Group by project (use cwd to identify project) and sum costs  
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
    const weekCosts = last7Days.map((d: UsageAnalyzerDailyUsage) => d.totalCost);
    const weekSessions = last7Days.reduce((sum, d: UsageAnalyzerDailyUsage) => 
      sum + d.conversations, 0);

    const metrics: CostMetrics = {
      today: todayData?.totalCost || 0,
      todayTokens: todayData?.totalTokens || 0,
      todaySessions: todayData?.conversations || 0,
      week: weekCosts.reduce((sum, cost) => sum + cost, 0),
      weekSessions,
      weekCosts,
      todayModel
    };

    // Convert to our DailyUsage format
    const dailyUsageFormatted: DailyUsage[] = dailyUsage.map((d: UsageAnalyzerDailyUsage) => ({
      date: d.date,
      totalCost: d.totalCost,
      tokenCount: d.totalTokens,
      sessionCount: d.conversations
    }));

    return { metrics, dailyUsage: dailyUsageFormatted, todayProjectCosts };
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