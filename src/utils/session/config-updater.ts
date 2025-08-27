/**
 * Session configuration update utilities
 */
import { getActiveProjects } from './project-utils.js';
import { getLatestConversationInfo } from './conversation-parser.js';
import { SessionUpdateCallback } from './types.js';

/**
 * Update active sessions based on Claude configuration
 * @param updateSession Callback to update a session
 */
export async function updateActiveSessionsFromConfig(
  updateSession: SessionUpdateCallback
): Promise<void> {
  const { activeProjects } = await getActiveProjects();
  
  const currentTime = new Date();
  for (const [projectPath] of activeProjects) {
    const sessionId = `claude-${projectPath.slice(-8)}`;
    const displayName = projectPath.split('/').pop() || projectPath;
    
    const conversationInfo = await getLatestConversationInfo(projectPath);
    
    updateSession(
      sessionId,
      displayName,
      currentTime,
      conversationInfo.messageCount,
      conversationInfo.topic,
      conversationInfo.model,
      conversationInfo.currentAction,
      conversationInfo.recentMessages
    );
  }
}