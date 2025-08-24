import { FileIssue } from './check-runners.js';

/**
 * Parse ESLint JSON output format
 */
export function parseESLintOutput(output: string): FileIssue[] {
  const issues: FileIssue[] = [];
  
  try {
    const results = JSON.parse(output);
    
    for (const file of results) {
      for (const message of file.messages) {
        issues.push({
          file: file.filePath,
          line: message.line,
          column: message.column,
          severity: message.severity === 2 ? 'error' : 'warning',
          message: message.message,
          rule: message.ruleId
        });
      }
    }
  } catch (e) {
    // Fallback to text parsing if JSON fails
  }
  
  return issues;
}

/**
 * Parse ESLint text output format (fallback)
 */
export function parseESLintTextOutput(output: string): FileIssue[] {
  const issues: FileIssue[] = [];
  const lines = output.split('\n');
  
  let currentFile = '';
  
  for (const line of lines) {
    // Match file path
    const fileMatch = line.match(/^[^ ].+\.(js|jsx|ts|tsx)$/);
    if (fileMatch) {
      currentFile = fileMatch[0];
      continue;
    }
    
    // Match error/warning
    const issueMatch = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(.+)$/);
    if (issueMatch && currentFile) {
      issues.push({
        file: currentFile,
        line: parseInt(issueMatch[1]),
        column: parseInt(issueMatch[2]),
        severity: issueMatch[3] as 'error' | 'warning',
        message: issueMatch[4],
        rule: issueMatch[5]
      });
    }
  }
  
  return issues;
}

/**
 * Parse TypeScript compiler output
 */
export function parseTypeScriptOutput(output: string, errorOutput: string): FileIssue[] {
  const issues: FileIssue[] = [];
  const combinedOutput = output + errorOutput;
  const lines = combinedOutput.split('\n');
  
  for (const line of lines) {
    // Match TypeScript error format: file(line,col): error TS1234: message
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/);
    if (match) {
      issues.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: match[4] as 'error' | 'warning',
        message: match[6],
        rule: match[5]
      });
    }
  }
  
  return issues;
}