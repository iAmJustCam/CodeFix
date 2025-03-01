// Quick Start Guide for Hybrid Linter
// This example shows how to use Hybrid Linter to fix ESLint issues

// 1. Import the necessary functions
const { processFile } = require("./processing-modes");
const { getProjectContext } = require("./project-context");
const { findRemainingIssues } = require("./eslint-runner");

// 2. Initialize the configuration
const config = {
  TARGET_DIR: "./src", // Directory to analyze
  USE_AI_FOR_UNUSED_VARS: true, // Use AI for analyzing unused variables
  CROSS_FILE_ANALYSIS: true, // Analyze dependencies between files
  INTERACTIVE: false, // Run in batch mode (non-interactive)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DEFAULT_MODEL: "gpt-3.5-turbo", // Model for simple issues
  COMPLEX_MODEL: "gpt-4", // Model for complex issues
};

// 3. Main function to initialize project and fix issues
async function fixESLintIssues() {
  try {
    // Initialize project context
    console.log("Initializing project context...");
    const projectContext = await getProjectContext();
    await projectContext.initialize();

    // Find remaining ESLint issues
    console.log("Finding ESLint issues...");
    const issues = await findRemainingIssues();

    if (issues.totalCount === 0) {
      console.log("No ESLint issues found. Your code is clean!");
      return;
    }

    console.log(
      `Found ${issues.totalCount} issues in ${issues.filesWithIssues.length} files.`
    );

    // Process each file with issues
    for (const fileInfo of issues.filesWithIssues) {
      console.log(
        `Processing ${fileInfo.filePath} (${fileInfo.issues.length} issues)...`
      );

      // Fix issues in the file
      const result = await processFile(fileInfo);

      console.log(
        `Fixed ${result.fixed} of ${result.total} issues in ${fileInfo.filePath}`
      );

      // Check for affected files (if cross-file analysis is enabled)
      if (config.CROSS_FILE_ANALYSIS && result.fixed > 0) {
        const affectedFiles = projectContext.getAffectedFiles(
          fileInfo.filePath
        );

        if (affectedFiles.length > 0) {
          console.log(
            `Changes may affect ${affectedFiles.length} other files.`
          );

          // Optionally process affected files
          // This can be implemented based on your needs
        }
      }
    }

    console.log("ESLint fix process completed!");
  } catch (error) {
    console.error("Error fixing ESLint issues:", error);
  }
}

// 4. Function to fix a specific file
async function fixSingleFile(filePath) {
  try {
    // Initialize project context
    const projectContext = await getProjectContext();
    await projectContext.initialize();

    // Run ESLint on the specific file
    const output = execSync(`npx eslint "${filePath}" --format json`, {
      encoding: "utf-8",
    });
    const eslintResults = JSON.parse(output);

    if (!eslintResults || eslintResults.length === 0) {
      console.log(`No issues found in ${filePath}`);
      return;
    }

    const fileInfo = {
      filePath,
      issues: eslintResults[0].messages,
    };

    // Fix issues in the file
    const result = await processFile(fileInfo);

    console.log(
      `Fixed ${result.fixed} of ${result.total} issues in ${filePath}`
    );
  } catch (error) {
    console.error(`Error fixing ${filePath}:`, error);
  }
}

// 5. Example with custom configuration
async function fixWithCustomConfig() {
  // Override configuration for specific needs
  Object.assign(config, {
    INTERACTIVE: true, // Run in interactive mode
    USE_AI_FOR_UNUSED_VARS: false, // Use pattern matching only
    CHUNK_SIZE: 10, // Process 10 files at a time
    DELAY_BETWEEN_CHUNKS_MS: 1000, // 1 second delay between chunks
  });

  // Run the fix process
  await fixESLintIssues();
}

// 6. VSCode integration example
function integrateWithVSCode() {
  // This would be in a VSCode extension
  const vscode = require("vscode");

  // Register command to fix current file
  vscode.commands.registerCommand("hybridLinter.fixCurrentFile", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage("No active editor found");
      return;
    }

    const document = editor.document;
    await fixSingleFile(document.uri.fsPath);

    // Show success message
    vscode.window.showInformationMessage(
      "Hybrid Linter fixed issues in the current file"
    );
  });
}

module.exports = {
  fixESLintIssues,
  fixSingleFile,
  fixWithCustomConfig,
};
