// Session related types
export interface SessionInfo {
  sessionId: string;
  user: string;
  startTime: Date;
  lastActivity: Date;
  messageCount: number;
  recentMessages: ConversationMessage[];
  currentTopic?: string;
  currentModel?: string;
  currentAction?: string;
  status?: 'active' | 'completed' | 'idle';
}

export interface ConversationMessage {
  timestamp: Date;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
}

// Cost related types
export interface CostMetrics {
  today: number;
  todayTokens: number;
  todaySessions: number;
  week: number;
  weekSessions: number;
  weekCosts: number[];
  todayModel?: string;  // Most recent model used today
}

// System metrics types
export interface SystemMetrics {
  cpu: number;
  memory: number;
  gpu?: number;
  vram?: number;
}

// Process info types
export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  time: string;
  command: string;
}

// View configuration types
export interface ViewConfig {
  title: string;
  position: {
    top: string | number;
    left: string | number;
    width: string | number;
    height: string | number;
  };
  style?: any;
}

// Chart data types
export interface ChartData {
  x: string[];
  y: number[];
}

export interface DailyUsage {
  date: string;
  totalCost: number;
  tokenCount: number;
  sessionCount: number;
}