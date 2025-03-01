#!/usr/bin/env node
// eslint-autofix.js
import chalk from "chalk";
import dotenv from "dotenv";
import fs from "fs";
import ora from "ora";
import path from "path";
import { fileURLToPath } from "url";
import { ensureESLintConfig, validateEnvironment } from "./config-utils.js";
import {
  countFixedIssues,
  findRemainingIssues,
  runESLintAutoFix,
} from "./eslint-runner.js";
import { findTypeScriptFiles } from "./file-utils.js";
import {
  categorizeIssues,
  displayCategorySummary,
} from "./issue-categorizer.js";
import { preprocessFiles, preprocessFilesAdvanced } from "./preprocessing.js";
import {
  processBatchMode,
  processInteractiveMode,
} from "./processing-modes.js";
import { getProjectContext } from "./project-context.js";
import { generateFinalReport } from "./reporting.js";
import { config, stats } from "./state.js";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "./.env") });

// Print version
const version = "1.0.0"; // Update this with your actual version

function showHelp() {
  console.log(
    chalk.bold(
      `\nHybrid Linter v${version} - AI-powered TypeScript Refactoring Assistant\n`
    )
  );
  console.log(`Usage: hybrid-linter [options] [path]

${chalk.bold("Main Options:")}
  --interactive       Run in interactive mode with manual review of fixes
  --batch             Run in batch mode (process all files automatically)
  --show-preview      Show code previews before and after fixes
  --detailed          Show more detailed information about fixes

${chalk.bold("Enhanced Analysis:")}
  --smart-vars        Use AI to analyze unused variables for typos and refactoring issues
  --cross-file        Enable cross-file analysis for deeper refactoring insights
  --ai-analysis       Same as --smart-vars (alias)

${chalk.bold("Performance Options:")}
  --full-scan         Process all files (default: only changed files)
  --parallel          Use parallel processing for faster analysis
  --chunk-size <num>  Number of files to process in each chunk (default: 5)
  --delay <ms>        Delay between chunks in ms (default: 2000)

${chalk.bold("Metrics & Reporting:")}
  --roi               Show return-on-investment metrics (time saved)
  --metrics           Same as --roi (alias)

${chalk.bold("Premium Features:")} ${chalk.gray("(Preview)")}
  --premium           Enable premium features
  --pro               Same as --premium (alias)

${chalk.bold("Examples:")}
  hybrid-linter ./src                            Analyze and fix ./src directory
  hybrid-linter --interactive ./src              Run in interactive mode
  hybrid-linter --batch --show-preview ./src     Run in batch mode with previews
  hybrid-linter --interactive --smart-vars ./src Analyze with AI-powered variable analysis
`);
}

async function main() {
  // Show help if requested or no arguments provided
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  // Show version if requested
  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log(`Hybrid Linter v${version}`);
    process.exit(0);
  }

  stats.startTime = new Date();

  const spinner = ora({
    text: chalk.blue("Starting AI-powered code analysis..."),
    color: "blue",
  }).start();

  // Create output directory if it doesn't exist
  if (!fs.existsSync(config.OUTPUT_DIR)) {
    fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
  }

  // Step 1: Verify TypeScript and ESLint are available
  spinner.text = chalk.blue("Validating environment and project...");
  try {
    validateEnvironment();
    spinner.succeed(chalk.green("Environment validated"));
  } catch (error) {
    spinner.fail(chalk.red(`Environment validation failed: ${error.message}`));
    process.exit(1);
  }

  // Step 2: Initialize project context
  spinner.text = chalk.blue("Building project context...");
  spinner.start();

  try {
    const projectContext = await getProjectContext();
    const projectStats = projectContext.getStats();

    spinner.succeed(
      chalk.green(
        `Project context built with ${projectStats.totalFiles} files and ${projectStats.totalVariables} variables`
      )
    );

    if (config.VERBOSE) {
      console.log(
        chalk.gray(
          `  Files with git history: ${projectStats.filesWithGitHistory}`
        )
      );
      console.log(chalk.gray(`  Cache size: ${projectStats.cacheSize}`));
    }
  } catch (error) {
    spinner.warn(
      chalk.yellow(`Error building project context: ${error.message}`)
    );
    console.log(chalk.yellow("Continuing with limited functionality..."));
  }

  // Step 3: Ensure ESLint configuration exists
  ensureESLintConfig();

  // Step 4: Preprocess files to handle markdown and common syntax issues
  const cleanedCount = await preprocessFiles(await findTypeScriptFiles());

  // Step 5: Perform advanced syntax validation and fixes
  const advancedFixCount = await preprocessFilesAdvanced(
    await findTypeScriptFiles()
  );

  // Step 6: Run ESLint auto-fix for simple issues
  spinner.text = chalk.blue("Running ESLint auto-fix for common patterns...");
  spinner.start();

  try {
    const eslintOutput = await runESLintAutoFix();
    stats.fixedByESLint = countFixedIssues(eslintOutput);
    spinner.succeed(
      chalk.green(
        `ESLint auto-fix completed (${stats.fixedByESLint} issues fixed)`
      )
    );
  } catch (error) {
    spinner.warn(
      chalk.yellow("ESLint found issues. Proceeding to detailed analysis...")
    );
  }

  // Step 7: Find remaining issues
  spinner.text = chalk.blue("Analyzing remaining issues...");
  spinner.start();

  const issues = await findRemainingIssues();
  stats.totalIssues = issues.totalCount;
  stats.filesWithIssues = issues.filesWithIssues.length;

  // Categorize issues for better reporting and fix prioritization
  categorizeIssues(issues.filesWithIssues);

  spinner.succeed(
    chalk.green(
      `Analysis complete: ${issues.totalCount} issues in ${issues.filesWithIssues.length} files`
    )
  );

  // Display issue summary by category
  displayCategorySummary();

  if (issues.filesWithIssues.length === 0) {
    console.log(
      chalk.green("\n✨ All issues have been fixed! Your code is clean.")
    );
    generateFinalReport();
    return;
  }

  // Step 8: Process issues based on mode (batch or interactive)
  if (config.BATCH_MODE) {
    await processBatchMode(issues.filesWithIssues);
  } else {
    await processInteractiveMode(issues.filesWithIssues);
  }

  // Step 9: Generate final report
  stats.endTime = new Date();
  generateFinalReport();
}

main().catch((error) => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  process.exit(1);
});
