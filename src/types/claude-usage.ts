// Types for Claude usage tracking

export interface TokenUsage {
  input: number;
  output: number;
  cache_creation?: number;
  cache_read?: number;
}

export interface ConversationMessage {
  timestamp: string;
  model: string;
  usage: TokenUsage;
  cost?: number;
  conversation_id?: string;
  project_id?: string;
  title?: string;
  message_id?: string;
  cwd?: string; // Current working directory to identify project
}

export interface DailyUsage {
  date: string;
  totalTokens: number;
  totalCost: number;
  modelBreakdown: Map<string, ModelUsage>;
  conversations: number;
}

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  cost: number;
  count: number;
}

export interface SessionUsage {
  conversationId: string;
  title?: string;
  startTime: Date;
  endTime: Date;
  totalTokens: number;
  totalCost: number;
  messageCount: number;
  models: string[];
}

export interface BillingBlock {
  startTime: Date;
  endTime: Date;
  totalCost: number;
  totalTokens: number;
  sessions: SessionUsage[];
  isActive: boolean;
}

// Model pricing (per million tokens)
export const MODEL_PRICING = {
  // Opus 4.1 (Latest)
  'claude-opus-4-1-20250805': {
    input: 15.00,
    output: 75.00,
    cache_creation: 18.75,
    cache_read: 1.50
  },
  // Opus 4 (Original)
  'claude-opus-4-20250514': {
    input: 15.00,
    output: 75.00,
    cache_creation: 18.75,
    cache_read: 1.50
  },
  'opus-4': {  // Alias for opus-4
    input: 15.00,
    output: 75.00,
    cache_creation: 18.75,
    cache_read: 1.50
  },
  // Sonnet 4 (Latest - official pricing)
  'claude-sonnet-4-20250514': {  // Exact model name from logs
    input: 3.00,
    output: 15.00,
    cache_creation: 3.75,
    cache_read: 0.30
  },
  'claude-4-sonnet-20250514': {
    input: 3.00,
    output: 15.00,
    cache_creation: 3.75,
    cache_read: 0.30
  },
  'sonnet-4': {  // Alias for sonnet-4
    input: 3.00,
    output: 15.00,
    cache_creation: 3.75,
    cache_read: 0.30
  },
  // Sonnet 3.5 (Legacy)
  'claude-3-5-sonnet-20241022': {
    input: 3.00,
    output: 15.00,
    cache_creation: 3.75,
    cache_read: 0.30
  },
  // Haiku 3.5
  'claude-3-5-haiku-20241022': {
    input: 1.00,
    output: 5.00,
    cache_creation: 1.25,
    cache_read: 0.10
  },
  // Legacy models
  'claude-3-opus-20240229': {
    input: 15.00,
    output: 75.00,
    cache_creation: 18.75,
    cache_read: 1.50
  },
  'claude-3-sonnet-20240229': {
    input: 3.00,
    output: 15.00,
    cache_creation: 3.75,
    cache_read: 0.30
  },
  'claude-3-haiku-20240307': {
    input: 0.25,
    output: 1.25,
    cache_creation: 0.30,
    cache_read: 0.03
  }
};

export interface UsageReport {
  daily: DailyUsage[];
  monthly: Map<string, MonthlyUsage>;
  sessions: SessionUsage[];
  blocks: BillingBlock[];
  summary: UsageSummary;
}

export interface MonthlyUsage {
  month: string;
  totalCost: number;
  totalTokens: number;
  days: number;
  modelBreakdown: Map<string, ModelUsage>;
}

export interface UsageSummary {
  totalCost: number;
  totalTokens: number;
  totalConversations: number;
  dateRange: {
    start: Date;
    end: Date;
  };
  topModel: string;
  averageDailyCost: number;
}