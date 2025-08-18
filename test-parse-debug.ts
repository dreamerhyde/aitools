import * as fs from 'fs';
import * as readline from 'readline';

async function testParse() {
  const testFile = '/Users/albertliu/repositories/ccusage/test/test-transcript.jsonl';
  
  console.log('Reading file:', testFile);
  
  const stream = fs.createReadStream(testFile);
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let lineNum = 0;
  rl.on('line', (line) => {
    lineNum++;
    try {
      const entry = JSON.parse(line);
      console.log(`Line ${lineNum}:`, JSON.stringify(entry));
      
      // Check if it matches our expected format
      if (entry.type === 'assistant' && entry.message?.usage) {
        console.log('  -> Assistant message with usage found!');
        console.log('  -> Usage:', entry.message.usage);
      }
    } catch (err) {
      console.log(`Line ${lineNum}: Parse error -`, err);
    }
  });

  rl.on('close', () => {
    console.log('Done reading file');
  });
}

testParse();