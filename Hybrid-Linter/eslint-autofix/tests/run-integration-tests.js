#!/usr/bin/env node
// tests/run-integration-tests.js

import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

// Make sure test directories exist
const testDir = path.join(process.cwd(), 'tests');
const integrationDir = path.join(testDir, 'integration');
const fixturesDir = path.join(testDir, 'fixtures');

if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

// Function to run all tests
function runAllTests() {
  console.log('Running all integration tests...');
  try {
    execSync(`node ${path.join(integrationDir, 'test-suite.js')}`, { stdio: 'inherit' });
    console.log('All integration tests completed successfully!');
  } catch (error) {
    console.error('Integration test suite failed with exit code:', error.status);
    process.exit(1);
  }
}

// Function to run specific test
function runSpecificTest(testName) {
  console.log(`Running integration test: ${testName}`);
  try {
    execSync(`node ${path.join(integrationDir, 'test-suite.js')} --test=${testName}`, { stdio: 'inherit' });
    console.log(`Test "${testName}" completed successfully!`);
  } catch (error) {
    console.error(`Test "${testName}" failed with exit code:`, error.status);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  // Run all tests by default
  runAllTests();
} else {
  const testNameArg = args.find(arg => arg.startsWith('--test='));
  if (testNameArg) {
    const testName = testNameArg.split('=')[1];
    runSpecificTest(testName);
  } else {
    console.log('Usage: node run-integration-tests.js [--test=TestName]');
    console.log('Available tests:');
    console.log('  - Parallel Processing');
    console.log('  - Cross-File Analysis');
    console.log('  - AI Analysis Confidence');
    console.log('  - Rollback & Checkpoints');
    console.log('  - Team Profiles');
    console.log('  - Language Expansion');
    console.log('  - Monetization Features');
    console.log('  - Visual Reporting');
    console.log('  - IDE Integration');
  }
}
