#!/usr/bin/env node
import chalk from "chalk";
import { program } from "commander";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AIResponseValidator } from "../tests/ai-validation/validate-ai-responses.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

program
  .name("run-validation")
  .description("Validate AI responses against real API responses")
  .version("1.0.0")
  .option(
    "-f, --file <path>",
    "Path to test cases JSON file",
    path.join(__dirname, "../tests/ai-validation/test-cases.json")
  )
  .option("-q, --quick", "Run only one check per test case", false)
  .option("-s, --silent", "Disable detailed console output", false)
  .option("--no-logs", "Disable file logging")
  .option("--no-save", "Don't save response files")
  .option("-t, --test <name>", "Run only tests matching this name pattern")
  .option("-c, --checks <number>", "Number of checks per test case", "3")
  .parse(process.argv);

const options = program.opts();

async function main() {
  // Print banner
  console.log(chalk.blue.bold("==================================="));
  console.log(chalk.blue.bold("| AI Response Validation Tool     |"));
  console.log(chalk.blue.bold("==================================="));
  console.log("");

  // Verify test cases file exists
  if (!fs.existsSync(options.file)) {
    console.error(
      chalk.red(`Error: Test cases file not found: ${options.file}`)
    );
    process.exit(1);
  }

  // Configure validator
  const validator = new AIResponseValidator({
    logToFile: options.logs,
    detailedLogs: !options.silent,
    saveResponses: options.save,
    checksPerTest: options.quick ? 1 : parseInt(options.checks, 10),
  });

  try {
    // Load test cases
    console.log(chalk.cyan(`Loading test cases from: ${options.file}`));
    validator.loadTestCases(options.file);

    // Filter tests if test name pattern provided
    if (options.test) {
      const pattern = options.test.toLowerCase();
      const originalTestCount = validator.testCases.length;

      validator.testCases = validator.testCases.filter((test) =>
        test.name.toLowerCase().includes(pattern)
      );

      console.log(
        chalk.yellow(
          `Filtered tests by pattern '${pattern}': ${validator.testCases.length}/${originalTestCount} tests selected`
        )
      );

      if (validator.testCases.length === 0) {
        console.error(chalk.red("No test cases match the specified pattern"));
        process.exit(1);
      }
    }

    // Set API key environment variable from .env if available
    if (!process.env.OPENAI_API_KEY) {
      try {
        const dotenv = await import("dotenv");
        dotenv.config();
      } catch (e) {
        // dotenv not available, continue
      }
    }

    // Verify OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error(
        chalk.red("Error: OPENAI_API_KEY environment variable not set")
      );
      console.log(
        chalk.yellow("Set the API key in your environment or .env file")
      );
      process.exit(1);
    }

    // Run validation
    console.log(
      chalk.green(
        `Running validation on ${validator.testCases.length} test cases with ${validator.options.checksPerTest} checks each`
      )
    );
    console.log(
      chalk.yellow("This will make real API calls - please be patient...")
    );

    const startTime = Date.now();
    const results = await validator.runValidation();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Output summary
    console.log("");
    console.log(chalk.blue.bold("==================================="));
    console.log(chalk.blue.bold("| Validation Summary              |"));
    console.log(chalk.blue.bold("==================================="));
    console.log(`Total duration: ${duration}s`);

    // Exit with appropriate code
    if (results.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error(chalk.red(`Error running validation: ${error.message}`));
    console.error(error.stack);
    process.exit(1);
  }
}

main();
