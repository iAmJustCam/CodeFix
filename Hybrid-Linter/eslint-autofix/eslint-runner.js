// eslint-runner.js
import chalk from "chalk";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { getCodeContext } from "./file-utils.js";
import { fixParseErrors } from "./preprocessing.js";
import { getProjectContext } from "./project-context.js";
import { config, results } from "./state.js";

export async function runESLintAutoFix() {
  try {
    // Initialize the project context
    const projectContext = await getProjectContext();

    // Get changed files if available, otherwise all files
    let files;
    if (config.INCREMENTAL) {
      files = projectContext.getChangedFiles();
      console.log(
        chalk.blue(`Running ESLint on ${files.length} changed files`)
      );
    } else {
      files = Array.from(projectContext.files.keys());
      console.log(chalk.blue(`Running ESLint on all ${files.length} files`));
    }

    if (files.length === 0) {
      console.log(chalk.green("No files to fix. Everything is up to date."));
      return "";
    }

    // Split into chunks to avoid command line length limits
    const chunkSize = 50;
    let output = "";

    for (let i = 0; i < files.length; i += chunkSize) {
      const fileChunk = files.slice(i, i + chunkSize);
      // Quote each file path individually
      const fileArgs = fileChunk.map((file) => `"${file}"`).join(" ");

      try {
        const chunkOutput = execSync(
          `cd "${config.TARGET_DIR}" && npx eslint ${fileArgs} --fix`,
          { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
        );
        output += chunkOutput;
      } catch (error) {
        // ESLint returns non-zero exit code even when fixes are applied
        output += error.stdout || "";
      }
    }

    return output;
  } catch (error) {
    console.error(chalk.red(`Error running ESLint: ${error.message}`));
    return error.stdout || "";
  }
}

export function countFixedIssues(eslintOutput) {
  // Estimate fixed issues from ESLint output
  const fixedLines = eslintOutput.match(/Fixed \d+ error\(s\)/g) || [];
  let totalFixed = 0;

  for (const line of fixedLines) {
    const match = line.match(/Fixed (\d+) error/);
    if (match && match[1]) {
      totalFixed += parseInt(match[1], 10);
    }
  }

  return totalFixed;
}

export async function findRemainingIssues() {
  const result = {
    totalCount: 0,
    filesWithIssues: [],
  };

  try {
    // Initialize the project context
    const projectContext = await getProjectContext();

    // Get changed files if available, otherwise all files
    let files;
    if (config.INCREMENTAL) {
      files = projectContext.getChangedFiles();
      console.log(
        chalk.blue(`Analyzing ${files.length} changed files for issues`)
      );
    } else {
      files = Array.from(projectContext.files.keys());
      console.log(chalk.blue(`Analyzing all ${files.length} files for issues`));
    }

    if (files.length === 0) {
      console.log(
        chalk.green("No files to analyze. Everything is up to date.")
      );
      return result;
    }

    // Use worker pool for parallel processing if available
    if (config.PARALLEL && typeof Worker !== "undefined") {
      // TODO: Implement parallel processing with worker threads
      // For now, fall back to sequential processing
      console.log(
        chalk.yellow(
          "Parallel processing not yet implemented, using sequential processing"
        )
      );
    }

    // Process files in smaller chunks
    const chunkSize = 50;
    let eslintResults = [];

    for (let i = 0; i < files.length; i += chunkSize) {
      const fileChunk = files.slice(i, i + chunkSize);
      const fileArgs = fileChunk.map((file) => `"${file}"`).join(" ");

      try {
        const output = execSync(
          `cd "${config.TARGET_DIR}" && npx eslint ${fileArgs} --format json`,
          { encoding: "utf-8" }
        );

        if (output.trim() && output.trim() !== "[]") {
          const chunkResults = JSON.parse(output);
          eslintResults = [...eslintResults, ...chunkResults];
        }
      } catch (jsonError) {
        // If JSON output fails, try to extract information from error
        if (jsonError.stdout && jsonError.stdout.trim() !== "[]") {
          try {
            const chunkResults = JSON.parse(jsonError.stdout);
            eslintResults = [...eslintResults, ...chunkResults];
          } catch (e) {
            // Fallback to text parsing if JSON fails
            console.warn(
              chalk.yellow(
                "Could not use JSON format, falling back to text parsing"
              )
            );
            const textResults = parseESLintTextOutput(fileChunk);
            if (textResults.length > 0) {
              eslintResults = [...eslintResults, ...textResults];
            }
          }
        }
      }
    }

    // Process each file's issues
    for (const fileResult of eslintResults) {
      if (fileResult.messages && fileResult.messages.length > 0) {
        // Check if any of the issues are fatal parse errors
        const hasFatalErrors = fileResult.messages.some((msg) => msg.fatal);

        if (hasFatalErrors) {
          // If file has parse errors, try to clean it up
          const filePath = fileResult.filePath;
          console.log(
            chalk.yellow(
              `Detected parse errors in ${path.basename(
                filePath
              )}, attempting to clean...`
            )
          );

          // Try special parsing error fixes
          const fixed = fixParseErrors(filePath, fileResult.messages);

          if (fixed) {
            // Re-run ESLint on this file to get updated issues
            try {
              const updatedOutput = execSync(
                `cd "${config.TARGET_DIR}" && npx eslint "${path.relative(
                  config.TARGET_DIR,
                  filePath
                )}" --format json`,
                { encoding: "utf-8" }
              );

              const updatedResults = JSON.parse(updatedOutput);
              if (updatedResults.length > 0) {
                // Replace the original results with updated ones
                fileResult.messages = updatedResults[0].messages;
              }
            } catch (rerunError) {
              // If re-running fails, try to extract from error
              if (rerunError.stdout) {
                try {
                  const updatedResults = JSON.parse(rerunError.stdout);
                  if (updatedResults.length > 0) {
                    fileResult.messages = updatedResults[0].messages;
                  }
                } catch (e) {
                  // Keep original errors if parsing fails
                }
              }
            }
          }
        }

        result.totalCount += fileResult.messages.length;

        // Add code context to messages if preview is enabled
        if (config.SHOW_PREVIEW) {
          const filePath = fileResult.filePath;
          try {
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const lines = fileContent.split("\n");

            // If preview is enabled, show the file issues
            if (config.SHOW_PREVIEW) {
              console.log(
                chalk.cyan("\nFile: ") +
                  chalk.bold(path.relative(process.cwd(), filePath))
              );

              fileResult.messages.forEach((issue, idx) => {
                const severity =
                  issue.severity === 2
                    ? chalk.red("error")
                    : chalk.yellow("warning");
                console.log(
                  `${idx + 1}. Line ${issue.line}: ${severity} - ${
                    issue.message
                  } (${issue.ruleId})`
                );

                // Show code context
                if (issue.line !== undefined) {
                  const startLine = Math.max(0, issue.line - 2);
                  const endLine = Math.min(lines.length, issue.line + 1);

                  console.log(chalk.gray("\nCode context:"));
                  for (let i = startLine; i < endLine; i++) {
                    if (i === issue.line - 1) {
                      // Highlight the issue line
                      console.log(chalk.red(`> ${i + 1}: ${lines[i]}`));
                    } else {
                      console.log(chalk.gray(`  ${i + 1}: ${lines[i]}`));
                    }
                  }
                  console.log(""); // Empty line for spacing
                }
              });
            }
          } catch (error) {
            // Couldn't read file, skip preview
          }
        }

        // Add the file to the result with enhanced code context
        result.filesWithIssues.push({
          filePath: fileResult.filePath,
          issues: fileResult.messages.map((msg) => ({
            ...msg,
            // Extract code sample for context (if available)
            code: getCodeContext(fileResult.filePath, msg.line, msg.column),
          })),
        });

        // Store errors for reporting
        results.errorsByFile.set(fileResult.filePath, fileResult.messages);

        // For files with issues, also find potentially affected files
        if (config.CROSS_FILE_ANALYSIS) {
          const affectedFiles = projectContext.getAffectedFiles(
            fileResult.filePath
          );
          if (affectedFiles.length > 0) {
            console.log(
              chalk.blue(
                `Found ${
                  affectedFiles.length
                } potentially affected files by changes to ${path.basename(
                  fileResult.filePath
                )}`
              )
            );

            if (config.VERBOSE) {
              console.log(chalk.gray("Affected files:"));
              affectedFiles.forEach((file) => {
                console.log(
                  chalk.gray(`  ${path.relative(process.cwd(), file)}`)
                );
              });
            }

            // TODO: Add these files to the analysis queue in a future update
          }
        }
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error analyzing issues: ${error.message}`));
  }

  return result;
}

export function parseESLintTextOutput(files) {
  try {
    const fileResults = [];

    // Process each file individually to avoid glob pattern issues
    for (const file of files) {
      try {
        const relativePath = path.relative(config.TARGET_DIR, file);
        const textOutput = execSync(
          `cd "${config.TARGET_DIR}" && npx eslint "${relativePath}"`,
          { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }
        );

        const lines = textOutput.split("\n");
        const messages = [];

        // Simple parsing for ESLint output format
        const issueRegex =
          /\s+(\d+):(\d+)\s+(\w+)\s+(.*?)\s+(@?\w+\/[\w-]+|[\w-]+)/;

        for (const line of lines) {
          const issueMatch = line.match(issueRegex);
          if (issueMatch) {
            messages.push({
              line: parseInt(issueMatch[1], 10),
              column: parseInt(issueMatch[2], 10),
              severity: issueMatch[3] === "error" ? 2 : 1,
              message: issueMatch[4],
              ruleId: issueMatch[5],
            });
          }
        }

        if (messages.length > 0) {
          fileResults.push({
            filePath: file,
            messages,
          });
        }
      } catch (error) {
        // If command fails, try to extract issues from error output
        if (error.stdout) {
          const lines = error.stdout.split("\n");
          const messages = [];
          const issueRegex =
            /\s+(\d+):(\d+)\s+(\w+)\s+(.*?)\s+(@?\w+\/[\w-]+|[\w-]+)/;

          for (const line of lines) {
            const issueMatch = line.match(issueRegex);
            if (issueMatch) {
              messages.push({
                line: parseInt(issueMatch[1], 10),
                column: parseInt(issueMatch[2], 10),
                severity: issueMatch[3] === "error" ? 2 : 1,
                message: issueMatch[4],
                ruleId: issueMatch[5],
              });
            }
          }

          if (messages.length > 0) {
            fileResults.push({
              filePath: file,
              messages,
            });
          }
        }
      }
    }

    return fileResults;
  } catch (error) {
    console.error(chalk.red(`Error parsing ESLint output: ${error.message}`));
    return [];
  }
}

export async function checkRemainingIssues(filePath) {
  try {
    // Use ESLint to check if issues remain
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);

    try {
      const output = execSync(
        `cd "${dir}" && npx eslint "${filename}" --format json`,
        { encoding: "utf-8" }
      );

      if (!output.trim() || output.trim() === "[]") {
        return [];
      }

      const results = JSON.parse(output);
      return results[0]?.messages || [];
    } catch (error) {
      // ESLint might exit with an error if issues are found
      if (error.stdout) {
        try {
          const results = JSON.parse(error.stdout);
          return results[0]?.messages || [];
        } catch (e) {
          // Couldn't parse JSON, fallback to count from output
          const errorCount = (error.stdout.match(/error/g) || []).length;
          return Array(errorCount).fill({ message: "Error detected" });
        }
      }
      return [];
    }
  } catch (error) {
    console.error(
      chalk.red(`Error checking remaining issues: ${error.message}`)
    );
    return [];
  }
}

/**
 * Get all affected files based on issues in a file
 */
export async function getAffectedFiles(filePath, issues) {
  const projectContext = await getProjectContext();

  // If cross-file analysis is disabled, return empty array
  if (!config.CROSS_FILE_ANALYSIS) {
    return [];
  }

  const affectedFiles = projectContext.getAffectedFiles(filePath);

  // Filter out files that don't exist or are excluded
  return affectedFiles.filter((file) => {
    try {
      // Check if file exists
      return fs.existsSync(file);
    } catch (error) {
      return false;
    }
  });
}

/**
 * Get fix suggestions for a specific issue
 */
export async function getFixSuggestions(filePath, issue) {
  // Import dynamically to avoid circular dependencies
  const { generateFixSuggestions } = await import("./simple-fixes.js");
  return generateFixSuggestions(issue, filePath);
}
