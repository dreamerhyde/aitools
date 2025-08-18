import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import { ConversationMessage, TokenUsage, MODEL_PRICING } from '../types/claude-usage.js';
import { PricingFetcher } from './pricing-fetcher.js';

export class JSONLParser {
  private logDirs: string[];
  private pricingFetcher: PricingFetcher;
  private processedHashes: Set<string> = new Set();

  constructor(logDir?: string, useDynamicPricing: boolean = true) {
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
    
    // First, read all lines
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        lines.push(line);
      });

      rl.on('close', () => resolve());
      rl.on('error', reject);
    });

    // Then process each line asynchronously
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const message = await this.extractMessage(entry);
        if (message) {
          messages.push(message);
        }
      } catch (err) {
        // Skip invalid JSON lines
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

  private formatDate(dateStr: string, timezone?: string): string {
    // Format date like CCUsage using Intl.DateTimeFormat
    const date = new Date(dateStr);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone
    });
    return formatter.format(date);
  }

  private async extractMessage(entry: any): Promise<ConversationMessage | null> {
    try {
      // Follow CCUsage's exact validation logic from usageDataSchema
      // Required fields:
      // 1. timestamp (ISO string)
      // 2. message.usage with input_tokens and output_tokens
      // 3. message.model (optional in schema but we need it)
      // 4. requestId (optional in schema but helps with deduplication)
      
      // Validate required fields like CCUsage does
      if (!entry.timestamp || typeof entry.timestamp !== 'string') {
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
      
      // Skip non-assistant messages like CCUsage does
      if (entry.type && entry.type !== 'assistant') {
        return null;
      }
      
      // Check for duplicates using hash
      const uniqueHash = this.createUniqueHash(entry);
      if (uniqueHash && this.processedHashes.has(uniqueHash)) {
        return null; // Skip duplicate
      }
      if (uniqueHash) {
        this.processedHashes.add(uniqueHash);
      }
      
      // Extract token usage exactly like CCUsage
      const tokenUsage: TokenUsage = {
        input: usage.input_tokens || 0,
        output: usage.output_tokens || 0,
        cache_creation: usage.cache_creation_input_tokens || 0,
        cache_read: usage.cache_read_input_tokens || 0
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
        message_id: entry.message?.id // Store message ID for reference
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
    
    // Check for opus-4 variations
    if (modelLower.includes('opus-4') || modelLower.includes('opus_4') || 
        modelLower.includes('claude-opus-4')) {
      pricing = MODEL_PRICING['opus-4'];
    }
    // Check for sonnet variations
    else if (modelLower.includes('sonnet-4') || modelLower.includes('sonnet_4') ||
             modelLower.includes('claude-3-5-sonnet')) {
      pricing = MODEL_PRICING['sonnet-4'];
    }
    // Check for haiku variations
    else if (modelLower.includes('haiku') && modelLower.includes('3-5')) {
      pricing = MODEL_PRICING['claude-3-5-haiku-20241022'];
    }
    // Legacy models
    else if (modelLower.includes('opus') && modelLower.includes('3')) {
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
    
    // Default to sonnet pricing if not found
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

  async parseAllLogs(startDate?: Date, endDate?: Date): Promise<ConversationMessage[]> {
    // Reset processed hashes for new parsing session
    this.processedHashes.clear();
    
    const files = await this.findLogFiles();
    const allMessages: ConversationMessage[] = [];

    for (const file of files) {
      const messages = await this.parseFile(file);
      allMessages.push(...messages);
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      return allMessages.filter(msg => {
        const msgDate = new Date(msg.timestamp);
        if (startDate && msgDate < startDate) return false;
        if (endDate && msgDate > endDate) return false;
        return true;
      });
    }

    return allMessages;
  }
}