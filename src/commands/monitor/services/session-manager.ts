import { SessionInfo, ConversationMessage } from '../types.js';
import { sanitizeForTerminal } from '../utils/sanitizers.js';
import { sanitizeText, formatActionString } from '../../../utils/text-sanitizer.js';

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
        // Don't truncate messages here - let the view layer handle display limits
        // Also preserve whitespace/newlines for proper paragraph formatting
        const sanitizedContent = sanitizeText(entry.content, {
          removeEmojis: true,
          convertToAscii: true,
          preserveWhitespace: true  // Keep newlines and spacing
          // Removed maxLength - don't truncate at storage level
        });
        const message: ConversationMessage = {
          timestamp: new Date(),
          role: entry.role as 'user' | 'assistant',
          content: sanitizeForTerminal(sanitizedContent),
          tokens: entry.tokens
        };
        
        session.recentMessages.push(message);
        if (session.recentMessages.length > 5) {
          session.recentMessages.shift();
        }
        
        // Extract topic from user messages
        if (entry.role === 'user' && entry.content) {
          const sanitizedTopic = sanitizeText(entry.content, {
            removeEmojis: true,
            convertToAscii: true
            // Removed maxLength - let view layer handle display limits
          });
          session.currentTopic = sanitizeForTerminal(sanitizedTopic);
        }
      }
    }

    // Note: Action tracking is primarily handled by session-utils.ts through updateSessionFromConfig
    // This is only for legacy log processing (if needed)
    if (entry.action || entry.tool) {
      // Fallback to direct action/tool fields
      const action = entry.action || `Using ${entry.tool}`;
      session.currentAction = formatActionString(action);
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
        currentAction: currentAction,
        status: 'idle' as const
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
      session.status = 'idle' as const;
      
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