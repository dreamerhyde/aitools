/**
 * Tool name mapping utilities
 */

/**
 * Extract tool name from action string for status tracking
 */
export function extractToolNameFromAction(action: string): string | null {
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