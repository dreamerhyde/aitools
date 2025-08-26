/**
 * Shared utilities for managing Claude sessions across monitor implementations
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { sanitizeText, sanitizeTopic, formatActionString } from './text-sanitizer.js';
import { statusTracker } from './status-tracker.js';

/**
 * Extract tool name from action string for status tracking
 */
function extractToolNameFromAction(action: string): string | null {
  // Map common action patterns back to tool names
  const actionToToolMapping: Record<string, string> = {
    'Reading file': 'Read',
    'Writing file': 'Write',
    'Editing file': 'Edit',
    'Editing multiple files': 'MultiEdit',
    'Running command': 'Bash',
    'Searching': 'Grep',
    'Finding files': 'Glob',
    'Listing directory': 'LS',
    'Fetching web content': 'WebFetch',
    'Searching web': 'WebSearch',
    'Running agent': 'Task',
    'Updating todos': 'TodoWrite',
    'Planning': 'ExitPlanMode',
    'Editing notebook': 'NotebookEdit',
    'Reading output': 'BashOutput',
    'Terminating process': 'KillBash',
    'Thinking': 'mcp__Sequential_Thinking__sequentialthinking',
    'Planning task': 'mcp__Shrimp__plan_task',
    'Analyzing task': 'mcp__Shrimp__analyze_task',
    'Executing SQL': 'mcp__Supabase__execute_sql',
    'Getting docs': 'mcp__Context_7__get-library-docs',
    'Building component': 'mcp___21st-dev_magic__21st_magic_component_builder',
    'Puttering': 'default'
  };

  for (const [actionPattern, toolName] of Object.entries(actionToToolMapping)) {
    if (action.toLowerCase().includes(actionPattern.toLowerCase())) {
      return toolName;
    }
  }

  return 'default';
}

export interface RecentMessage {
  timestamp: Date;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
}

export interface ConversationInfo {
  topic: string;
  messageCount: number;
  model?: string;
  currentAction?: string;
  recentMessages: RecentMessage[];
  status?: 'active' | 'completed' | 'idle';
}

export interface SessionData {
  sessionId: string;
  displayName: string;
  projectPath: string;
  conversationInfo: ConversationInfo;
}

/**
 * Get active project paths from Claude's project logs
 * @returns Object containing active project paths and the projects that should be displayed
 */
