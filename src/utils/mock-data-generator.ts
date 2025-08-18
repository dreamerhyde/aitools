import * as fs from 'fs';
import * as path from 'path';

export class MockDataGenerator {
  static async generateSampleLogs(outputDir?: string): Promise<string> {
    const dir = outputDir || path.join(process.env.HOME || '', '.claude', 'logs');
    
    // Create directory if it doesn't exist
    await fs.promises.mkdir(dir, { recursive: true });
    
    const fileName = `claude-usage-${new Date().toISOString().split('T')[0]}.jsonl`;
    const filePath = path.join(dir, fileName);
    
    // Generate sample data for the past 7 days
    const messages: any[] = [];
    const models = [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229'
    ];
    
    const now = new Date();
    for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
      const date = new Date(now);
      date.setDate(date.getDate() - daysAgo);
      
      // Generate 5-20 messages per day
      const messageCount = Math.floor(Math.random() * 15) + 5;
      
      for (let i = 0; i < messageCount; i++) {
        const timestamp = new Date(date);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        
        const model = models[Math.floor(Math.random() * models.length)];
        const conversationId = `conv-${daysAgo}-${Math.floor(i / 3)}`;
        
        messages.push({
          type: 'conversation_message',
          timestamp: timestamp.toISOString(),
          model,
          conversation_id: conversationId,
          title: `Sample Conversation ${conversationId}`,
          usage: {
            input_tokens: Math.floor(Math.random() * 5000) + 500,
            output_tokens: Math.floor(Math.random() * 2000) + 100,
            cache_creation_input_tokens: Math.floor(Math.random() * 1000),
            cache_read_input_tokens: Math.floor(Math.random() * 500)
          }
        });
      }
    }
    
    // Sort by timestamp
    messages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Write to JSONL file
    const content = messages.map(msg => JSON.stringify(msg)).join('\n');
    await fs.promises.writeFile(filePath, content);
    
    return filePath;
  }
}