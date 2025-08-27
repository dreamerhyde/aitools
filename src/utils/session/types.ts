/**
 * Type definitions for session management
 */

export interface RecentMessage {
  timestamp: Date;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
}

export interface ConversationInfo {
  topic: string;
  messageCount: number;
  model?: string;
  currentAction: string;
  recentMessages: RecentMessage[];
}

export interface SessionData {
  sessionId: string;
  displayName: string;
  projectPath: string;
  conversationInfo: ConversationInfo;
}

export type SessionUpdateCallback = (
  sessionId: string,
  displayName: string,
  currentTime: Date,
  messageCount: number,
  topic?: string,
  model?: string,
  currentAction?: string,
  recentMessages?: RecentMessage[]
) => void;