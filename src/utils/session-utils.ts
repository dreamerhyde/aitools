/**
 * Shared utilities for managing Claude sessions across monitor implementations
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { sanitizeText, sanitizeTopic, formatActionString } from './text-sanitizer.js';

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
    for (let i = parsedEntries.length - 1; i >= 0 && recentMessages.length < 5; i--) {
      const entry = parsedEntries[i];
      
      if (process.env.DEBUG_SESSIONS) {
        console.log(`[Processing ${i}] type=${entry?.type}`);
      }
      
      if (!entry || !entry.type) continue;
      
      // Extract model name from assistant messages
      if (entry.type === 'assistant' && entry.message && entry.message.model) {
        modelName = entry.message.model;
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
    
    return { 
      topic: display,
      messageCount: messageCount,
      model: modelName || undefined,
      currentAction: currentAction,
      recentMessages: recentMessages
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
    recentMessages?: RecentMessage[]
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
      conversationInfo.recentMessages
    );
  }
}