import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { initializeForIDE, getProjectInfo } from '../../../ide-integration.js';
import { config } from '../../../state.js';

describe('IDE Integration', () => {
  let tempDir;
  
  before(() => {
    // Create a temporary directory for testing
    tempDir = path.join(process.cwd(), 'tests', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Create a test file
    fs.writeFileSync(
      path.join(tempDir, 'ide-test.ts'),
      'const unusedVar = "test";'
    );
    
    // Set up config
    config.TARGET_DIR = tempDir;
    config.USE_MOCK_AI_FOR_TESTING = true;
  });
  
  it('should initialize for IDE usage', async () => {
    const result = await initializeForIDE({
      TARGET_DIR: tempDir,
      USE_AI_FOR_UNUSED_VARS: true,
      CROSS_FILE_ANALYSIS: true
    });
    
    assert.ok(result.initialized);
    assert.ok(result.filesAnalyzed > 0);
  });
  
  it('should retrieve project information', async () => {
    const result = await getProjectInfo();
    
    assert.ok(result.success);
    assert.ok(result.stats);
    assert.ok(result.config);
  });
  
  after(() => {
    // Clean up
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch (e) {
      console.error('Failed to clean up test directory:', e);
    }
  });
});
