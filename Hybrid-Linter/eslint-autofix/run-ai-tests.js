// run-ai-tests.js
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeVariableWithCrossModuleAwareness } from "./ai-analyzer.js";
import { getProjectContext } from "./project-context.js";
import { config } from "./state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Main function to run the AI cross-module awareness tests
 */
async function runAITests() {
  console.log(chalk.blue.bold("Running AI Cross-Module Awareness Tests"));
  console.log(
    chalk.gray(
      "This will test the AI's ability to detect refactoring issues across modules"
    )
  );

  // Setup test environment
  const tempDir = path.join(process.cwd(), "tests", "fixtures", "ai-tests");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Setup test config
  const originalApiKey = config.OPENAI_API_KEY;
  const originalModel = config.COMPLEX_MODEL;
  const originalTarget = config.TARGET_DIR;

  // Update config for testing
  config.USE_MOCK_AI_FOR_TESTING = process.env.USE_MOCK_AI === "true";
  config.TARGET_DIR = tempDir;
  config.COMPLEX_MODEL = process.env.AI_MODEL || "gpt-4";

  // Create test files
  console.log(chalk.gray("Creating test files..."));
  createTestFiles(tempDir);

  try {
    // Initialize project context
    console.log(chalk.gray("Initializing project context..."));
    const projectContext = await getProjectContext(tempDir);
    await projectContext.initialize();

    // Run test cases
    await testRenamingAcrossModules(tempDir, projectContext);
    await testParameterChanges(tempDir, projectContext);
    await testTypeDefinitionChanges(tempDir, projectContext);

    console.log(chalk.green.bold("\n✅ All AI tests completed successfully!"));
  } catch (error) {
    console.error(chalk.red.bold("\n❌ Tests failed:"), error);
    process.exit(1);
  } finally {
    // Restore original config
    config.OPENAI_API_KEY = originalApiKey;
    config.COMPLEX_MODEL = originalModel;
    config.TARGET_DIR = originalTarget;
  }
}

/**
 * Test the AI's ability to detect variables renamed across modules
 */
async function testRenamingAcrossModules(tempDir, projectContext) {
  console.log(chalk.blue("\nTest Case 1: Variable Renamed Across Modules"));

  const controllerPath = path.join(tempDir, "userController.ts");

  // Create a test issue
  const issue = {
    ruleId: "@typescript-eslint/no-unused-vars",
    message: "'userData' is defined but never used",
    line: 5,
    column: 9,
  };

  console.log(chalk.gray("Running AI analysis..."));

  // Run the enhanced analysis
  const analysis = await analyzeVariableWithCrossModuleAwareness(
    "userData",
    controllerPath,
    issue,
    projectContext
  );

  // Validate results
  console.log(chalk.cyan("Analysis type:"), analysis.analysisType);
  console.log(chalk.cyan("Confidence:"), analysis.confidence);
  console.log(chalk.cyan("Explanation:"), analysis.explanation);
  console.log(chalk.cyan("Recommended action:"), analysis.recommendedAction);

  // Check if analysis correctly identified this as a refactoring issue
  if (analysis.analysisType !== "GENUINE_UNUSED" && analysis.confidence > 0.7) {
    console.log(
      chalk.green("✅ Successfully identified cross-module refactoring issue")
    );
  } else {
    console.log(
      chalk.red("❌ Failed to identify cross-module issue correctly")
    );
    throw new Error(
      "Test failed: AI did not correctly identify the refactoring issue"
    );
  }
}

/**
 * Test the AI's ability to detect parameter changes across modules
 */
async function testParameterChanges(tempDir, projectContext) {
  console.log(chalk.blue("\nTest Case 2: Parameter Name Changes"));

  const appPath = path.join(tempDir, "app.ts");

  // Create a test issue
  const issue = {
    ruleId: "@typescript-eslint/no-unused-vars",
    message: "'options' is defined but never used",
    line: 6,
    column: 9,
  };

  console.log(chalk.gray("Running AI analysis..."));

  // Run the enhanced analysis
  const analysis = await analyzeVariableWithCrossModuleAwareness(
    "options",
    appPath,
    issue,
    projectContext
  );

  // Validate results
  console.log(chalk.cyan("Analysis type:"), analysis.analysisType);
  console.log(chalk.cyan("Confidence:"), analysis.confidence);
  console.log(chalk.cyan("Explanation:"), analysis.explanation);
  console.log(chalk.cyan("Recommended action:"), analysis.recommendedAction);

  // Check if analysis correctly identified this as a parameter change issue
  if (analysis.analysisType !== "GENUINE_UNUSED" && analysis.confidence > 0.7) {
    console.log(
      chalk.green("✅ Successfully identified parameter change issue")
    );
  } else {
    console.log(
      chalk.red("❌ Failed to identify parameter change issue correctly")
    );
    throw new Error(
      "Test failed: AI did not correctly identify the parameter change issue"
    );
  }
}

