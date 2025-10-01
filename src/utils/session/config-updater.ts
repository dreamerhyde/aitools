/**
 * Session configuration update utilities
 */
import { getActiveSessions } from './project-utils.js';
import { getConversationInfoFromFile } from './conversation-parser/index.js';
import { SessionUpdateCallback } from './types.js';

/**
 * Update active sessions based on Claude configuration
 * Processes each session file individually to support multiple sessions per project
 * @param updateSession Callback to update a session
 */
export async function updateActiveSessionsFromConfig(
  updateSession: SessionUpdateCallback
): Promise<void> {
  const { activeSessions } = await getActiveSessions();

  const currentTime = new Date();

  // Group sessions by project to assign unique display names
  const projectSessionCounts = new Map<string, number>();
  activeSessions.forEach(session => {
    const count = projectSessionCounts.get(session.projectPath) || 0;
    projectSessionCounts.set(session.projectPath, count + 1);
  });

  const projectSessionIndexes = new Map<string, number>();

  for (const session of activeSessions) {
    const baseDisplayName = session.projectPath.split('/').pop() || session.projectPath;

    // Add session number suffix if multiple sessions exist for same project
    let displayName = baseDisplayName;
    const totalSessions = projectSessionCounts.get(session.projectPath) || 1;
    if (totalSessions > 1) {
      const currentIndex = (projectSessionIndexes.get(session.projectPath) || 0) + 1;
      projectSessionIndexes.set(session.projectPath, currentIndex);
      displayName = `${baseDisplayName} (${currentIndex})`;
    }

    // Get conversation info from specific session file
    const conversationInfo = await getConversationInfoFromFile(session.logFilePath);

    updateSession(
      session.sessionId,  // Use actual session ID from file
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