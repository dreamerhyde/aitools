/**
 * Status analysis utilities
 * Determines conversation status (active/inactive) based on message patterns
 */
import { ParsedEntry } from './entry-parser.js';
import { COMMAND_RESPONSE_BUFFER_MS } from './constants.js';

export interface UserCommandInfo {
  lastUserCommandTime: Date | null;
  lastUserCommand: string | null;
  isInterrupted: boolean;
}

export interface StatusAnalysisResult {
  shouldClearAction: boolean;
  finalAction: string;
}

/**
 * Find the last user command from parsed entries
 */
export function findLastUserCommand(entries: ParsedEntry[]): UserCommandInfo {
  let lastUserCommandTime: Date | null = null;
  let lastUserCommand: string | null = null;
  let isInterrupted = false;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === 'user' && entry.message && entry.message.content) {

      // PRIORITY CHECK: User interrupted
      if (Array.isArray(entry.message.content)) {
        const firstItem = entry.message.content[0];
        if (firstItem?.type === 'text' && firstItem?.text && firstItem.text.includes('[Request interrupted by user')) {
          isInterrupted = true;
          lastUserCommandTime = entry.timestamp ? new Date(entry.timestamp) : new Date();
          if (process.env.DEBUG_SESSIONS) {
            console.log(`[User Interrupt] Detected at ${lastUserCommandTime.toISOString()}`);
          }
          break;
        }
      }

      // Check if this is a slash command
      const contentStr = typeof entry.message.content === 'string'
        ? entry.message.content
        : JSON.stringify(entry.message.content);

      if (contentStr.includes('<command-name>') && contentStr.includes('<command-message>')) {
        const cmdNameMatch = contentStr.match(/<command-name>([^<]+)<\/command-name>/);
        if (cmdNameMatch && cmdNameMatch[1]) {
          lastUserCommand = '/' + cmdNameMatch[1].trim().replace(/^\//, '');
          lastUserCommandTime = entry.timestamp ? new Date(entry.timestamp) : new Date();
          if (process.env.DEBUG_SESSIONS) {
            console.log(`[Found Command] ${lastUserCommand} at ${lastUserCommandTime.toISOString()}`);
          }
          break;
        }
      } else if (!contentStr.includes('tool_result')) {
        lastUserCommand = 'user message';
        lastUserCommandTime = entry.timestamp ? new Date(entry.timestamp) : new Date();
        break;
      }
    }
  }

  return { lastUserCommandTime, lastUserCommand, isInterrupted };
}

/**
 * Find the last message (user or assistant) that's not command output
 */
export function findLastMessage(entries: ParsedEntry[]): {
  lastMessage: any;
  lastMessageType: string | null;
  lastMessageTime: Date | null;
} {
  let lastMessage = null;
  let lastMessageType = null;
  let lastMessageTime: Date | null = null;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];

    // Skip user messages that contain local-command-stdout
    if (entry.type === 'user' && entry.message && entry.message.content) {
      const contentStr = typeof entry.message.content === 'string'
        ? entry.message.content
        : JSON.stringify(entry.message.content);

      if (contentStr.includes('<local-command-stdout>')) {
        continue;
      }
    }

    if ((entry.type === 'assistant' || entry.type === 'user') && entry.message) {
      lastMessage = entry.message;
      lastMessageType = entry.type;
      lastMessageTime = entry.timestamp ? new Date(entry.timestamp) : new Date();
      break;
    }
  }

  return { lastMessage, lastMessageType, lastMessageTime };
}

/**
 * Analyze session status and determine if action should be cleared
 */
export function analyzeStatus(
  currentAction: string,
  userCommandInfo: UserCommandInfo,
  lastMessageInfo: {
    lastMessage: any;
    lastMessageType: string | null;
    lastMessageTime: Date | null;
  }
): StatusAnalysisResult {
  const { isInterrupted, lastUserCommand, lastUserCommandTime } = userCommandInfo;
  const { lastMessage, lastMessageType, lastMessageTime } = lastMessageInfo;

  // DEFAULT: Keep active unless we find specific INACTIVE pattern
  let shouldClearAction = false;
  let finalAction = currentAction;

  // PRIORITY CHECK: Handle user interrupts FIRST (highest priority)
  if (isInterrupted) {
    finalAction = 'Interrupted';
    shouldClearAction = true;
    if (process.env.DEBUG_SESSIONS) {
      console.log(`[User Interrupt] Session interrupted by user - INACTIVE (gray border)`);
    }
    return { shouldClearAction, finalAction };
  }

  // Check if last message indicates activity
  if (lastMessageType === 'user') {
    if (lastUserCommand) {
      finalAction = lastUserCommand.startsWith('/') ? `Processing ${lastUserCommand}` : 'Processing';
    } else {
      finalAction = 'Processing';
    }
    if (process.env.DEBUG_SESSIONS) {
      console.log(`[User Message] Last message from user - ACTIVE (orange border): ${finalAction}`);
    }
  } else if (lastMessageType === 'assistant' && lastMessage) {
    // Check if assistant message is pure text (no tools)
    const hasPureTextResponse =
      lastMessage.content &&
      Array.isArray(lastMessage.content) &&
      lastMessage.content.length > 0 &&
      lastMessage.content.every((item: any) => item.type === 'text');

    // Check if there was a recent user command that hasn't been responded to
    const timeSinceCommand = lastUserCommandTime && lastMessageTime
      ? lastMessageTime.getTime() - lastUserCommandTime.getTime()
      : Infinity;

    if (hasPureTextResponse && timeSinceCommand > COMMAND_RESPONSE_BUFFER_MS) {
      shouldClearAction = true;
      if (process.env.DEBUG_SESSIONS) {
        console.log(`[Clear Action] Pure text response - INACTIVE (gray border)`);
      }
    } else if (lastUserCommandTime && timeSinceCommand < COMMAND_RESPONSE_BUFFER_MS) {
      finalAction = lastUserCommand && lastUserCommand.startsWith('/')
        ? `Processing ${lastUserCommand}`
        : 'Processing';
      if (process.env.DEBUG_SESSIONS) {
        console.log(`[Keep Action] Recent user command - staying ACTIVE (orange border): ${finalAction}`);
      }
    } else {
      if (process.env.DEBUG_SESSIONS) {
        console.log(`[Keep Action] Not pure text - staying ACTIVE (orange border)`);
      }
    }
  } else {
    if (process.env.DEBUG_SESSIONS) {
      console.log(`[Keep Action] No message found - staying ACTIVE (orange border)`);
    }
  }

  if (shouldClearAction) {
    finalAction = '';
  }

  return { shouldClearAction, finalAction };
}
