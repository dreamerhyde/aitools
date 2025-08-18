import { 
  ConversationMessage, 
  DailyUsage, 
  SessionUsage, 
  BillingBlock,
  MonthlyUsage,
  UsageSummary
} from '../types/claude-usage.js';

export class UsageAnalyzer {
  private timezone?: string;
  private locale: string;

  constructor(timezone?: string, locale: string = 'en-CA') {
    this.timezone = timezone;
    this.locale = locale;
  }

  /**
   * Creates a date formatter with the specified timezone and locale
   */
  private createDateFormatter(): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat(this.locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: this.timezone,
    });
  }

  /**
   * Formats a date string to YYYY-MM-DD format with timezone awareness
   */
  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return this.createDateFormatter().format(date);
  }
  
  analyzeDailyUsage(messages: ConversationMessage[]): DailyUsage[] {
    const dailyMap = new Map<string, DailyUsage>();
    
    messages.forEach(msg => {
      // Use timezone-aware date formatting like ccusage
      const date = this.formatDate(msg.timestamp);
      
      if (!dailyMap.has(date)) {
        dailyMap.set(date, {
          date,
          totalTokens: 0,
          totalCost: 0,
          modelBreakdown: new Map(),
          conversations: 0
        });
      }
      
      const daily = dailyMap.get(date)!;
      daily.totalTokens += msg.usage.input + msg.usage.output;
      daily.totalCost += msg.cost || 0;
      
      // Update model breakdown
      if (!daily.modelBreakdown.has(msg.model)) {
        daily.modelBreakdown.set(msg.model, {
          model: msg.model,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreation: 0,
          cacheRead: 0,
          cost: 0,
          count: 0
        });
      }
      
      const modelUsage = daily.modelBreakdown.get(msg.model)!;
      modelUsage.inputTokens += msg.usage.input;
      modelUsage.outputTokens += msg.usage.output;
      modelUsage.cacheCreation += msg.usage.cache_creation || 0;
      modelUsage.cacheRead += msg.usage.cache_read || 0;
      modelUsage.cost += msg.cost || 0;
      modelUsage.count++;
    });
    
    // Count unique conversations per day
    const conversationsByDay = new Map<string, Set<string>>();
    messages.forEach(msg => {
      if (msg.conversation_id) {
        const date = this.formatDate(msg.timestamp);
        if (!conversationsByDay.has(date)) {
          conversationsByDay.set(date, new Set());
        }
        conversationsByDay.get(date)!.add(msg.conversation_id);
      }
    });
    
    conversationsByDay.forEach((convs, date) => {
      const daily = dailyMap.get(date);
      if (daily) {
        daily.conversations = convs.size;
      }
    });
    
    return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  analyzeMonthlyUsage(messages: ConversationMessage[]): Map<string, MonthlyUsage> {
    const monthlyMap = new Map<string, MonthlyUsage>();
    
    messages.forEach(msg => {
      // Use timezone-aware date formatting for month grouping
      const formattedDate = this.formatDate(msg.timestamp);
      const month = formattedDate.substring(0, 7); // Extract YYYY-MM from YYYY-MM-DD
      
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, {
          month,
          totalCost: 0,
          totalTokens: 0,
          days: 0,
          modelBreakdown: new Map()
        });
      }
      
      const monthly = monthlyMap.get(month)!;
      monthly.totalTokens += msg.usage.input + msg.usage.output;
      monthly.totalCost += msg.cost || 0;
      
      // Update model breakdown
      if (!monthly.modelBreakdown.has(msg.model)) {
        monthly.modelBreakdown.set(msg.model, {
          model: msg.model,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreation: 0,
          cacheRead: 0,
          cost: 0,
          count: 0
        });
      }
      
      const modelUsage = monthly.modelBreakdown.get(msg.model)!;
      modelUsage.inputTokens += msg.usage.input;
      modelUsage.outputTokens += msg.usage.output;
      modelUsage.cacheCreation += msg.usage.cache_creation || 0;
      modelUsage.cacheRead += msg.usage.cache_read || 0;
      modelUsage.cost += msg.cost || 0;
      modelUsage.count++;
    });
    
    // Count unique days per month
    const daysByMonth = new Map<string, Set<string>>();
    messages.forEach(msg => {
      const formattedDate = this.formatDate(msg.timestamp);
      const month = formattedDate.substring(0, 7); // Extract YYYY-MM from YYYY-MM-DD
      const day = formattedDate;
      
      if (!daysByMonth.has(month)) {
        daysByMonth.set(month, new Set());
      }
      daysByMonth.get(month)!.add(day);
    });
    
    daysByMonth.forEach((days, month) => {
      const monthly = monthlyMap.get(month);
      if (monthly) {
        monthly.days = days.size;
      }
    });
    
    return monthlyMap;
  }

  analyzeSessionUsage(messages: ConversationMessage[]): SessionUsage[] {
    const sessionMap = new Map<string, SessionUsage>();
    
    messages.forEach(msg => {
      const conversationId = msg.conversation_id || 'unknown';
      
      if (!sessionMap.has(conversationId)) {
        sessionMap.set(conversationId, {
          conversationId,
          title: msg.title,
          startTime: new Date(msg.timestamp),
          endTime: new Date(msg.timestamp),
          totalTokens: 0,
          totalCost: 0,
          messageCount: 0,
          models: []
        });
      }
      
      const session = sessionMap.get(conversationId)!;
      session.totalTokens += msg.usage.input + msg.usage.output;
      session.totalCost += msg.cost || 0;
      session.messageCount++;
      
      // Update time range
      const msgTime = new Date(msg.timestamp);
      if (msgTime < session.startTime) session.startTime = msgTime;
      if (msgTime > session.endTime) session.endTime = msgTime;
      
      // Track unique models
      if (!session.models.includes(msg.model)) {
        session.models.push(msg.model);
      }
      
      // Update title if available
      if (msg.title && !session.title) {
        session.title = msg.title;
      }
    });
    
    return Array.from(sessionMap.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  analyzeBillingBlocks(messages: ConversationMessage[], blockHours: number = 5): BillingBlock[] {
    const blocks: BillingBlock[] = [];
    const sortedMessages = [...messages].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    if (sortedMessages.length === 0) return blocks;
    
    let currentBlock: BillingBlock | null = null;
    const blockDuration = blockHours * 60 * 60 * 1000; // in milliseconds
    
    sortedMessages.forEach(msg => {
      const msgTime = new Date(msg.timestamp);
      
      if (!currentBlock || msgTime.getTime() - currentBlock.startTime.getTime() > blockDuration) {
        // Start a new block
        if (currentBlock) {
          blocks.push(currentBlock);
        }
        
        currentBlock = {
          startTime: msgTime,
          endTime: new Date(msgTime.getTime() + blockDuration),
          totalCost: 0,
          totalTokens: 0,
          sessions: [],
          isActive: false
        };
      }
      
      // Add message to current block
      if (currentBlock) {
        currentBlock.totalTokens += msg.usage.input + msg.usage.output;
        currentBlock.totalCost += msg.cost || 0;
      
        // Track sessions in this block
        const existingSession = currentBlock.sessions.find(
          s => s.conversationId === msg.conversation_id
        );
        
        if (existingSession) {
          existingSession.totalTokens += msg.usage.input + msg.usage.output;
          existingSession.totalCost += msg.cost || 0;
          existingSession.messageCount++;
          if (msgTime > existingSession.endTime) existingSession.endTime = msgTime;
        } else if (msg.conversation_id) {
          currentBlock.sessions.push({
            conversationId: msg.conversation_id,
            title: msg.title,
            startTime: msgTime,
            endTime: msgTime,
            totalTokens: msg.usage.input + msg.usage.output,
            totalCost: msg.cost || 0,
            messageCount: 1,
            models: [msg.model]
          });
        }
      }
    });
    
    if (currentBlock !== null) {
      // Check if last block is still active
      const now = new Date();
      const block: BillingBlock = currentBlock;
      if (now.getTime() - block.startTime.getTime() <= blockDuration) {
        block.isActive = true;
      }
      blocks.push(block);
    }
    
    return blocks;
  }

  generateSummary(messages: ConversationMessage[]): UsageSummary {
    if (messages.length === 0) {
      return {
        totalCost: 0,
        totalTokens: 0,
        totalConversations: 0,
        dateRange: {
          start: new Date(),
          end: new Date()
        },
        topModel: 'none',
        averageDailyCost: 0
      };
    }
    
    const totalCost = messages.reduce((sum, msg) => sum + (msg.cost || 0), 0);
    const totalTokens = messages.reduce((sum, msg) => 
      sum + msg.usage.input + msg.usage.output, 0
    );
    
    const conversations = new Set(messages.map(m => m.conversation_id).filter(Boolean));
    
    const dates = messages.map(m => new Date(m.timestamp));
    const startDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const endDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Find top model
    const modelCounts = new Map<string, number>();
    messages.forEach(msg => {
      modelCounts.set(msg.model, (modelCounts.get(msg.model) || 0) + 1);
    });
    const topModel = Array.from(modelCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';
    
    // Calculate average daily cost
    const days = Math.max(1, Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ));
    const averageDailyCost = totalCost / days;
    
    return {
      totalCost,
      totalTokens,
      totalConversations: conversations.size,
      dateRange: {
        start: startDate,
        end: endDate
      },
      topModel,
      averageDailyCost
    };
  }
}