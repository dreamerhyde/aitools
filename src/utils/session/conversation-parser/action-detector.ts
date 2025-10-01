/**
 * Action detection utilities
 * Detects tool usage and formats action descriptions
 */
import { formatActionString } from '../../text-sanitizer.js';
import { TOOL_ACTIONS, CLAUDE_DYNAMIC_STATES } from './constants.js';
import { ParsedEntry } from './entry-parser.js';

export interface ActionInfo {
  currentAction: string;
  lastToolUseTime: Date | null;
  lastTextResponseTime: Date | null;
}

/**
 * Detect tool usage and extract current action from parsed entries
 */
export function detectAction(entries: ParsedEntry[]): ActionInfo {
  let currentAction = '';
  let lastToolUseTime: Date | null = null;
  let lastTextResponseTime: Date | null = null;

  // Process entries to find tool usage
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];

    if (!entry || !entry.type) continue;

    // Check for tool use in assistant messages
    if (entry.type === 'assistant' && entry.message && entry.message.content && Array.isArray(entry.message.content)) {
      for (const item of entry.message.content) {
        if (item.type === 'tool_use' && item.name) {
          const dynamicAction = extractDynamicAction(item);
          currentAction = formatActionString(dynamicAction);
          lastToolUseTime = entry.timestamp ? new Date(entry.timestamp) : new Date();

          if (process.env.DEBUG_SESSIONS) {
            console.log(`[Tool Use] ${item.name} -> ${currentAction} at ${lastToolUseTime.toISOString()}`);
          }
        } else if (item.type === 'text' && item.text) {
          lastTextResponseTime = entry.timestamp ? new Date(entry.timestamp) : new Date();

          if (process.env.DEBUG_SESSIONS && item.text.includes('```')) {
            console.log(`[Text contains code block] Length: ${item.text.length}`);
          }
        }
      }
    }
  }

  return {
    currentAction,
    lastToolUseTime,
    lastTextResponseTime
  };
}

/**
 * Extract dynamic action description from tool use item
 */
function extractDynamicAction(item: any): string {
  let dynamicAction: string;

  // 1. FIRST CHECK: TodoWrite activeForm (highest priority)
  if (item.name === 'TodoWrite' && item.input && item.input.todos) {
    const inProgressTask = item.input.todos.find((todo: any) =>
      todo.status === 'in_progress'
    );
    if (inProgressTask && inProgressTask.activeForm) {
      return inProgressTask.activeForm;
    } else {
      return TOOL_ACTIONS[item.name] || 'Updating todos';
    }
  }

  // 2. Check if it's a known tool in our mapping
  if (TOOL_ACTIONS[item.name]) {
    dynamicAction = TOOL_ACTIONS[item.name];
  }
  // 3. Check if it's a Claude dynamic state word
  else {
    if (CLAUDE_DYNAMIC_STATES.some(state => item.name?.includes(state))) {
      return item.name;
    } else {
      dynamicAction = TOOL_ACTIONS['default'] || 'Processing';
    }
  }

  // 4. ENHANCE: Add specific details for certain tools
  dynamicAction = enhanceActionWithDetails(item, dynamicAction);

  return dynamicAction;
}

/**
 * Enhance action description with specific details from tool input
 */
function enhanceActionWithDetails(item: any, baseAction: string): string {
  // For Edit/Write tools, extract filename
  if ((item.name === 'Edit' || item.name === 'Write' || item.name === 'MultiEdit') && item.input && item.input.file_path) {
    const filename = item.input.file_path.split('/').pop() || 'file';
    return `Editing ${filename}`;
  }

  // For Read tool, extract filename
  if (item.name === 'Read' && item.input && item.input.file_path) {
    const filename = item.input.file_path.split('/').pop() || 'file';
    return `Reading ${filename}`;
  }

  // For Bash commands, show actual command (truncated)
  if (item.name === 'Bash' && item.input && item.input.command) {
    const cmd = item.input.command.substring(0, 50);
    return `Running: ${cmd}${item.input.command.length > 50 ? '...' : ''}`;
  }

  return baseAction;
}
