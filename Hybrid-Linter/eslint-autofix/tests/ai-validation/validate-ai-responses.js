// tests/ai-validation/validate-ai-responses.js
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getAIAnalysis } from "../../ai-utils.js";
import { config } from "../../state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Validation suite for comparing mock AI responses to real API responses
 */
export class AIResponseValidator {
  constructor(options = {}) {
    this.options = {
      logToFile: true,
      detailedLogs: true,
      saveResponses: true,
      checksPerTest: 3, // How many validations to perform per test case
      similarityThreshold: 0.7, // Threshold for similarity validation
      ...options,
    };

    this.testCases = [];
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      similar: 0,
      issues: [],
    };

    // Prepare output directory for logs and response files
    this.outputDir = path.join(
      __dirname,
      "..",
      "..",
      "tests",
      "ai-validation",
      "results"
    );
    if (this.options.logToFile || this.options.saveResponses) {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
    }

    // Generate timestamp for this validation run
    this.timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  }

  /**
   * Add a test case to the validation suite
   * @param {Object} testCase - Test case definition
   */
  addTestCase(testCase) {
    if (!testCase.name || !testCase.prompt) {
      throw new Error("Test case must include a name and prompt");
    }

    this.testCases.push({
      name: testCase.name,
      prompt: testCase.prompt,
      description: testCase.description || testCase.name,
      model: testCase.model || config.COMPLEX_MODEL,
      expectedProperties: testCase.expectedProperties || [],
      customValidation: testCase.customValidation,
    });

    return this;
  }

  /**
   * Add multiple test cases at once
   * @param {Array} testCases - Array of test case definitions
   */
  addTestCases(testCases) {
    for (const testCase of testCases) {
      this.addTestCase(testCase);
    }
    return this;
  }

  /**
   * Load test cases from JSON file
   * @param {string} filePath - Path to JSON file containing test cases
   */
  loadTestCases(filePath) {
    try {
      const testsJson = fs.readFileSync(filePath, "utf8");
      const tests = JSON.parse(testsJson);

      if (Array.isArray(tests)) {
        this.addTestCases(tests);
      } else {
        throw new Error(
          "Test cases file should contain an array of test definitions"
        );
      }
    } catch (error) {
      console.error(chalk.red(`Error loading test cases: ${error.message}`));
      throw error;
    }

    return this;
  }

  /**
   * Run all validation tests
   */
  async runValidation() {
    console.log(chalk.blue.bold("Starting AI Response Validation"));
    console.log(
      chalk.gray(
        `Running ${this.testCases.length} test cases with ${this.options.checksPerTest} checks each`
      )
    );
    console.log(
      chalk.yellow("This will make real API calls to validate mock responses")
    );
    console.log("");

    const startTime = Date.now();
    const logFilePath = path.join(
      this.outputDir,
      `validation-${this.timestamp}.log`
    );
    const resultsFilePath = path.join(
      this.outputDir,
      `results-${this.timestamp}.json`
    );

    if (this.options.logToFile) {
      fs.writeFileSync(
        logFilePath,
        `AI Response Validation - ${new Date().toISOString()}\n\n`,
        "utf8"
      );
    }

    // Store the original mock setting
    const originalMockSetting = config.USE_MOCK_AI_FOR_TESTING;

    try {
      // Run each test case
      for (const testCase of this.testCases) {
        console.log(chalk.cyan(`Testing: ${testCase.name}`));

        if (this.options.logToFile) {
          fs.appendFileSync(
            logFilePath,
            `\n\n=== Test Case: ${testCase.name} ===\n${testCase.description}\n\n`,
            "utf8"
          );
        }

        // Run the specified number of checks for this test case
        for (let i = 0; i < this.options.checksPerTest; i++) {
          await this._runSingleCheck(testCase, i, logFilePath);
        }
      }
    } finally {
      // Restore original mock setting
      config.USE_MOCK_AI_FOR_TESTING = originalMockSetting;
    }

    // Calculate overall results
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    this.results.duration = duration;
    this.results.similarity = this.results.similar / this.results.total;
    this.results.passRate = this.results.passed / this.results.total;

    // Log final results
    this._logFinalResults(logFilePath);

    // Save detailed results in JSON format
    if (this.options.saveResponses) {
      fs.writeFileSync(
        resultsFilePath,
        JSON.stringify(this.results, null, 2),
        "utf8"
      );
    }

    return this.results;
  }

  /**
   * Run a single validation check for a test case
   * @private
   */
  async _runSingleCheck(testCase, checkIndex, logFilePath) {
    this.results.total++;

    try {
      // Get mock response
      config.USE_MOCK_AI_FOR_TESTING = true;
      const mockResponse = await getAIAnalysis(testCase.prompt, testCase.model);

      // Get real API response
      config.USE_MOCK_AI_FOR_TESTING = false;
      const apiResponse = await getAIAnalysis(testCase.prompt, testCase.model);

      // Save raw responses if enabled
      if (this.options.saveResponses) {
        const testCaseDir = path.join(
          this.outputDir,
          `test-${testCase.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`
        );
        if (!fs.existsSync(testCaseDir)) {
          fs.mkdirSync(testCaseDir, { recursive: true });
        }

        fs.writeFileSync(
          path.join(testCaseDir, `mock-response-${checkIndex}.txt`),
          mockResponse,
          "utf8"
        );

        fs.writeFileSync(
          path.join(testCaseDir, `api-response-${checkIndex}.txt`),
          apiResponse,
          "utf8"
        );
      }

      // Perform validation
      const validationResult = this._validateResponses(
        testCase,
        mockResponse,
        apiResponse
      );

      // Log the result
      this._logCheckResult(
        testCase,
        checkIndex,
        mockResponse,
        apiResponse,
        validationResult,
        logFilePath
      );

      // Update results
      if (validationResult.passed) {
        this.results.passed++;
      } else {
        this.results.failed++;
        this.results.issues.push({
          testCase: testCase.name,
          checkIndex,
          reason: validationResult.reason,
          details: validationResult.details,
        });
      }

      if (validationResult.similarity >= this.options.similarityThreshold) {
        this.results.similar++;
      }
    } catch (error) {
      console.error(
        chalk.red(
          `Error in test case "${testCase.name}" (check ${checkIndex}): ${error.message}`
        )
      );

      if (this.options.logToFile) {
        fs.appendFileSync(
          logFilePath,
          `ERROR in check ${checkIndex}: ${error.message}\n${error.stack}\n`,
          "utf8"
        );
      }

      this.results.failed++;
      this.results.issues.push({
        testCase: testCase.name,
        checkIndex,
        reason: "Exception",
        details: error.message,
      });
    }
  }

  /**
   * Validate mock response against real API response
   * @private
   */
  _validateResponses(testCase, mockResponse, apiResponse) {
    const result = {
      passed: false,
      similarity: 0,
      reason: "",
      details: {},
    };

    // Try to parse responses as JSON if they appear to be JSON
    let mockJson = null;
    let apiJson = null;

    try {
      if (mockResponse.trim().startsWith("{")) {
        mockJson = JSON.parse(mockResponse);
      }
    } catch (e) {
      // Not valid JSON, continue with text comparison
    }

    try {
      if (apiResponse.trim().startsWith("{")) {
        apiJson = JSON.parse(apiResponse);
      }
    } catch (e) {
      // Not valid JSON, continue with text comparison
    }

    // If both are JSON, compare structured data
    if (mockJson && apiJson) {
      result.details.format = "json";
      return this._validateJsonResponses(testCase, mockJson, apiJson, result);
    }
    // If both are text, compare as text
    else if (!mockJson && !apiJson) {
      result.details.format = "text";
      return this._validateTextResponses(
        testCase,
        mockResponse,
        apiResponse,
        result
      );
    }
    // If format mismatch, automatic fail
    else {
      result.passed = false;
      result.similarity = 0;
      result.reason =
        "Format mismatch - one response is JSON, the other is not";
      result.details.mockFormat = mockJson ? "json" : "text";
      result.details.apiFormat = apiJson ? "json" : "text";
      return result;
    }
  }

  /**
   * Validate JSON responses
   * @private
   */
  _validateJsonResponses(testCase, mockJson, apiJson, result) {
    // Check for expected properties
    const expectedProps = testCase.expectedProperties || [];
    const missingInMock = [];
    const missingInApi = [];

    for (const prop of expectedProps) {
      if (!this._hasNestedProperty(mockJson, prop)) {
        missingInMock.push(prop);
      }

      if (!this._hasNestedProperty(apiJson, prop)) {
        missingInApi.push(prop);
      }
    }

    result.details.expectedProperties = {
      missingInMock,
      missingInApi,
    };

    // Check structural similarity
    const structuralSimilarity = this._calculateStructuralSimilarity(
      mockJson,
      apiJson
    );
    result.similarity = structuralSimilarity;

    // Run custom validation if provided
    if (
      testCase.customValidation &&
      typeof testCase.customValidation === "function"
    ) {
      const customResult = testCase.customValidation(mockJson, apiJson);
      result.details.customValidation = customResult;

      // Custom validation can override the pass/fail result
      if (customResult.override) {
        result.passed = customResult.passed;
        result.reason = customResult.reason || result.reason;
        return result;
      }
    }

    // Determine pass/fail based on expected properties and similarity
    if (missingInMock.length > 0) {
      result.passed = false;
      result.reason = `Mock response missing expected properties: ${missingInMock.join(
        ", "
      )}`;
    } else if (missingInApi.length > 0) {
      result.passed = false;
      result.reason = `API response missing expected properties: ${missingInApi.join(
        ", "
      )}`;
    } else if (structuralSimilarity < this.options.similarityThreshold) {
      result.passed = false;
      result.reason = `Structural similarity (${structuralSimilarity.toFixed(
        2
      )}) below threshold (${this.options.similarityThreshold})`;
    } else {
      result.passed = true;
      result.reason = "All validations passed";
    }

    return result;
  }

  /**
   * Validate text responses
   * @private
   */
  _validateTextResponses(testCase, mockResponse, apiResponse, result) {
    // For text responses, check content similarity
    const textSimilarity = this._calculateTextSimilarity(
      mockResponse,
      apiResponse
    );
    result.similarity = textSimilarity;

    // Check if key phrases exist in both responses
    const keyPhrases = testCase.expectedProperties || [];
    const missingInMock = [];
    const missingInApi = [];

    for (const phrase of keyPhrases) {
      if (!mockResponse.includes(phrase)) {
        missingInMock.push(phrase);
      }

      if (!apiResponse.includes(phrase)) {
        missingInApi.push(phrase);
      }
    }

    result.details.keyPhrases = {
      missingInMock,
      missingInApi,
    };

    // Run custom validation if provided
    if (
      testCase.customValidation &&
      typeof testCase.customValidation === "function"
    ) {
      const customResult = testCase.customValidation(mockResponse, apiResponse);
      result.details.customValidation = customResult;

      // Custom validation can override the pass/fail result
      if (customResult.override) {
        result.passed = customResult.passed;
        result.reason = customResult.reason || result.reason;
        return result;
      }
    }

    // Determine pass/fail based on text similarity
    if (textSimilarity < this.options.similarityThreshold) {
      result.passed = false;
      result.reason = `Text similarity (${textSimilarity.toFixed(
        2
      )}) below threshold (${this.options.similarityThreshold})`;
    } else if (missingInMock.length > 0) {
      result.passed = false;
      result.reason = `Mock response missing key phrases: ${missingInMock.join(
        ", "
      )}`;
    } else if (missingInApi.length > 0) {
      result.passed = false;
      result.reason = `API response missing key phrases: ${missingInApi.join(
        ", "
      )}`;
    } else {
      result.passed = true;
      result.reason = "All validations passed";
    }

    return result;
  }

  /**
   * Calculate structural similarity between two JSON objects
   * @private
   */
  _calculateStructuralSimilarity(obj1, obj2) {
    // Get all keys from both objects
    const keys1 = this._getAllKeys(obj1);
    const keys2 = this._getAllKeys(obj2);

    // Count matching keys
    const allKeys = new Set([...keys1, ...keys2]);
    let matches = 0;

    for (const key of allKeys) {
      if (keys1.includes(key) && keys2.includes(key)) {
        matches++;
      }
    }

    // Calculate Jaccard similarity coefficient
    return matches / allKeys.size;
  }

  /**
   * Calculate text similarity between two strings
   * @private
   */
  _calculateTextSimilarity(text1, text2) {
    // Simple approach: compare word sets
    const words1 = new Set(
      text1
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
    const words2 = new Set(
      text2
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );

    const intersection = new Set(
      [...words1].filter((word) => words2.has(word))
    );
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Get all property keys (including nested) from an object
   * @private
   */
  _getAllKeys(obj, prefix = "", result = []) {
    if (!obj || typeof obj !== "object") return result;

    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      result.push(fullKey);

      if (
        obj[key] &&
        typeof obj[key] === "object" &&
        !Array.isArray(obj[key])
      ) {
        this._getAllKeys(obj[key], fullKey, result);
      }
    }

    return result;
  }

  /**
   * Check if an object has a nested property
   * @private
   */
  _hasNestedProperty(obj, path) {
    const parts = path.split(".");
    let current = obj;

    for (const part of parts) {
      if (!current || typeof current !== "object") return false;
      if (!(part in current)) return false;
      current = current[part];
    }

    return true;
  }

  /**
   * Log results of a single check
   * @private
   */
  _logCheckResult(
    testCase,
    checkIndex,
    mockResponse,
    apiResponse,
    validationResult,
    logFilePath
  ) {
    // Console output
    const statusColor = validationResult.passed ? chalk.green : chalk.red;
    console.log(
      `  Check ${checkIndex + 1}: ${statusColor(
        validationResult.passed ? "PASSED" : "FAILED"
      )} (Similarity: ${validationResult.similarity.toFixed(2)})`
    );

    if (!validationResult.passed) {
      console.log(`    Reason: ${chalk.yellow(validationResult.reason)}`);
    }

    // Detailed file logging
    if (this.options.logToFile) {
      let logContent = `--- Check ${checkIndex + 1} ---\n`;
      logContent += `Passed: ${validationResult.passed}\n`;
      logContent += `Similarity: ${validationResult.similarity.toFixed(4)}\n`;
      logContent += `Reason: ${validationResult.reason}\n\n`;

      if (this.options.detailedLogs) {
        // Truncate responses if very long
        const maxLen = 1000;
        const mockResponseTrunc =
          mockResponse.length > maxLen
            ? mockResponse.substring(0, maxLen) + "...[truncated]"
            : mockResponse;
        const apiResponseTrunc =
          apiResponse.length > maxLen
            ? apiResponse.substring(0, maxLen) + "...[truncated]"
            : apiResponse;

        logContent += `Mock Response:\n${mockResponseTrunc}\n\n`;
        logContent += `API Response:\n${apiResponseTrunc}\n\n`;
        logContent += `Details: ${JSON.stringify(
          validationResult.details,
          null,
          2
        )}\n\n`;
      }

      fs.appendFileSync(logFilePath, logContent, "utf8");
    }
  }

  /**
   * Log final results
   * @private
   */
  _logFinalResults(logFilePath) {
    // Console output
    console.log("\n" + "=".repeat(50));
    console.log(chalk.blue.bold("AI Response Validation Results"));
    console.log("=".repeat(50));

    console.log(`Total checks: ${chalk.bold(this.results.total)}`);
    console.log(
      `Passed: ${chalk.green.bold(this.results.passed)} (${(
        this.results.passRate * 100
      ).toFixed(1)}%)`
    );
    console.log(`Failed: ${chalk.red.bold(this.results.failed)}`);
    console.log(
      `Similar responses: ${chalk.yellow.bold(this.results.similar)} (${(
        this.results.similarity * 100
      ).toFixed(1)}%)`
    );
    console.log(`Duration: ${chalk.bold(this.results.duration)}s`);

    if (this.results.issues.length > 0) {
      console.log("\n" + chalk.red.bold("Issues:"));
      this.results.issues.slice(0, 5).forEach((issue, i) => {
        console.log(
          `${i + 1}. ${chalk.cyan(issue.testCase)} - ${issue.reason}`
        );
      });

      if (this.results.issues.length > 5) {
        console.log(`...and ${this.results.issues.length - 5} more issues`);
      }
    }

    // Final recommendation
    if (this.results.passRate >= 0.9) {
      console.log(
        "\n" +
          chalk.green.bold("✓ Excellent match between mock and API responses!")
      );
    } else if (this.results.passRate >= 0.7) {
      console.log(
        "\n" +
          chalk.yellow.bold(
            "⚠ Good match, but some discrepancies between mock and API responses."
          )
      );
    } else {
      console.log(
        "\n" +
          chalk.red.bold(
            "✗ Significant discrepancies between mock and API responses. Mocks need updating."
          )
      );
    }

    // File logging
    if (this.options.logToFile) {
      let logContent = "\n" + "=".repeat(50) + "\n";
      logContent += "FINAL RESULTS\n";
      logContent += "=".repeat(50) + "\n\n";

      logContent += `Total checks: ${this.results.total}\n`;
      logContent += `Passed: ${this.results.passed} (${(
        this.results.passRate * 100
      ).toFixed(1)}%)\n`;
      logContent += `Failed: ${this.results.failed}\n`;
      logContent += `Similar responses: ${this.results.similar} (${(
        this.results.similarity * 100
      ).toFixed(1)}%)\n`;
      logContent += `Duration: ${this.results.duration}s\n\n`;

      if (this.results.issues.length > 0) {
        logContent += "ISSUES:\n";
        this.results.issues.forEach((issue, i) => {
          logContent += `${i + 1}. ${issue.testCase} (check ${
            issue.checkIndex
          }): ${issue.reason}\n`;
          if (issue.details) {
            logContent += `   Details: ${JSON.stringify(issue.details)}\n`;
          }
        });
      }

      fs.appendFileSync(logFilePath, logContent, "utf8");
    }
  }
}

