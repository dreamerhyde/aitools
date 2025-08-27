import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import { ConversationMessage, TokenUsage, MODEL_PRICING } from '../types/claude-usage.js';
import { PricingFetcher } from './pricing-fetcher.js';

export class JSONLParser {
  private logDirs: string[];
  private pricingFetcher: PricingFetcher;
  private silent: boolean = false;

  constructor(logDir?: string, useDynamicPricing: boolean = true, silent: boolean = false) {
    this.silent = silent;
    // Match ccusage's logic for finding Claude data
    const home = process.env.HOME || '';
    this.pricingFetcher = new PricingFetcher(!useDynamicPricing);
    
    if (logDir) {
      // If custom path provided, check if it needs /projects appended
      if (logDir.endsWith('projects')) {
        this.logDirs = [logDir];
      } else {
        // Check if projects subdirectory exists
        this.logDirs = [
          path.join(logDir, 'projects'),
          logDir // Also try the directory itself
        ];
      }
    } else {
      // Default paths matching ccusage
      const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
      this.logDirs = [
        path.join(xdgConfig, 'claude', 'projects'), // XDG standard (primary)
        path.join(home, '.claude', 'projects')      // Legacy location
      ];
    }
  }

  async findLogFiles(): Promise<string[]> {
    const allFiles: string[] = [];
    
    for (const dir of this.logDirs) {
      try {
        // Check if directory exists
        await fs.promises.access(dir);
        
        // Special handling for .claude/projects directory
        if (dir.endsWith('projects')) {
          // Recursively find all .jsonl files in subdirectories
          const jsonlFiles = await this.findJsonlRecursive(dir);
          allFiles.push(...jsonlFiles);
        } else {
          // Direct directory listing for other locations
          const files = await fs.promises.readdir(dir);
          const jsonlFiles = files
            .filter(f => f.endsWith('.jsonl'))
            .map(f => path.join(dir, f));
          allFiles.push(...jsonlFiles);
        }
      } catch {
        // Directory doesn't exist or isn't accessible, skip it
      }
    }
    
    if (allFiles.length === 0) {
      console.log(chalk.gray('Checked directories:'));
      this.logDirs.forEach(dir => console.log(chalk.gray(`  - ${dir}`)));
    }
    
    return allFiles.sort();
  }

  private async findJsonlRecursive(dir: string): Promise<string[]> {
    const jsonlFiles: string[] = [];
    
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively search subdirectories
          const subFiles = await this.findJsonlRecursive(fullPath);
          jsonlFiles.push(...subFiles);
        } else if (entry.name.endsWith('.jsonl')) {
          jsonlFiles.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
    
    return jsonlFiles;
  }

  async parseFile(filePath: string): Promise<ConversationMessage[]> {
    const messages: ConversationMessage[] = [];
    const lines: string[] = [];
    
    // Track message hashes for deduplication
    const processedHashes = new Set<string>();
    
    try {
      // First, read all lines with better error handling
      await new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
        const rl = readline.createInterface({
          input: stream,
          crlfDelay: Infinity
        });

        rl.on('line', (line) => {
          if (line.trim()) { // Skip empty lines
            lines.push(line.trim());
          }
        });

        rl.on('error', (error) => {
          console.warn(`Error reading file ${filePath}:`, error.message);
          reject(error);
        });

        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          rl.close();
          reject(new Error(`Timeout reading file: ${filePath}`));
        }, 30000); // 30 second timeout

