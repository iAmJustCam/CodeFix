// tests/integration/cross-module-tests.js
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeVariableWithCrossModuleAwareness } from '../../ai-analyzer.js';
import { getProjectContext } from '../../project-context.js';
import { config } from '../../state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Integration test for cross-module AI analysis
 */
export async function testCrossModuleAI() {
  console.log("Running Cross-Module AI Analysis test...");

  // Setup test environment
  const tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'ai-tests');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Save original config values
  const originalMockAI = config.USE_MOCK_AI_FOR_TESTING;

  try {
    // Set up for testing
    config.USE_MOCK_AI_FOR_TESTING = true; // Use mock AI for tests
    config.TARGET_DIR = tempDir;

    // Create test files
    setupTestFiles(tempDir);

    // Initialize project context
    const projectContext = await getProjectContext(tempDir);
    await projectContext.initialize();

    // Test a simple case - variable renamed across modules
    const controllerPath = path.join(tempDir, "userController.ts");
    const issue = {
      ruleId: "@typescript-eslint/no-unused-vars",
      message: "'userData' is defined but never used",
      line: 5,
      column: 9,
    };

    // Run the analysis
    const analysis = await analyzeVariableWithCrossModuleAwareness(
      "userData",
      controllerPath,
      issue,
      projectContext
    );

    // Log the analysis for debugging
    console.log("Analysis result:", JSON.stringify(analysis, null, 2));

    // Basic assertions
    assert.ok(
      analysis.confidence > 0.5,
      "Analysis should have reasonable confidence"
    );
    assert.ok(
      analysis.possibleActions && analysis.possibleActions.length > 0,
      "Analysis should provide possible actions"
    );

    // Check if more sophisticated than simple "prefix with underscore" recommendation
    const hasAdvancedAction = analysis.possibleActions.some(
      (action) => action.action !== "PREFIX" && action.action !== "REMOVE"
    );

    assert.ok(
      hasAdvancedAction,
      "Analysis should suggest more advanced actions than just PREFIX or REMOVE"
    );

    console.log("Cross-Module AI Analysis test successful");
    return true;
  } catch (error) {
    console.error("Cross-Module AI Analysis test failed:", error);
    throw error;
  } finally {
    // Restore original config
    config.USE_MOCK_AI_FOR_TESTING = originalMockAI;
  }
}

/**
 * Setup test files with specific refactoring issues
 */
function setupTestFiles(dir) {
  // Test case 1: Renamed variable across modules
  const userService = `// userService.ts
export function getUserData(userId: string) {
  return {
    id: userId,
    name: 'John Doe',
    email: 'john@example.com'
  };
}

export function updateUserInfo(userId: string, userInfo: any) {
  // Previously this was named 'userData', but was renamed to 'userInfo'
  console.log(\`Updating user \${userId}\`);
  return true;
}`;

  const userController = `// userController.ts
import { getUserData, updateUserInfo } from './userService';

export function handleUserUpdate(userId: string) {
  // This variable is flagged as unused, but it's actually a refactoring issue
  const userData = getUserData(userId);

  // Should be using 'userData' parameter here
  return updateUserInfo(userId, {
    name: 'Updated Name',
    email: 'updated@example.com'
  });
}`;

  // Write test files
  fs.writeFileSync(path.join(dir, "userService.ts"), userService);
  fs.writeFileSync(path.join(dir, "userController.ts"), userController);
}

/**
 * Add this test to your existing test suite
 */
export function addCrossModuleAITests(testSuite) {
  testSuite.addTest({
    name: "Cross-Module AI Analysis",
    run: testCrossModuleAI,
  });
}