// Default test cases
const DEFAULT_TEST_CASES = [
  {
    name: "Variable Renamed Across Modules",
    description:
      "Tests AI's ability to detect variable renaming issues between modules",
    prompt: `
Analyze these two TypeScript files where one might have been refactored:

File 1 (userService.ts):
\`\`\`typescript
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
}
\`\`\`

File 2 (userController.ts):
\`\`\`typescript
import { getUserData, updateUserInfo } from './userService';

export function handleUserUpdate(userId: string) {
  // This variable is flagged as unused
  const userData = getUserData(userId);

  // Should be using 'userData' parameter here
  return updateUserInfo(userId, {
    name: 'Updated Name',
    email: 'updated@example.com'
  });
}
\`\`\`

Is 'userData' genuinely unused or is this a refactoring issue? Format your response as JSON with analysisType, confidence, explanation, recommendation and possibleActions.
`,
    model: "gpt-4",
    expectedProperties: [
      "analysisType",
      "confidence",
      "explanation",
      "recommendation",
      "possibleActions",
    ],
    customValidation: (mockJson, apiJson) => {
      // Check that both identify this as a refactoring issue
      const mockIdentifiesRefactoring =
        mockJson.analysisType?.includes("REFACTOR");
      const apiIdentifiesRefactoring =
        apiJson.analysisType?.includes("REFACTOR");

      // Check if userInfo is mentioned in either explanation
      const mockMentionsUserInfo = JSON.stringify(mockJson)
        .toLowerCase()
        .includes("userinfo");
      const apiMentionsUserInfo = JSON.stringify(apiJson)
        .toLowerCase()
        .includes("userinfo");

      return {
        refactoringIdentified:
          mockIdentifiesRefactoring && apiIdentifiesRefactoring,
        userInfoMentioned: mockMentionsUserInfo && apiMentionsUserInfo,
        passed: mockIdentifiesRefactoring && apiIdentifiesRefactoring,
        reason:
          mockIdentifiesRefactoring && apiIdentifiesRefactoring
            ? "Both correctly identify refactoring issue"
            : "Refactoring issue not correctly identified in both responses",
      };
    },
  },
  {
    name: "Unused Variable Analysis",
    description: "Tests AI's analysis of a genuinely unused variable",
    prompt: `
Analyze this TypeScript file:

\`\`\`typescript
function calculateTotal(subtotal: number, tax: number, shipping: number) {
  const discount = 10; // This variable is unused
  return subtotal + tax + shipping;
}
export default calculateTotal;
\`\`\`

What type of issue is the 'discount' variable? Is it genuinely unused or a refactoring issue?
Format your response as JSON with analysisType, confidence, explanation, and recommendedAction fields.
`,
    expectedProperties: [
      "analysisType",
      "confidence",
      "explanation",
      "recommendedAction",
    ],
    customValidation: (mockJson, apiJson) => {
      // Check both identify this as genuinely unused
      const mockCorrect =
        mockJson.analysisType?.includes("GENUINE") ||
        mockJson.analysisType?.includes("UNUSED");
      const apiCorrect =
        apiJson.analysisType?.includes("GENUINE") ||
        apiJson.analysisType?.includes("UNUSED");

      return {
        genuineUnusedIdentified: mockCorrect && apiCorrect,
        passed: mockCorrect && apiCorrect,
        reason:
          mockCorrect && apiCorrect
            ? "Both correctly identify genuine unused variable"
            : "Genuine unused variable not correctly identified",
      };
    },
  },
  {
    name: "Any Type Replacement",
    description: "Tests AI's recommendations for replacing 'any' type",
    prompt: `
What should be used instead of 'any' in this TypeScript code?

\`\`\`typescript
function processData(data: any) {
  return data.toString();
}
export default processData;
\`\`\`

Format your answer as a concise explanation.
`,
    expectedProperties: ["unknown"],
  },
];

/**
 * Run the validation suite with default settings and test cases
 */
export async function runDefaultValidation() {
  const validator = new AIResponseValidator();
  validator.addTestCases(DEFAULT_TEST_CASES);
  return await validator.runValidation();
}

/**
 * CLI entry point
 */
async function cli() {
  const args = process.argv.slice(2);
  const testCasesFile = args.find((arg) => !arg.startsWith("--"));

  const options = {
    logToFile: !args.includes("--no-logs"),
    detailedLogs: !args.includes("--no-details"),
    saveResponses: !args.includes("--no-save"),
    checksPerTest: args.includes("--quick") ? 1 : 3,
  };

  const validator = new AIResponseValidator(options);

  if (testCasesFile) {
    validator.loadTestCases(testCasesFile);
  } else {
    console.log(
      chalk.yellow("No test cases file provided, using default test cases")
    );
    validator.addTestCases(DEFAULT_TEST_CASES);
  }

  await validator.runValidation();
}

// Run CLI if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli().catch((err) => {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  });
}
