// path: src/utils/transcript-parser.ts

import fs from 'fs/promises';

/**
 * Parses AI transcript files to extract summaries and timing
 */
export class TranscriptParser {
  /**
   * Extract AI summary and timing from Claude Code transcript file
   */
  async extractAISummaryAndTiming(transcriptPath: string): Promise<{ summary?: string; duration?: number }> {
    try {
      // Read the JSONL transcript file
      const transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
      const lines = transcriptContent.trim().split('\n');
      
      // Parse each line as JSON and look for assistant messages and timestamps
      let lastAssistantMessage = '';
      let messageCount = 0;
      let hasCodeBlocks = false;
      let lastUserTimestamp: string | null = null;
      let lastAssistantTimestamp: string | null = null;
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          // Capture user message timestamp
          if (entry.type === 'user' && entry.timestamp) {
            lastUserTimestamp = entry.timestamp;
          }
          
          // Look for assistant message entries (check both entry.type and entry.message structure)
          if (entry.type === 'assistant' && entry.message) {
            // Handle nested message structure from Claude Code transcripts
            const message = entry.message;
            if (message.role === 'assistant' && message.content) {
              messageCount++;
              lastAssistantTimestamp = entry.timestamp; // Capture assistant timestamp
              // Extract text content from the message
              if (typeof message.content === 'string') {
                lastAssistantMessage = message.content;
              } else if (Array.isArray(message.content)) {
                // Content is an array of content blocks
                const textBlocks = message.content
                  .filter((block: any) => block.type === 'text')
                  .map((block: any) => block.text || '')
                  .join(' ');
                if (textBlocks) {
                  lastAssistantMessage = textBlocks;
                  // Check if message contains code blocks
                  if (textBlocks.includes('```')) {
                    hasCodeBlocks = true;
                  }
                }
              }
            }
          } else if (entry.type === 'message' && entry.role === 'assistant' && entry.content) {
            // Alternative format (simpler structure)
            messageCount++;
            if (typeof entry.content === 'string') {
              lastAssistantMessage = entry.content;
            } else if (Array.isArray(entry.content)) {
              const textBlocks = entry.content
                .filter((block: any) => block.type === 'text')
                .map((block: any) => block.text || '')
                .join(' ');
              if (textBlocks) {
                lastAssistantMessage = textBlocks;
                if (textBlocks.includes('```')) {
                  hasCodeBlocks = true;
                }
              }
            }
          }
        } catch (parseError) {
          // Skip invalid JSON lines
          continue;
        }
      }
      
      if (lastAssistantMessage) {
        // Preserve markdown formatting but clean up for Slack
        let summary = lastAssistantMessage;
        
        // Convert markdown code blocks to Slack format
        summary = summary.replace(/```(\w+)?\n/g, '```');
        
        // Preserve bullet points and numbered lists
        summary = summary.replace(/^(\d+)\.\s+/gm, '$1. ');
        summary = summary.replace(/^[-*]\s+/gm, '• ');
        
        // Keep first 2000 characters for more context
        if (summary.length > 2000) {
          // Try to cut at a sentence boundary
          const cutPoint = summary.lastIndexOf('. ', 1997);
          if (cutPoint > 1500) {
            summary = summary.substring(0, cutPoint + 1) + '...';
          } else {
            summary = summary.substring(0, 1997) + '...';
          }
        }
        
        // Add context about the conversation
        const conversationContext = [];
        if (messageCount > 1) {
          conversationContext.push(`_${messageCount} AI responses_`);
        }
        if (hasCodeBlocks) {
          conversationContext.push(`_includes code changes_`);
        }
        
        if (conversationContext.length > 0) {
          summary = `${summary}\n\n${conversationContext.join(' | ')}`;
        }
        
        // Calculate duration from last user message to last assistant response
        let duration: number | undefined;
        if (lastUserTimestamp && lastAssistantTimestamp) {
          const userTime = new Date(lastUserTimestamp).getTime();
          const assistantTime = new Date(lastAssistantTimestamp).getTime();
          duration = assistantTime - userTime;
        }
        
        return { summary, duration };
      }
      
      if (process.env.DEBUG) {
        console.error('[DEBUG] No assistant messages found in transcript');
      }
      
      // Calculate duration even if no assistant messages
      let duration: number | undefined;
      if (lastUserTimestamp && lastAssistantTimestamp) {
        const userTime = new Date(lastUserTimestamp).getTime();
        const assistantTime = new Date(lastAssistantTimestamp).getTime();
        duration = assistantTime - userTime;
      }
      
      return { duration };
    } catch (error) {
      if (process.env.DEBUG) {
        console.error('[DEBUG] Failed to read transcript:', error);
      }
      return {};
    }
  }
}