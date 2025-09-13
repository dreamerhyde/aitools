/**
 * Conversation parsing and analysis utilities
 * Preserves all original parsing logic from session-utils.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ConversationInfo, RecentMessage } from './types.js';
import { sanitizeText, sanitizeTopic, formatActionString } from '../text-sanitizer.js';
import { statusTracker } from '../status-tracker.js';
import { extractToolNameFromAction } from './tool-mapping.js';
import { generateSessionId, getSessionDirectory } from './session-id-helper.js';

/**
 * Get the latest conversation information for a project
 * @param projectPath The path to the project
 * @returns ConversationInfo object with topic, message count, model, and messages
 */
export async function getLatestConversationInfo(projectPath: string): Promise<ConversationInfo> {
  try {
    const projectLogDir = getSessionDirectory(projectPath);
    
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
    
    // Check if file exists before reading
    if (!fs.existsSync(latestLog)) {
      console.warn(`Session file no longer exists: ${latestLog}`);
      return { topic: 'No activity', messageCount: 0, model: undefined, currentAction: '', recentMessages: [] };
    }
    
    // Count user messages
    let messageCount = 0;
    try {
      messageCount = parseInt(execSync(
        `grep '"type":"user"' "${latestLog}" | grep '"content":' | grep -v '"type":"tool_result"' | wc -l`,
        { maxBuffer: 1024 * 1024 * 10 }
      ).toString().trim()) || 0;
    } catch (error) {
      console.warn(`Error counting messages in ${latestLog}:`, error instanceof Error ? error.message : String(error));
      return { topic: 'No activity', messageCount: 0, model: undefined, currentAction: '', recentMessages: [] };
    }
    
    // Get the last few entries to find the latest Q/A pair
    let recentEntries: string[] = [];
    try {
      recentEntries = execSync(
        `tail -100 "${latestLog}" 2>/dev/null`,
        { maxBuffer: 1024 * 1024 * 10 }
      ).toString().trim().split('\n');
    } catch (error) {
      console.warn(`Error reading recent entries from ${latestLog}:`, error instanceof Error ? error.message : String(error));
      return { topic: 'No activity', messageCount, model: undefined, currentAction: '', recentMessages: [] };
    }
    
    // Collect recent messages
    const recentMessages: RecentMessage[] = [];
    let modelName = '';
    let currentAction = '';  // Default to empty, only set when there's actual activity
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
      
      // Track assistant messages for later analysis
      if (entry.type === 'assistant' && entry.message) {
        // We'll check completion status later based on the LAST assistant message
        // This avoids premature status decisions during parsing
        if (process.env.DEBUG_SESSIONS) {
          console.log(`[Assistant Entry] Processing assistant message`);
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
            
            // Extract real dynamic action
            let dynamicAction: string;
            
            // 1. FIRST CHECK: TodoWrite activeForm (highest priority for specific status)
            if (item.name === 'TodoWrite' && item.input && item.input.todos) {
              const inProgressTask = item.input.todos.find((todo: any) => 
                todo.status === 'in_progress'
              );
              if (inProgressTask && inProgressTask.activeForm) {
                // Use activeForm directly - it's already a status description
                dynamicAction = inProgressTask.activeForm;
              } else {
                // No in-progress task, use default mapping
                dynamicAction = toolActions[item.name] || 'Updating todos';
              }
            }
            // 2. Check if it's a known tool in our mapping
            else if (toolActions[item.name]) {
              dynamicAction = toolActions[item.name];
            }
            // 3. Check if it's a Claude dynamic state word
            else {
              // Check if it's a known Claude dynamic state word
              const claudeStates = ['Distilling', 'Manifesting', 'Spelunking', 'Brewing', 
                                   'Conjuring', 'Contemplating', 'Germinating', 'Percolating',
                                   'Ruminating', 'Synthesizing', 'Transmuting'];
              
              if (claudeStates.some(state => item.name?.includes(state))) {
                dynamicAction = item.name; // Use the original name
              } else {
                dynamicAction = toolActions['default'] || 'Processing'; // Fallback
              }
            }
            
            // 4. ENHANCE: Add specific details for certain tools
            // For Edit/Write tools, try to extract filename from input
            if ((item.name === 'Edit' || item.name === 'Write' || item.name === 'MultiEdit') && item.input && item.input.file_path) {
              const filename = item.input.file_path.split('/').pop() || 'file';
              dynamicAction = `Editing ${filename}`;
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
        
        // Check if this is a command structure
        if (content.includes('<command-name>')) {
          // Extract the command name (not command-message which doesn't have slash)
          const commandNameMatch = content.match(/<command-name>([^<]+)<\/command-name>/);
          
          if (commandNameMatch && commandNameMatch[1]) {
            const cmdName = commandNameMatch[1].trim();
            // Ensure single slash prefix
            content = cmdName.startsWith('/') ? cmdName : '/' + cmdName;
            // Remove any command-message content if present
            // This ensures we only show the command name, not the full message
          } else {
            // No valid command name, skip this entry
            continue;
          }
        } else if (content.includes('<command-message>') && !content.includes('<command-name>')) {
          // This is just command message content without a command name, skip it
          continue;
        } else if (content.includes('<local-command-stdout>')) {
          // This is command output - always skip it
          continue;
        }
        
        // Skip empty or pure meta messages (but keep slash commands and user questions)  
        if (!content || 
            (!content.startsWith('/') &&  // Keep slash commands
             (content.includes('DO NOT respond to these messages') ||
              content.includes('Caveat:')))) {
          continue;
        }
        
        if (content.trim()) {
          recentMessages.unshift({
            timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
            role: 'user',
            content: sanitizeText(content, { 
              // Removed maxLength - show full content
              preserveWhitespace: true  // Keep line breaks for better formatting
            }),
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
            content: sanitizeText(textContent, { 
              // Removed maxLength - show full content
              preserveWhitespace: true  // IMPORTANT: Keep line breaks for markdown headers
            }),
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
    // Clear action if there's a text response after the tool use or if we detect completion
    let shouldClearAction = false;
    
    if (lastTextResponseTime && lastToolUseTime) {
      // Reduced buffer time (1 second) for more responsive clearing
      const bufferMs = 1000;
      const timeDiff = lastTextResponseTime.getTime() - lastToolUseTime.getTime();
      
      if (timeDiff > bufferMs) {
        shouldClearAction = true;
        if (process.env.DEBUG_SESSIONS) {
          console.log(`[Clear Action] Text response ${timeDiff}ms after tool use (> ${bufferMs}ms buffer)`);
        }
      }
    }
    
    // Track if we just saw a user command (slash command or regular message)
    let lastUserCommandTime: Date | null = null;
    let lastUserCommand: string | null = null;
    let isInterrupted = false;
    
    // Find the last user input (check for slash commands specifically)
    for (let i = parsedEntries.length - 1; i >= 0; i--) {
      const entry = parsedEntries[i];
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
            break; // Interrupt has highest priority, exit immediately
          }
        }
        
        // Check if this is a slash command
        const contentStr = typeof entry.message.content === 'string' 
          ? entry.message.content 
          : JSON.stringify(entry.message.content);
        
        if (contentStr.includes('<command-name>') && contentStr.includes('<command-message>')) {
          // Extract the command name
          const cmdNameMatch = contentStr.match(/<command-name>([^<]+)<\/command-name>/);
          if (cmdNameMatch && cmdNameMatch[1]) {
            lastUserCommand = '/' + cmdNameMatch[1].trim().replace(/^\//, ''); // Ensure single slash
            lastUserCommandTime = entry.timestamp ? new Date(entry.timestamp) : new Date();
            if (process.env.DEBUG_SESSIONS) {
              console.log(`[Found Command] ${lastUserCommand} at ${lastUserCommandTime.toISOString()}`);
            }
            break;
          }
        } else if (!contentStr.includes('tool_result')) {
          // Regular user message (not a tool result)
          lastUserCommand = 'user message';
          lastUserCommandTime = entry.timestamp ? new Date(entry.timestamp) : new Date();
          break;
        }
      }
    }
    
    // Check the LAST message (user or assistant) to determine status
    // Skip messages that contain local-command-stdout as they're not real user input
    let lastMessage = null;
    let lastMessageType = null;
    let lastMessageTime: Date | null = null;
    for (let i = parsedEntries.length - 1; i >= 0; i--) {
      const entry = parsedEntries[i];
      
      // Skip user messages that contain local-command-stdout
      if (entry.type === 'user' && entry.message && entry.message.content) {
        const contentStr = typeof entry.message.content === 'string' 
          ? entry.message.content 
          : JSON.stringify(entry.message.content);
        
        if (contentStr.includes('<local-command-stdout>')) {
          continue; // Skip this message, it's command output not user input
        }
      }
      
      if ((entry.type === 'assistant' || entry.type === 'user') && entry.message) {
        lastMessage = entry.message;
        lastMessageType = entry.type;
        lastMessageTime = entry.timestamp ? new Date(entry.timestamp) : new Date();
        break;
      }
    }
    
    // DEFAULT: Keep active unless we find specific INACTIVE pattern
    shouldClearAction = false;
    
    // PRIORITY CHECK: Handle user interrupts FIRST (highest priority)
    if (isInterrupted) {
      currentAction = 'Interrupted';
      shouldClearAction = true; // This will clear the action to show INACTIVE (gray border)
      if (process.env.DEBUG_SESSIONS) {
        console.log(`[User Interrupt] Session interrupted by user - INACTIVE (gray border)`);
      }
    } else {
      // Check if last message indicates activity (only if not interrupted)
      if (lastMessageType === 'user') {
        // Check if this is a slash command or regular user input
        if (lastUserCommand) {
          currentAction = lastUserCommand.startsWith('/') ? `Processing ${lastUserCommand}` : 'Processing';
        } else {
          currentAction = 'Processing';
        }
        if (process.env.DEBUG_SESSIONS) {
          console.log(`[User Message] Last message from user - ACTIVE (orange border): ${currentAction}`);
        }
      } else if (lastMessageType === 'assistant' && lastMessage) {
        // Check if assistant message is pure text (no tools)
        const hasPureTextResponse = 
          lastMessage.content &&
          Array.isArray(lastMessage.content) &&
          lastMessage.content.length > 0 &&
          lastMessage.content.every((item: any) => item.type === 'text');
        
        // Also check if there was a recent user command that hasn't been responded to
        const timeSinceCommand = lastUserCommandTime && lastMessageTime 
          ? lastMessageTime.getTime() - lastUserCommandTime.getTime()
          : Infinity;
        
        if (hasPureTextResponse && timeSinceCommand > 500) {
          // Pure text response after command = INACTIVE (conversation ended)
          shouldClearAction = true;
          if (process.env.DEBUG_SESSIONS) {
            console.log(`[Clear Action] Pure text response - INACTIVE (gray border)`);
          }
        } else if (lastUserCommandTime && timeSinceCommand < 500) {
          // Very recent user command, keep active
          currentAction = lastUserCommand && lastUserCommand.startsWith('/') 
            ? `Processing ${lastUserCommand}` 
            : 'Processing';
          if (process.env.DEBUG_SESSIONS) {
            console.log(`[Keep Action] Recent user command - staying ACTIVE (orange border): ${currentAction}`);
          }
        } else {
          // Has tool use or other content = ACTIVE
          if (process.env.DEBUG_SESSIONS) {
            console.log(`[Keep Action] Not pure text - staying ACTIVE (orange border)`);
          }
        }
      } else {
        // No message = keep ACTIVE
        if (process.env.DEBUG_SESSIONS) {
          console.log(`[Keep Action] No message found - staying ACTIVE (orange border)`);
        }
      }
    } // End of interrupt handling else block
    
    // REMOVED time-based clearing - only clear based on message content
    // This ensures sessions stay active (orange) by default
    
    if (shouldClearAction) {
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
    const sessionId = generateSessionId(projectPath);
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