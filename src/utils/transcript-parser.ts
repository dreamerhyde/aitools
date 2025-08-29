// path: src/utils/transcript-parser.ts

import fs from 'fs/promises';

/**
 * Parses AI transcript files to extract summaries and timing
 */
export class TranscriptParser {
  /**
   * Extract AI summary and timing from Claude Code transcript file
   */
  async extractAISummaryAndTiming(transcriptPath: string): Promise<{ summary?: string; duration?: number; userQuestion?: string }> {
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
      let firstUserQuestion: string | null = null;
      let userQuestions: string[] = [];
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          // Debug: log entry type and meta status
          if (process.env.DEBUG && entry.type === 'user') {
            console.error(`[DEBUG TranscriptParser] User entry: isMeta=${entry.isMeta}, content=${typeof entry.message?.content === 'string' ? entry.message.content.substring(0, 50) : 'array/null'}`);
          }
          
          // Capture user message timestamp and first question (skip meta and internal messages)
          if (entry.type === 'user' && entry.timestamp && 
              !entry.isMeta && 
              !entry.isVisibleInTranscriptOnly && 
              !entry.isCompactSummary) {
            lastUserTimestamp = entry.timestamp;
            
            // Capture the first meaningful user question (skip system messages)
            if (!firstUserQuestion && entry.message && entry.message.content) {
              let questionCandidate = '';
              if (typeof entry.message.content === 'string') {
                questionCandidate = entry.message.content;
              } else if (Array.isArray(entry.message.content)) {
                const textBlocks = entry.message.content
                  .filter((block: any) => block.type === 'text')
                  .map((block: any) => block.text || '')
                  .join(' ');
                if (textBlocks) {
                  questionCandidate = textBlocks;
                }
              }
              
              // Skip system-generated messages, meta messages, and session continuations
              if (questionCandidate && 
                  !questionCandidate.startsWith('Caveat:') && 
                  !questionCandidate.startsWith('<system-reminder>') &&
                  !questionCandidate.startsWith('<command-name>') &&
                  !questionCandidate.startsWith('<local-command-stdout>') &&
                  !questionCandidate.startsWith('This session is being continued') &&
                  !questionCandidate.includes('The messages below were generated') &&
                  !questionCandidate.includes('The conversation is summarized below') &&
                  !questionCandidate.includes('Please continue the conversation') &&
                  !questionCandidate.includes('DO NOT respond to these messages') &&
                  !questionCandidate.includes('ran out of context') &&
                  !questionCandidate.includes('[Request interrupted') &&
                  questionCandidate.trim().length > 5) {
                // Store all valid user questions
                userQuestions.push(questionCandidate);
                // Keep the first one for backwards compatibility
                if (!firstUserQuestion) {
                  firstUserQuestion = questionCandidate;
                }
              }
            }
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
        
        // Use the last user question instead of first (more likely to be the actual query)
        const userQuestion = userQuestions.length > 0 ? userQuestions[userQuestions.length - 1] : firstUserQuestion;
        
        if (process.env.DEBUG) {
          console.error(`[DEBUG TranscriptParser] Found ${userQuestions.length} valid questions`);
          if (userQuestion) {
            console.error(`[DEBUG TranscriptParser] Using question: ${userQuestion.substring(0, 100)}`);
          } else {
            console.error(`[DEBUG TranscriptParser] No valid user question found`);
          }
        }
        
        return { summary, duration, userQuestion: userQuestion || undefined };
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
      
      // Use the last user question instead of first
      const userQuestion = userQuestions.length > 0 ? userQuestions[userQuestions.length - 1] : firstUserQuestion;
      return { duration, userQuestion: userQuestion || undefined };
    } catch (error) {
      if (process.env.DEBUG) {
        console.error('[DEBUG] Failed to read transcript:', error);
      }
      return {};
    }
  }
}