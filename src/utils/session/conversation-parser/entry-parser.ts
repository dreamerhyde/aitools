/**
 * JSONL entry parsing utilities
 */

export interface ParsedEntry {
  type: string;
  message?: any;
  content?: string;
  timestamp?: string;
}

/**
 * Parse JSONL entries from log file lines
 */
export function parseEntries(entries: string[]): ParsedEntry[] {
  const parsedEntries: ParsedEntry[] = [];

  if (process.env.DEBUG_SESSIONS) {
    console.log(`[Parsing] Total lines: ${entries.length}`);
  }

  for (const entry of entries) {
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

  return parsedEntries;
}

/**
 * Extract model name from parsed entries
 */
export function extractModelName(entries: ParsedEntry[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === 'assistant' && entry.message && entry.message.model) {
      return entry.message.model;
    }
  }
  return '';
}