        rl.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } catch (error) {
      console.warn(`Failed to read file ${filePath}:`, error);
      return messages; // Return empty array instead of failing
    }

    // Then process each line asynchronously
    let validCount = 0;
    let skipCount = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        
        // Check for duplicate using same logic as ccusage
        const hash = this.createUniqueHash(entry);
        if (hash && processedHashes.has(hash)) {
          skipCount++;
          continue;
        }
        
        const message = await this.extractMessage(entry);
        if (message) {
          messages.push(message);
          validCount++;
          if (hash) {
            processedHashes.add(hash);
          }
        }
      } catch (err) {
        // Skip invalid JSON lines - this is expected for some lines
      }
    }

    // Debug info for files with today's data
    if (process.env.DEBUG) {
      const fileName = filePath.split('/').pop();
      const todayLines = lines.filter(line => {
        try {
          const entry = JSON.parse(line);
          return entry.timestamp?.startsWith('2025-08-24');
        } catch { return false; }
      });
      
      if (todayLines.length > 0 || validCount > 100) {
        console.log(`${fileName}: ${validCount} valid messages, ${skipCount} duplicates from ${lines.length} lines (${todayLines.length} today)`);
      }
    }

    return messages;
  }

  private createUniqueHash(entry: any): string | null {
    // Create unique hash like CCUsage for deduplication
    const messageId = entry.message?.id;
    const requestId = entry.requestId;
    
    if (!messageId || !requestId) {
      return null;
    }
    
    return `${messageId}:${requestId}`;
  }


  private async extractMessage(entry: any): Promise<ConversationMessage | null> {
    try {
      // Validate required fields like CCUsage does
      if (!entry.timestamp || typeof entry.timestamp !== 'string') {
        return null;
      }
      
      // Skip non-assistant messages - only assistant messages have usage data
      if (entry.type && entry.type !== 'assistant') {
        return null;
      }
      
      if (!entry.message?.usage) {
        return null;
      }
      
      const usage = entry.message.usage;
      if (typeof usage.input_tokens !== 'number' || typeof usage.output_tokens !== 'number') {
        return null;
      }
      
      // Model is optional in CCUsage schema but required for our calculations
      const model = entry.message?.model;
      if (!model || typeof model !== 'string') {
        return null;
      }
      
      // Extract token usage exactly like CCUsage
      // The top-level cache_creation_input_tokens and cache_read_input_tokens 
      // are the values we should use (they already include all ephemeral tokens)
      const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
      const cacheReadTokens = usage.cache_read_input_tokens || 0;
      
      const tokenUsage: TokenUsage = {
        input: usage.input_tokens || 0,
        output: usage.output_tokens || 0,
        cache_creation: cacheCreationTokens,
        cache_read: cacheReadTokens
      };
      
      // Use the exact fields CCUsage uses
      const timestamp = entry.timestamp;
      const conversationId = entry.sessionId || entry.conversation_id;
      const requestId = entry.requestId;
      const title = entry.title;
      
      // Calculate cost using dynamic pricing (or use costUSD if available like CCUsage)
      const cost = entry.costUSD ?? await this.calculateCostAsync(model, tokenUsage);
      
      return {
        timestamp,
        model,
        usage: tokenUsage,
        cost: cost || 0, // Ensure cost is always a number
        conversation_id: conversationId,
        project_id: requestId,
        title,
        message_id: entry.message?.id, // Store message ID for reference
        cwd: entry.cwd // Extract current working directory for project identification
      };
    
    } catch {
      return null;
    }
  }

  private async calculateCostAsync(model: string, usage: TokenUsage): Promise<number> {
    try {
      return await this.pricingFetcher.calculateCostFromTokens({
        input_tokens: usage.input,
        output_tokens: usage.output,
        cache_creation_input_tokens: usage.cache_creation,
        cache_read_input_tokens: usage.cache_read,
      }, model);
    } catch (error) {
      // Fallback to static pricing on error
      console.warn(`Failed to get dynamic pricing for ${model}, using fallback:`, error);
      return this.calculateCostStatic(model, usage);
    }
  }

  private calculateCostStatic(model: string, usage: TokenUsage): number {
    // Normalize model name for matching
    const modelLower = model.toLowerCase();
    
    // Find pricing for model - check for exact match first, then partial
    let pricing = null;
    
    // Check for opus-4 variations (including new format like claude-opus-4-1-20250805)
    if (modelLower.includes('opus-4') || modelLower.includes('opus_4') || 
        modelLower.includes('claude-opus-4') || modelLower.includes('opus-4-1')) {
      pricing = MODEL_PRICING['opus-4'];
    }
    // Check for sonnet-4 variations (including new format like claude-sonnet-4-1-20250805)
    else if (modelLower.includes('sonnet-4') || modelLower.includes('sonnet_4') ||
             modelLower.includes('claude-sonnet-4') || modelLower.includes('sonnet-4-1')) {
      pricing = MODEL_PRICING['sonnet-4'];
    }
    // Check for Claude 3.5 Sonnet
    else if (modelLower.includes('claude-3-5-sonnet') || modelLower.includes('claude-3.5-sonnet')) {
      pricing = MODEL_PRICING['sonnet-4'];  // Use sonnet-4 pricing for 3.5 as well
    }
    // Check for haiku variations
    else if (modelLower.includes('haiku') && (modelLower.includes('3-5') || modelLower.includes('3.5'))) {
      pricing = MODEL_PRICING['claude-3-5-haiku-20241022'];
    }
    // Legacy models
    else if (modelLower.includes('opus') && modelLower.includes('3') && !modelLower.includes('4')) {
      pricing = MODEL_PRICING['claude-3-opus-20240229'];
    }
    else {
      // Try exact match
      for (const [modelKey, modelPricing] of Object.entries(MODEL_PRICING)) {
        if (model === modelKey || modelLower === modelKey.toLowerCase()) {
          pricing = modelPricing;
          break;
        }
      }
    }
    
    // Default to sonnet-4 pricing if not found
    if (!pricing) {
      pricing = MODEL_PRICING['sonnet-4'];
    }

    // Calculate cost in dollars (pricing is per million tokens)
    const inputCost = (usage.input / 1_000_000) * pricing.input;
    const outputCost = (usage.output / 1_000_000) * pricing.output;
    const cacheCreationCost = ((usage.cache_creation || 0) / 1_000_000) * pricing.cache_creation;
    const cacheReadCost = ((usage.cache_read || 0) / 1_000_000) * pricing.cache_read;

    return inputCost + outputCost + cacheCreationCost + cacheReadCost;
  }

  async parseLogs(daysBack: number = 1): Promise<ConversationMessage[]> {
    // Parse only the last N days of logs
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    return this.parseAllLogs(startDate, endDate);
  }

  async parseAllLogs(startDate?: Date, endDate?: Date): Promise<ConversationMessage[]> {
    const files = await this.findLogFiles();
    const allMessages: ConversationMessage[] = [];
    const globalProcessedHashes = new Set<string>(); // Global deduplication across all files
    let totalFiles = 0;
    let processedFiles = 0;
    let emptyFiles = 0;
    let failedFiles = 0;
    let globalDuplicates = 0;

    for (const file of files) {
      totalFiles++;
      try {
        const messages = await this.parseFile(file);
        // Additional cross-file deduplication
        const dedupedMessages = [];
        for (const msg of messages) {
          // Create hash from message data for cross-file dedup
          if (msg.message_id && msg.project_id) {
            const hash = `${msg.message_id}:${msg.project_id}`;
            if (globalProcessedHashes.has(hash)) {
              globalDuplicates++;
              continue;
            }
            globalProcessedHashes.add(hash);
          }
          dedupedMessages.push(msg);
        }
        
        if (dedupedMessages.length > 0) {
          allMessages.push(...dedupedMessages);
          processedFiles++;
        } else {
          emptyFiles++;
          if (process.env.DEBUG) {
            console.log(`Empty file (no valid messages): ${file.split('/').pop()}`);
          }
        }
      } catch (error: any) {
        failedFiles++;
        console.warn(`Failed to parse file ${file.split('/').pop()}:`, error.message);
        // Continue processing other files
      }
    }

    // Debug info (only if DEBUG mode and not silent)
    if (!this.silent && (process.env.DEBUG || (totalFiles > 10 && processedFiles < totalFiles * 0.7))) {
      console.log(`Processed ${processedFiles}/${totalFiles} files (${emptyFiles} empty, ${failedFiles} failed), got ${allMessages.length} messages`);
      if (globalDuplicates > 0) {
        console.log(`Cross-file duplicates removed: ${globalDuplicates}`);
      }
      
      // Count today messages before any filtering
      const todayBeforeFilter = allMessages.filter(m => m.timestamp.startsWith('2025-08-24')).length;
      console.log(`Messages before any filtering: ${allMessages.length}, today: ${todayBeforeFilter}`);
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      const filtered = allMessages.filter(msg => {
        const msgDate = new Date(msg.timestamp);
        if (startDate && msgDate < startDate) return false;
        if (endDate && msgDate > endDate) return false;
        return true;
      });
      
      if (process.env.DEBUG) {
        const todayAfterFilter = filtered.filter(m => m.timestamp.startsWith('2025-08-24')).length;
        console.log(`After date filtering: ${filtered.length} messages, today: ${todayAfterFilter}`);
        console.log(`Date filter: startDate=${startDate}, endDate=${endDate}`);
      }
      
      return filtered;
    }

    return allMessages;
  }
}