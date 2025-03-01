import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { getProjectContext, ProjectContext } from '../../../project-context.js';
import { config } from '../../../state.js';

describe('ProjectContext', () => {
  let projectContext;
  let tempDir;
  
  before(() => {
    // Create a temporary directory for testing
    tempDir = path.join(process.cwd(), 'tests', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Create a test file
    fs.writeFileSync(
      path.join(tempDir, 'test.ts'),
      'const testVar = "value"; console.log(testVar);'
    );
    
    // Initialize a new ProjectContext for testing
    projectContext = new ProjectContext(tempDir);
  });
  
  it('should initialize correctly', async () => {
    await projectContext.initialize();
    assert.strictEqual(projectContext.initialized, true);
  });
  
  it('should find TypeScript files', () => {
    const files = projectContext.findAllFiles(tempDir);
    assert.strictEqual(files.length, 1);
    assert.ok(files[0].endsWith('test.ts'));
  });
  
  it('should extract variables from files', () => {
    const content = 'const testVar = "value"; console.log(testVar);';
    const variables = projectContext.extractVariables(content);
    
    assert.ok(variables.length > 0);
    assert.ok(variables.some(v => v.name === 'testVar' && v.declaration === true));
  });
  
  it('should calculate similarity between variable names', () => {
    const score = projectContext.calculateSimilarityScore('testVar', 'testValue', 5);
    assert.ok(score > 0 && score <= 1);
  });
  
  it('should determine optimal worker count based on environment', () => {
    const workerCount = projectContext.determineOptimalWorkerCount();
    assert.ok(workerCount > 0);
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
