import { JSONLParser } from './src/utils/jsonl-parser.js';

async function test() {
  const parser = new JSONLParser();
  const testFile = '/Users/albertliu/repositories/ccusage/test/test-transcript.jsonl';
  
  console.log('Testing parser with:', testFile);
  
  try {
    const messages = await parser.parseFile(testFile);
    console.log('Parsed messages:', messages.length);
    if (messages.length > 0) {
      console.log('First message:', JSON.stringify(messages[0], null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

test();