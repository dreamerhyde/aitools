/**
 * Conversation parsing and analysis utilities
 * Preserves all original parsing logic from session-utils.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { ConversationInfo, RecentMessage } from './types.js';
import { sanitizeText, sanitizeTopic, formatActionString } from '../text-sanitizer.js';
import { statusTracker } from '../status-tracker.js';
import { extractToolNameFromAction } from './tool-mapping.js';

/**
 * Get the latest conversation information for a project
 * @param projectPath The path to the project
 * @returns ConversationInfo object with topic, message count, model, and messages
 */
export async function getLatestConversationInfo(projectPath: string): Promise<ConversationInfo> {
  try {
    const safePath = projectPath.replace(/\//g, '-').substring(1);
    const projectLogDir = path.join(os.homedir(), '.claude', 'projects', `-${safePath}`);
    
    if (!fs.existsSync(projectLogDir)) {
      return { topic: 'No activity', messageCount: 0, model: undefined, currentAction: '', recentMessages: [] };
    }
    
    // Get latest JSONL file by modification time
    const logFiles = fs.readdirSync(projectLogDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        path: path.join(projectLogDir, f),
        mtime: fs.statSync(path.join(projectLogDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime);
      
    if (logFiles.length === 0) {
      return { topic: 'No activity', messageCount: 0, model: undefined, currentAction: '', recentMessages: [] };
    }
    
    const latestLog = logFiles[0].path;
    
    // Count user messages
    const messageCount = parseInt(execSync(
      `grep '"type":"user"' "${latestLog}" | grep '"content":' | grep -v '"type":"tool_result"' | wc -l`,
      { maxBuffer: 1024 * 1024 * 10 }
    ).toString().trim()) || 0;
    
    // Get the last few entries to find the latest Q/A pair
    const recentEntries = execSync(
      `tail -100 "${latestLog}" 2>/dev/null`,
      { maxBuffer: 1024 * 1024 * 10 }
    ).toString().trim().split('\n');
    
    // Collect recent messages
    const recentMessages: RecentMessage[] = [];
    let modelName = '';
    let currentAction = '';
    let lastToolUseTime: Date | null = null;
    let lastTextResponseTime: Date | null = null;
    const parsedEntries: { type: string; message?: any; content?: string; timestamp?: string }[] = [];
    
    // Parse all entries first
    if (process.env.DEBUG_SESSIONS) {
      console.log(`[Parsing] Total lines: ${recentEntries.length}`);
    }
    
    for (const entry of recentEntries) {
      if (entry.trim()) {
        try {
          const parsed = JSON.parse(entry);
          parsedEntries.push(parsed);
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
    
    if (process.env.DEBUG_SESSIONS) {
      console.log(`[Parsing] Parsed entries: ${parsedEntries.length}`);
    }
    
    // Process parsed entries to extract messages and metadata
    for (let i = parsedEntries.length - 1; i >= 0; i--) {
      const entry = parsedEntries[i];
      
      if (process.env.DEBUG_SESSIONS) {
        console.log(`[Processing ${i}] type=${entry?.type}`);
      }
      
      if (!entry || !entry.type) continue;
      
      // Extract model name from assistant messages
      if (entry.type === 'assistant' && entry.message && entry.message.model) {
        modelName = entry.message.model;
      }
      
      // Check if this is a completed assistant response
      if (entry.type === 'assistant' && entry.message) {
        // Check for completion indicators (not null means completed)
        if (entry.message.stop_reason && entry.message.stop_reason !== null) {
          lastTextResponseTime = entry.timestamp ? new Date(entry.timestamp) : new Date();
          if (process.env.DEBUG_SESSIONS) {
            console.log(`[Assistant Complete] stop_reason: ${entry.message.stop_reason}`);
          }
        } else if (process.env.DEBUG_SESSIONS && entry.message.stop_reason === null) {
          console.log(`[Assistant Streaming] stop_reason is null - still active`);
        }
      }
      
      // Check for tool use in assistant messages (preserves ALL original tool detection logic)
      if (entry.type === 'assistant' && entry.message && entry.message.content && Array.isArray(entry.message.content)) {
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
              'NotebookEdit': 'Editing notebook',
              'BashOutput': 'Reading output',
              'KillBash': 'Terminating process',
              'mcp__Sequential_Thinking__sequentialthinking': 'Thinking',
              'mcp__Shrimp__plan_task': 'Planning task',
              'mcp__Shrimp__analyze_task': 'Analyzing task',
              'mcp__Supabase__execute_sql': 'Executing SQL',
              'mcp__Supabase__list_tables': 'Listing tables',
              'mcp__Context_7__resolve-library-id': 'Resolving library',
              'mcp__Context_7__get-library-docs': 'Getting docs',
              'mcp__Browser_Tools__getConsoleLogs': 'Reading console',
              'mcp__Browser_Tools__getConsoleErrors': 'Checking errors',
              'mcp__Browser_Tools__getNetworkErrors': 'Checking network',
              'mcp__Browser_Tools__getNetworkLogs': 'Reading network logs',
              'mcp__Browser_Tools__takeScreenshot': 'Taking screenshot',
              'mcp__Browser_Tools__runAccessibilityAudit': 'Auditing accessibility',
              'mcp__Browser_Tools__runPerformanceAudit': 'Auditing performance',
              'mcp__Browser_Tools__runSEOAudit': 'Auditing SEO',
              'mcp__File_System__write_file': 'Writing file',
              'mcp__File_System__read_file': 'Reading file',
              'mcp__File_System__read_text_file': 'Reading text',
              'mcp__File_System__edit_file': 'Editing file',
              'mcp__File_System__create_directory': 'Creating directory',
              'mcp__File_System__list_directory': 'Listing directory',
              'mcp__File_System__move_file': 'Moving file',
              'mcp__File_System__search_files': 'Searching files',
              'mcp___21st-dev_magic__21st_magic_component_builder': 'Building component',
              'default': 'Puttering'
            };
            
            // Extract real dynamic action from TodoWrite's activeForm
            let dynamicAction = toolActions[item.name] || toolActions['default'];
            
            // Special handling for TodoWrite to get activeForm from in-progress tasks
            if (item.name === 'TodoWrite' && item.input && item.input.todos) {
              const inProgressTask = item.input.todos.find((todo: any) => 
                todo.status === 'in_progress'
              );
              if (inProgressTask && inProgressTask.activeForm) {
                dynamicAction = inProgressTask.activeForm;
              }
            }
            // For Edit/Write tools, try to extract filename from input
            else if ((item.name === 'Edit' || item.name === 'Write' || item.name === 'MultiEdit') && item.input) {
              if (item.input.file_path) {
                const filename = item.input.file_path.split('/').pop() || 'file';
                dynamicAction = `Editing ${filename}`;
              }
            }
            // For Read tool, extract filename
            else if (item.name === 'Read' && item.input && item.input.file_path) {
              const filename = item.input.file_path.split('/').pop() || 'file';
              dynamicAction = `Reading ${filename}`;
            }
            // For Bash commands, show actual command (truncated)
            else if (item.name === 'Bash' && item.input && item.input.command) {
              const cmd = item.input.command.substring(0, 50);
              dynamicAction = `Running: ${cmd}${item.input.command.length > 50 ? '...' : ''}`;
            }
            
            // Update current action with the dynamic content
            currentAction = formatActionString(dynamicAction);
            lastToolUseTime = entry.timestamp ? new Date(entry.timestamp) : new Date();
            
            if (process.env.DEBUG_SESSIONS) {
              console.log(`[Tool Use] ${item.name} -> ${currentAction} at ${lastToolUseTime.toISOString()}`);
            }
          } else if (item.type === 'text' && item.text) {
            // Text response found - may indicate tool completed
            lastTextResponseTime = entry.timestamp ? new Date(entry.timestamp) : new Date();
            
            // Check if text contains code blocks that might confuse our parsing
            if (process.env.DEBUG_SESSIONS && item.text.includes('```')) {
              console.log(`[Text contains code block] Length: ${item.text.length}`);
            }
          }
        }
      }
      
      // Extract conversation messages
      if (entry.type === 'user' && entry.message && entry.message.content) {
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
            continue; // Skip this message
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
        
        // Skip empty or pure meta messages (but keep interrupt messages)
        if (!content || 
            content.includes('DO NOT respond to these messages') ||
            content.includes('Caveat:')) {
          continue;
        }
        
        // Extract actual user message from command output if present
        if (content.includes('<command-name>') || content.includes('<local-command-stdout>')) {
          // Try to extract the actual message between tags or after them
          const messageMatch = content.match(/(?:local-command-stdout>|command-message>)([^<]+)/);
          if (messageMatch && messageMatch[1]) {
            content = messageMatch[1].trim();
          } else {
            // If we can't extract meaningful content, skip
            continue;
          }
        }
        
        if (content.trim()) {
          recentMessages.unshift({
            timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
            role: 'user',
            content: sanitizeText(content, { maxLength: 500 }),
            tokens: entry.message.tokens
          });
        }
      }
      
      // Extract assistant text responses
      if (entry.type === 'assistant' && entry.message && entry.message.content) {
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
        
        if (textContent) {
          recentMessages.unshift({
            timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
            role: 'assistant',
            content: sanitizeText(textContent, { maxLength: 500 }),
            tokens: entry.message.tokens
          });
        }
      }
    }
    
    // Debug logging
    if (process.env.DEBUG_SESSIONS) {
      console.log(`[getLatestConversationInfo] Extracted ${recentMessages.length} messages`);
      for (const msg of recentMessages) {
        console.log(`  ${msg.role}: ${msg.content.substring(0, 60)}...`);
      }
    }
    
    // Determine if action should be cleared
    // Clear action if there's a text response after the tool use
    if (lastTextResponseTime && lastToolUseTime && lastTextResponseTime > lastToolUseTime) {
      if (process.env.DEBUG_SESSIONS) {
        console.log(`[Clear Action] Text response at ${lastTextResponseTime.toISOString()} > Tool use at ${lastToolUseTime.toISOString()}`);
      }
      currentAction = '';
    }
    
    if (process.env.DEBUG_SESSIONS && currentAction) {
      console.log(`[Current Action] "${currentAction}"`);
    }
    
    // Build display topic from most recent Q/A
    let display = 'Active conversation';
    if (recentMessages.length > 0) {
      // Find the most recent user message
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
    
    // Update status tracker with current session info
    const sessionId = `claude-${safePath}`;
    if (currentAction) {
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