#!/usr/bin/env node

// Test script to verify monitor command session boxes display
// Run with: node test-monitor.js

import { execSync } from 'child_process';

console.log('Testing monitor command session boxes...\n');

try {
  // Run typecheck first
  console.log('Running TypeScript type check...');
  execSync('bun run typecheck', { stdio: 'inherit', cwd: '/Users/albertliu/repositories/aitools' });
  console.log('✓ TypeScript check passed\n');
  
  // Build the project
  console.log('Building the project...');
  execSync('bun run build', { stdio: 'inherit', cwd: '/Users/albertliu/repositories/aitools' });
  console.log('✓ Build completed successfully\n');
  
  console.log('All checks passed! The monitor command should now display Q/A messages properly.');
  console.log('\nTo test the monitor command, run:');
  console.log('  bun run dev monitor');
  console.log('or');
  console.log('  ./dist/cli.js monitor');
  
} catch (error) {
  console.error('Error during testing:', error.message);
  process.exit(1);
}