export async function getActiveProjects(): Promise<{
  activeProjectPaths: Set<string>;
  activeProjects: Array<[string, any]>;
}> {
  try {
    // Get projects with both today's activity and recent activity (10 min)
    const todayLogs = execSync(
      'find ~/.claude/projects -name "*.jsonl" -mmin -1440 2>/dev/null'
    ).toString().trim().split('\n').filter(Boolean);
    
    const recentLogs = execSync(
      'find ~/.claude/projects -name "*.jsonl" -mmin -10 2>/dev/null'
    ).toString().trim().split('\n').filter(Boolean);
    
    const allActiveLogs = [...new Set([...todayLogs, ...recentLogs])];
    
    // Extract project paths from log file paths
    const activeProjectPaths = new Set<string>();
    allActiveLogs.forEach((logPath: string) => {
      const match = logPath.match(/\/projects\/(.+?)\//);
      if (match) {
        const projectPath = '/' + match[1].replace(/-/g, '/').substring(1);
        activeProjectPaths.add(projectPath);
      }
    });
    
    const configPath = path.join(os.homedir(), '.claude.json');
    if (!fs.existsSync(configPath)) {
      return { activeProjectPaths, activeProjects: [] };
    }
    
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Only show projects that have recent log activity
    const activeProjects = configData.projects 
      ? Object.entries(configData.projects).filter(
          ([projectPath, _]: [string, any]) => {
            return activeProjectPaths.has(projectPath);
          }
        )
      : [];
    
    return { activeProjectPaths, activeProjects };
  } catch (error) {
    console.error(`Failed to get active projects: ${error}`);
    return { activeProjectPaths: new Set(), activeProjects: [] };
  }
}

/**
 * Get the latest conversation information for a project
 * @param projectPath The path to the project
 * @returns Conversation information including topic, message count, model, current action, and recent messages
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
    const parsedEntries: { type: string; message?: any; timestamp?: string }[] = [];
    
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
      let isCompletedResponse = false;
      if (entry.type === 'assistant' && entry.message) {
        // Check for completion indicators (not null means completed)
        if (entry.message.stop_reason && entry.message.stop_reason !== null) {
          isCompletedResponse = true;
          lastTextResponseTime = entry.timestamp ? new Date(entry.timestamp) : new Date();
          if (process.env.DEBUG_SESSIONS) {
            console.log(`[Assistant Complete] stop_reason: ${entry.message.stop_reason}`);
          }
        } else if (process.env.DEBUG_SESSIONS && entry.message.stop_reason === null) {
          console.log(`[Assistant Streaming] stop_reason is null - still active`);
        }
      }
      
      // Check for tool use in assistant messages
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
              // MCP tools
              'mcp__Browser_Tools__takeScreenshot': 'Taking screenshot',
              'mcp__Browser_Tools__getConsoleLogs': 'Reading console',
              'mcp__Browser_Tools__getConsoleErrors': 'Checking errors',
              'mcp__Browser_Tools__getNetworkErrors': 'Checking network',
              'mcp__Browser_Tools__getNetworkLogs': 'Reading network logs',
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
              'mcp__Sequential_Thinking__sequentialthinking': 'Thinking',
              'mcp__Shrimp__plan_task': 'Planning task',
              'mcp__Shrimp__analyze_task': 'Analyzing task',
              'mcp__Supabase__execute_sql': 'Executing SQL',
              'mcp__Supabase__list_tables': 'Listing tables',
              'mcp__Context_7__resolve-library-id': 'Resolving library',
              'mcp__Context_7__get-library-docs': 'Getting docs',
              'mcp___21st-dev_magic__21st_magic_component_builder': 'Building component',
              // Generic puttering for other tools
              'default': 'Puttering'
            };
            // Update current action to the latest tool being used
            currentAction = formatActionString(toolActions[item.name] || toolActions['default']);
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
        
        // Skip empty or pure meta messages (but keep interrupt messages and short user messages)
        if (!content) {
          continue; // Skip truly empty messages
        }
        
        // Skip clearly meta messages but preserve user content
        if (content.includes('DO NOT respond to these messages') ||
            content.includes('Caveat:') ||
            content.includes('The messages below were generated') ||
            (content.length > 200 && content.includes('system-reminder'))) {
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
          
        recentMessages.unshift({
          timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
          role: 'user',
          content: sanitizeText(content, { maxLength: 500 }),
          tokens: entry.message.tokens
        });
      } else if (entry.type === 'assistant' && entry.message && entry.message.content) {
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
      console.log(`[getLatestConversationInfo] Parsed ${parsedEntries.length} entries`);
      console.log(`[getLatestConversationInfo] Extracted ${recentMessages.length} messages`);
      
      // Debug system messages specifically
      const systemMessages = parsedEntries.filter(e => e.type === 'system');
      console.log(`[System messages found] ${systemMessages.length}`);
      for (const sys of systemMessages) {
        console.log(`  System: ${sys.content?.substring(0, 100)}...`);
      }
      
      for (const msg of recentMessages) {
        console.log(`  ${msg.role}: ${msg.content.substring(0, 60)}...`);
      }
    }
    
    // Determine session status and if action should be cleared
    let status: 'active' | 'completed' | 'idle' = 'idle';
    
    // First priority: Check for explicit completion via stop_reason
    let hasCompletionMarker = false;
    
    // Look for completion markers: prioritize system Stop messages
    let foundSystemStop = false;
    let latestAssistantStopReason = null;
    
    for (let i = parsedEntries.length - 1; i >= 0; i--) {
      const entry = parsedEntries[i];
      
      // Check for system Stop messages (highest priority)
      if (entry.type === 'system' && entry.content) {
        // Clean ANSI escape sequences for better detection
        const cleanContent = entry.content.replace(/\u001b\[[0-9;]*m/g, '');
        
        if (cleanContent.includes('Stop') || cleanContent.includes('stop') || 
            cleanContent.includes('completed') || cleanContent.includes('finished')) {
          foundSystemStop = true;
          hasCompletionMarker = true;
          if (process.env.DEBUG_SESSIONS) {
            console.log(`[Found completion marker] System stop message (cleaned): ${cleanContent}`);
          }
          break;
        }
      }
      
      // Track latest assistant stop_reason (only if no system Stop found yet)
      if (!foundSystemStop && entry.type === 'assistant' && entry.message && 'stop_reason' in entry.message) {
        latestAssistantStopReason = entry.message.stop_reason;
        if (process.env.DEBUG_SESSIONS) {
          console.log(`[Latest assistant message] stop_reason: ${latestAssistantStopReason}`);
        }
        break; // Either way, this is the most recent assistant message
      }
    }
    
    // If no system Stop message found, check assistant stop_reason
    if (!foundSystemStop && latestAssistantStopReason !== null) {
      hasCompletionMarker = true;
      if (process.env.DEBUG_SESSIONS) {
        console.log(`[Found completion marker] Assistant stop_reason: ${latestAssistantStopReason}`);
      }
    }
    
    // Check if there's ongoing activity (currentAction indicates AI is working)
    if (currentAction && currentAction.trim() !== '') {
      status = 'active';
      if (process.env.DEBUG_SESSIONS) {
        console.log(`[Status: ACTIVE] Has currentAction: "${currentAction}"`);
      }
    } else if (!hasCompletionMarker) {
      // No completion marker and no current action - assume still active if recent
      const now = new Date();
      const timeSinceLastMessage = recentMessages.length > 0 
        ? now.getTime() - recentMessages[0].timestamp.getTime()
        : Infinity;
      
      if (timeSinceLastMessage < 60 * 1000) { // Less than 1 minute - likely still active
        status = 'active';
        if (process.env.DEBUG_SESSIONS) {
          console.log(`[Status: ACTIVE] Recent activity (${Math.floor(timeSinceLastMessage/1000)}s ago), no completion marker`);
        }
      } else {
        status = 'idle';
      }
    } else {
      // Has completion marker - truly completed
      status = 'completed';
      if (process.env.DEBUG_SESSIONS) {
        console.log(`[Status: COMPLETED] Found completion marker and no current action`);
      }
    }
    
    // Clear currentAction only if status is completed
    if (status === 'completed') {
      currentAction = '';
    }
    
    if (process.env.DEBUG_SESSIONS) {
      console.log(`[Session Status] ${status}, currentAction="${currentAction}"`);
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
      recentMessages: recentMessages,
      status: status
    };
  } catch (error) {
    return { topic: `Error: ${error}`, messageCount: 0, model: undefined, currentAction: '', recentMessages: [] };
  }
}

/**
 * Update active sessions based on Claude configuration
 * @param updateSession Callback to update a session
 */
export async function updateActiveSessionsFromConfig(
  updateSession: (
    sessionId: string,
    displayName: string,
    currentTime: Date,
    messageCount: number,
    topic?: string,
    model?: string,
    currentAction?: string,
    recentMessages?: RecentMessage[],
    status?: 'active' | 'completed' | 'idle'
  ) => void
): Promise<void> {
  const { activeProjects } = await getActiveProjects();
  
  const currentTime = new Date();
  for (const [projectPath, project] of activeProjects) {
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
      conversationInfo.recentMessages,
      conversationInfo.status
    );
  }
}