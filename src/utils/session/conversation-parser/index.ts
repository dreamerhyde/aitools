/**
 * Conversation parser main interface
 * Orchestrates all parsing modules to extract conversation information
 */
import { ConversationInfo } from '../types.js';
import { sanitizeTopic, formatActionString } from '../../text-sanitizer.js';
import { statusTracker } from '../../status-tracker.js';
import { extractToolNameFromAction } from '../tool-mapping.js';
import { generateSessionId } from '../session-id-helper.js';

import { getLatestLogFile, countUserMessages, getRecentEntries } from './file-reader.js';
import { parseEntries, extractModelName } from './entry-parser.js';
import { extractMessages } from './message-extractor.js';
import { detectAction } from './action-detector.js';
import { findLastUserCommand, findLastMessage, analyzeStatus } from './status-analyzer.js';

/**
 * Get conversation information from a specific log file
 * @param logFilePath The path to the JSONL log file
 * @param sessionId Optional session ID for status tracking
 * @returns ConversationInfo object with topic, message count, model, and messages
 */
export async function getConversationInfoFromFile(
  logFilePath: string,
  sessionId?: string
): Promise<ConversationInfo> {
  try {
    // Step 1: Count user messages
    const messageCount = countUserMessages(logFilePath);

    // Step 2: Get recent entries
    const recentEntries = getRecentEntries(logFilePath);
    if (recentEntries.length === 0) {
      return { topic: 'No activity', messageCount, model: undefined, currentAction: '', recentMessages: [] };
    }

    // Step 3: Parse entries
    const parsedEntries = parseEntries(recentEntries);
    if (parsedEntries.length === 0) {
      return { topic: 'No activity', messageCount, model: undefined, currentAction: '', recentMessages: [] };
    }

    // Step 4: Extract model name
    const modelName = extractModelName(parsedEntries);

    // Step 5: Extract messages
    const recentMessages = extractMessages(parsedEntries);

    // Step 6: Detect current action
    const actionInfo = detectAction(parsedEntries);
    let currentAction = actionInfo.currentAction;

    // Step 7: Find last user command
    const userCommandInfo = findLastUserCommand(parsedEntries);

    // Step 8: Find last message
    const lastMessageInfo = findLastMessage(parsedEntries);

    // Step 9: Analyze status
    const statusResult = analyzeStatus(currentAction, userCommandInfo, lastMessageInfo);
    currentAction = statusResult.finalAction;

    if (process.env.DEBUG_SESSIONS && currentAction) {
      console.log(`[Current Action] "${currentAction}"`);
    }

    // Step 10: Build display topic
    let display = 'Active conversation';
    if (recentMessages.length > 0) {
      const lastUserMsg = recentMessages.find(m => m.role === 'user');
      if (lastUserMsg) {
        display = sanitizeTopic(lastUserMsg.content, 100);
      }
    } else if (currentAction) {
      display = formatActionString(currentAction);
    }

    if (process.env.DEBUG_SESSIONS) {
      console.log(`[Final] currentAction="${currentAction}", topic="${display}"`);
    }

    // Step 11: Update status tracker if session ID provided
    if (sessionId && currentAction) {
      const toolName = extractToolNameFromAction(currentAction);
      statusTracker.updateSessionStatus(sessionId, toolName, messageCount);
    }

    return {
      topic: display,
      messageCount: messageCount,
      model: modelName || undefined,
      currentAction: currentAction,
      recentMessages: recentMessages
    };
  } catch (error) {
    console.error('Error getting conversation info:', error);
    return {
      topic: 'Error reading conversation',
      messageCount: 0,
      model: undefined,
      currentAction: '',
      recentMessages: []
    };
  }
}

/**
 * Get the latest conversation information for a project
 * @param projectPath The path to the project
 * @returns ConversationInfo object with topic, message count, model, and messages
 */
export async function getLatestConversationInfo(projectPath: string): Promise<ConversationInfo> {
  try {
    // Step 1: Get latest log file
    const latestLog = getLatestLogFile(projectPath);
    if (!latestLog) {
      return { topic: 'No activity', messageCount: 0, model: undefined, currentAction: '', recentMessages: [] };
    }

    // Extract session ID from file path for status tracking
    const sessionIdMatch = latestLog.match(/([a-f0-9-]+)\.jsonl$/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : generateSessionId(projectPath);

    // Use the file-based function
    return getConversationInfoFromFile(latestLog, sessionId);
  } catch (error) {
    console.error('Error getting conversation info:', error);
    return {
      topic: 'Error reading conversation',
      messageCount: 0,
      model: undefined,
      currentAction: '',
      recentMessages: []
    };
  }
}