/**
 * Test the AI's ability to detect type definition changes
 */
async function testTypeDefinitionChanges(tempDir, projectContext) {
  console.log(chalk.blue("\nTest Case 3: Type Definition Changes"));

  const componentPath = path.join(tempDir, "component.tsx");

  // Create a test issue
  const issue = {
    ruleId: "@typescript-eslint/no-unused-vars",
    message: "'description' is defined but never used",
    line: 8,
    column: 5,
  };

  console.log(chalk.gray("Running AI analysis..."));

  // Run the enhanced analysis
  const analysis = await analyzeVariableWithCrossModuleAwareness(
    "description",
    componentPath,
    issue,
    projectContext
  );

  // Validate results
  console.log(chalk.cyan("Analysis type:"), analysis.analysisType);
  console.log(chalk.cyan("Confidence:"), analysis.confidence);
  console.log(chalk.cyan("Explanation:"), analysis.explanation);
  console.log(chalk.cyan("Recommended action:"), analysis.recommendedAction);

  // Check if analysis correctly identified this as a type definition change
  if (analysis.analysisType !== "GENUINE_UNUSED" && analysis.confidence > 0.7) {
    console.log(
      chalk.green("✅ Successfully identified type definition change")
    );
  } else {
    console.log(
      chalk.red("❌ Failed to identify type definition change correctly")
    );
    throw new Error(
      "Test failed: AI did not correctly identify the type definition change"
    );
  }
}

/**
 * Setup test files with specific refactoring issues
 */
function createTestFiles(dir) {
  // Same setup as in test file...
  // Test case 1: Renamed variable across modules
  const userService = `// userService.ts
export function getUserData(userId: string) {
  // Fetch user data from API
  return {
    id: userId,
    name: 'John Doe',
    email: 'john@example.com'
  };
}

export function updateUserInfo(userId: string, userInfo: any) {
  // Previously this was named 'userData', but was renamed to 'userInfo' during refactoring
  console.log(\`Updating user \${userId} with \${JSON.stringify(userInfo)}\`);
  return true;
}`;

  const userController = `// userController.ts
import { getUserData, updateUserInfo } from './userService';

export function handleUserUpdate(userId: string) {
  // This variable is flagged as unused, but it's actually a refactoring issue
  const userData = getUserData(userId);

  // The problem is here - should be using 'userData' but the function parameter name
  // changed in userService.ts from 'userData' to 'userInfo'
  return updateUserInfo(userId, {
    name: 'Updated Name',
    email: 'updated@example.com'
  });
}`;

  // Test case 2: Parameter name mismatch
  const configUtils = `// configUtils.ts
export function initializeApp(config: any) {
  // This function previously accepted 'options' but was renamed to 'config'
  console.log('Initializing app with config:', config);
  return {
    isInitialized: true,
    config
  };
}`;

  const app = `// app.ts
import { initializeApp } from './configUtils';

function startApp() {
  // The 'options' parameter is flagged as unused because it doesn't match
  // the parameter name in the imported function anymore
  const options = {
    debug: true,
    logLevel: 'info'
  };

  // Should be passing 'options' as 'config'
  const app = initializeApp({
    debug: false,
    logLevel: 'error'
  });

  return app;
}`;

  // Test case 3: Type definition changes
  const types = `// types.ts
export interface CardProps {
  title: string;
  content: string; // This was previously named 'description'
  imageUrl?: string;
  onClick?: () => void;
}`;

  const component = `// component.tsx
import React from 'react';
import { CardProps } from './types';

const Card: React.FC<CardProps> = (props) => {
  const {
    title,
    // 'description' is flagged as unused because it was renamed to 'content' in the type definition
    description,
    imageUrl,
    onClick
  } = props;

  return (
    <div className="card" onClick={onClick}>
      <h2>{title}</h2>
      <p>{description}</p>
      {imageUrl && <img src={imageUrl} alt={title} />}
    </div>
  );
};

export default Card;`;

  // Write all files
  fs.writeFileSync(path.join(dir, "userService.ts"), userService);
  fs.writeFileSync(path.join(dir, "userController.ts"), userController);
  fs.writeFileSync(path.join(dir, "configUtils.ts"), configUtils);
  fs.writeFileSync(path.join(dir, "app.ts"), app);
  fs.writeFileSync(path.join(dir, "types.ts"), types);
  fs.writeFileSync(path.join(dir, "component.tsx"), component);

  console.log(chalk.green("Test files created successfully"));
}

// Run tests if this script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAITests().catch((error) => {
    console.error(chalk.red("Tests failed with error:"), error);
    process.exit(1);
  });
}

export { runAITests };
