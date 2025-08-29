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
      
      // Parse all entries first to build complete message sequence
      const entries: any[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          entries.push(entry);
        } catch {
          // Skip invalid JSON lines
          continue;
        }
      }
      
      // Find all valid user questions with their indices
      const userQuestionIndices: { index: number; question: string; timestamp: string }[] = [];
      
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        
        // Debug: log entry type and meta status
        if (process.env.DEBUG && entry.type === 'user') {
          console.error(`[DEBUG TranscriptParser] User entry ${i}: isMeta=${entry.isMeta}, content=${typeof entry.message?.content === 'string' ? entry.message.content.substring(0, 50) : 'array/null'}`);
        }
        
        // Capture user message timestamp and question (skip meta and internal messages)
        if (entry.type === 'user' && entry.timestamp && 
            !entry.isMeta && 
            !entry.isVisibleInTranscriptOnly && 
            !entry.isCompactSummary &&
            entry.message && entry.message.content) {
          
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
            // Store valid user question with its index
            userQuestionIndices.push({
              index: i,
              question: questionCandidate,
              timestamp: entry.timestamp
            });
          }
        }
      }
      
      if (process.env.DEBUG) {
        console.error(`[DEBUG TranscriptParser] Found ${userQuestionIndices.length} valid user questions`);
      }
      
      // Now find the LAST user question and its corresponding AI response
      let finalUserQuestion: string | undefined;
      let finalAssistantResponse: string | undefined;
      let lastUserTimestamp: string | null = null;
      let lastAssistantTimestamp: string | null = null;
      let messageCount = 0;
      let hasCodeBlocks = false;
      
      if (userQuestionIndices.length > 0) {
        // Get the last user question
        const lastUserEntry = userQuestionIndices[userQuestionIndices.length - 1];
        finalUserQuestion = lastUserEntry.question;
        lastUserTimestamp = lastUserEntry.timestamp;
        
        if (process.env.DEBUG) {
          console.error(`[DEBUG TranscriptParser] Last user question at index ${lastUserEntry.index}: ${finalUserQuestion.substring(0, 100)}`);
        }
        
        // Find the first assistant response AFTER this user question
        for (let i = lastUserEntry.index + 1; i < entries.length; i++) {
          const entry = entries[i];
          
          // Look for assistant message entries
          if (entry.type === 'assistant' && entry.message) {
            const message = entry.message;
            if (message.role === 'assistant' && message.content) {
              messageCount++;
              lastAssistantTimestamp = entry.timestamp;
              
              // Extract text content from the message
              let assistantText = '';
              if (typeof message.content === 'string') {
                assistantText = message.content;
              } else if (Array.isArray(message.content)) {
                // Content is an array of content blocks
                const textBlocks = message.content
                  .filter((block: any) => block.type === 'text')
                  .map((block: any) => block.text || '')
                  .join(' ');
                if (textBlocks) {
                  assistantText = textBlocks;
                  // Check if message contains code blocks
                  if (textBlocks.includes('```')) {
                    hasCodeBlocks = true;
                  }
                }
              }
              
              // Use the first assistant response after the last user question
              if (assistantText && !finalAssistantResponse) {
                finalAssistantResponse = assistantText;
                if (process.env.DEBUG) {
                  console.error(`[DEBUG TranscriptParser] Found assistant response at index ${i}: ${assistantText.substring(0, 100)}`);
                }
                break; // Stop after finding the first response
              }
            }
          }
        }
      }
      
      // Process the final Q/A pair if we found both
      if (finalAssistantResponse) {
        // Preserve markdown formatting but clean up for Slack
        let summary = finalAssistantResponse;
        
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
        
        if (process.env.DEBUG) {
          console.error(`[DEBUG TranscriptParser] Final Q/A pair:`);
          if (finalUserQuestion) {
            console.error(`[DEBUG TranscriptParser] Question: ${finalUserQuestion.substring(0, 100)}`);
          }
          console.error(`[DEBUG TranscriptParser] Response: ${summary.substring(0, 100)}`);
        }
        
        return { summary, duration, userQuestion: finalUserQuestion };
      }
      
      if (process.env.DEBUG) {
        console.error('[DEBUG TranscriptParser] No assistant response found for last user question');
      }
      
      // Return just the user question if no assistant response found
      return { userQuestion: finalUserQuestion };
    } catch (error) {
      if (process.env.DEBUG) {
        console.error('[DEBUG] Failed to read transcript:', error);
      }
      return {};
    }
  }
}