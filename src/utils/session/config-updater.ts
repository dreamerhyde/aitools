/**
 * Session configuration update utilities
 */
import { getActiveProjects } from './project-utils.js';
import { getLatestConversationInfo } from './conversation-parser.js';
import { SessionUpdateCallback } from './types.js';
import { generateSessionId } from './session-id-helper.js';

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
    // Use consistent session ID generation
    const sessionId = generateSessionId(projectPath);
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