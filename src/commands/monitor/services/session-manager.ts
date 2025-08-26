import { SessionInfo, ConversationMessage } from '../types.js';
import { sanitizeForTerminal } from '../utils/sanitizers.js';

export class SessionManager {
  private activeSessions: Map<string, SessionInfo> = new Map();

  processLogEntry(entry: any): void {
    const sessionId = entry.sessionId || entry.request_id || 'unknown';
    
    // Only update existing sessions from config, don't create new ones from log
    if (!this.activeSessions.has(sessionId)) {
      return; // Skip creating sessions from log entries
    }
    
    const session = this.activeSessions.get(sessionId)!;

    session.lastActivity = new Date();

    // Update model info
    if (entry.model) {
      session.currentModel = entry.model;
    }

    // Handle different event types
    if (entry.event === 'message' || entry.type === 'conversation') {
      session.messageCount++;
      
      if (entry.role && entry.content) {
        const message: ConversationMessage = {
          timestamp: new Date(),
          role: entry.role as 'user' | 'assistant',
          content: sanitizeForTerminal(entry.content.substring(0, 100)),
          tokens: entry.tokens
        };
        
        session.recentMessages.push(message);
        if (session.recentMessages.length > 5) {
          session.recentMessages.shift();
        }
        
        // Extract topic from user messages
        if (entry.role === 'user' && entry.content) {
          session.currentTopic = sanitizeForTerminal(entry.content.substring(0, 50));
        }
      }
    }

    // Track current action based on tool usage
    if (entry.type === 'assistant' && entry.message?.content && Array.isArray(entry.message.content)) {
      for (const item of entry.message.content) {
        if (item.type === 'tool_use' && item.name) {
          const toolActions: Record<string, string> = {
            'Read': 'Reading file',
            'Write': 'Writing file',
            'Edit': 'Editing file',
            'MultiEdit': 'Editing multiple files',
            'Bash': 'Running command',
            'Grep': 'Searching',
            'Glob': 'Finding files',
            'LS': 'Listing directory',
            'WebFetch': 'Fetching web content',
            'WebSearch': 'Searching web',
            'Task': 'Running agent',
            'TodoWrite': 'Updating todos',
            'ExitPlanMode': 'Planning',
            // Generic puttering for other tools
            'default': 'Puttering'
          };
          session.currentAction = toolActions[item.name] || toolActions['default'];
          break;
        } else if (item.type === 'text') {
          // Clear action when assistant sends text response
          session.currentAction = undefined;
          break;
        }
      }
    } else if (entry.type === 'user') {
      // Clear action when user sends a new message
      session.currentAction = undefined;
    } else if (entry.action || entry.tool) {
      // Fallback to direct action/tool fields
      session.currentAction = entry.action || `Using ${entry.tool}`;
    }
  }

  getActiveSessions(): Map<string, SessionInfo> {
    // Clean up old sessions (inactive for more than 30 minutes)
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    const sessionsToRemove: string[] = [];
    
    this.activeSessions.forEach((session, id) => {
      if (session.lastActivity.getTime() < thirtyMinutesAgo) {
        sessionsToRemove.push(id);
      }
    });
    
    sessionsToRemove.forEach(id => this.activeSessions.delete(id));
    
    return this.activeSessions;
  }

  updateSessionFromConfig(
    sessionId: string,
    displayName: string,
    currentTime: Date,
    messageCount: number,
    topic?: string,
    model?: string,
    currentAction?: string,
    recentMessages?: any[] // Can be either ConversationMessage[] or RecentMessage[]
  ): void {
    if (!this.activeSessions.has(sessionId)) {
      this.activeSessions.set(sessionId, {
        sessionId,
        user: displayName,
        startTime: currentTime,
        lastActivity: currentTime,
        messageCount: messageCount,
        recentMessages: recentMessages ? recentMessages.map(msg => ({
          timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          tokens: msg.tokens
        })) : [],
        currentTopic: topic,
        currentModel: model,
        currentAction: currentAction
      });
    } else {
      // Update existing session info
      const session = this.activeSessions.get(sessionId)!;
      session.user = displayName;
      session.lastActivity = currentTime;
      session.messageCount = messageCount;
      session.currentTopic = topic;
      session.currentModel = model;
      session.currentAction = currentAction;
      
      // Update recent messages if provided
      if (recentMessages && recentMessages.length > 0) {
        session.recentMessages = recentMessages.map(msg => ({
          timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          tokens: msg.tokens
        }));
      }
    }
  }
  
  clearSessions(): void {
    this.activeSessions.clear();
  }
}