/**
 * Tool action mappings and constants
 * Maps tool names to human-readable action descriptions
 */

export const TOOL_ACTIONS: Record<string, string> = {
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

export const CLAUDE_DYNAMIC_STATES = [
  'Distilling',
  'Manifesting',
  'Spelunking',
  'Brewing',
  'Conjuring',
  'Contemplating',
  'Germinating',
  'Percolating',
  'Ruminating',
  'Synthesizing',
  'Transmuting'
];

export const STATUS_BUFFER_MS = 1000;
export const COMMAND_RESPONSE_BUFFER_MS = 500;
