/**
 * Message extraction utilities
 * Extracts user and assistant messages from parsed entries
 */
import { RecentMessage } from '../types.js';
import { sanitizeText } from '../../text-sanitizer.js';
import { ParsedEntry } from './entry-parser.js';

/**
 * Extract user and assistant messages from parsed entries
 */
export function extractMessages(entries: ParsedEntry[]): RecentMessage[] {
  const messages: RecentMessage[] = [];

  // Process entries in reverse order (most recent first)
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];

    if (!entry || !entry.type) continue;

    // Extract user messages
    if (entry.type === 'user' && entry.message && entry.message.content) {
      const userContent = extractUserContent(entry);
      if (userContent) {
        messages.unshift({
          timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
          role: 'user',
          content: sanitizeText(userContent, {
            preserveWhitespace: true
          }),
          tokens: entry.message.tokens
        });
      }
    }

    // Extract assistant messages
    if (entry.type === 'assistant' && entry.message && entry.message.content) {
      const assistantContent = extractAssistantContent(entry);
      if (assistantContent) {
        messages.unshift({
          timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
          role: 'assistant',
          content: sanitizeText(assistantContent, {
            preserveWhitespace: true
          }),
          tokens: entry.message.tokens
        });
      }
    }
  }

  if (process.env.DEBUG_SESSIONS) {
    console.log(`[extractMessages] Extracted ${messages.length} messages`);
  }

  return messages;
}

/**
 * Extract content from user message entry
 */
function extractUserContent(entry: ParsedEntry): string | null {
  let content = '';

  // Handle different content formats
  if (typeof entry.message.content === 'string') {
    content = entry.message.content;
  } else if (Array.isArray(entry.message.content)) {
    // Skip tool_result messages - they're not real user questions
    const hasToolResult = entry.message.content.some((item: any) =>
      item.type === 'tool_result'
    );
    if (hasToolResult) {
      return null;
    }

    // Extract text from content array
    for (const item of entry.message.content) {
      if (typeof item === 'string') {
        content += item + ' ';
      } else if (item.type === 'text' && item.text) {
        content += item.text + ' ';
      }
    }
  }

  // Clean and sanitize the content
  content = sanitizeText(content.trim(), {
    removeEmojis: true,
    convertToAscii: true,
    preserveWhitespace: false
  });

  // Check if this is a command structure
  if (content.includes('<command-name>')) {
    const commandNameMatch = content.match(/<command-name>([^<]+)<\/command-name>/);

    if (commandNameMatch && commandNameMatch[1]) {
      const cmdName = commandNameMatch[1].trim();
      content = cmdName.startsWith('/') ? cmdName : '/' + cmdName;
    } else {
      return null;
    }
  } else if (content.includes('<command-message>') && !content.includes('<command-name>')) {
    return null;
  } else if (content.includes('<local-command-stdout>')) {
    return null;
  }

  // Skip empty or pure meta messages
  if (!content ||
    (!content.startsWith('/') &&
      (content.includes('DO NOT respond to these messages') ||
        content.includes('Caveat:')))) {
    return null;
  }

  return content.trim() || null;
}

/**
 * Extract content from assistant message entry
 */
function extractAssistantContent(entry: ParsedEntry): string | null {
  let textContent = '';

  if (Array.isArray(entry.message.content)) {
    for (const item of entry.message.content) {
      if (item.type === 'text' && item.text) {
        textContent = item.text;
        break;
      }
    }
  } else if (typeof entry.message.content === 'string') {
    textContent = entry.message.content;
  }

  return textContent || null;
}
