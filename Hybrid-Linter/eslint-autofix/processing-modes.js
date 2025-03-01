// processing-modes.js
import chalk from "chalk";
import fs from "fs";
import ora from "ora";
import path from "path";
import readline from "readline";
import { getAIFix } from "./ai-utils.js";
import {
  checkRemainingIssues,
  getAffectedFiles,
  getFixSuggestions,
} from "./eslint-runner.js";
import { showDiff } from "./file-utils.js";
import {
  categorizeFileIssues,
  generateSuggestions,
} from "./issue-categorizer.js";
import { getProjectContext } from "./project-context.js";
import { saveCheckpoint } from "./reporting.js";
import { applySimplePatternFixes, applySpecificFix } from "./simple-fixes.js";
import { config, results, stats } from "./state.js";

export async function processBatchMode(filesWithIssues) {
  const spinner = ora({
    text: chalk.blue("Preparing batch processing..."),
    color: "blue",
  }).start();

  // Initialize project context
  const projectContext = await getProjectContext();

  // Split files into chunks to avoid rate limits
  const chunks = [];
  for (let i = 0; i < filesWithIssues.length; i += config.CHUNK_SIZE) {
    chunks.push(filesWithIssues.slice(i, i + config.CHUNK_SIZE));
  }

  spinner.succeed(
    chalk.green(`Prepared ${chunks.length} chunks for processing`)
  );

  // Track metrics for ROI calculation
  const startTime = Date.now();
  let totalIssuesFixed = 0;
  let totalFilesFixed = 0;

  // Process each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(
      chalk.blue(
        `\nProcessing chunk ${i + 1} of ${chunks.length} (${
          chunk.length
        } files)...`
      )
    );

    // Create a checkpoint
    saveCheckpoint(
      i,
      chunks.length,
      filesWithIssues.slice(i * config.CHUNK_SIZE)
    );

    // Process files in this chunk
    for (const fileInfo of chunk) {
      const fileStartTime = Date.now();
      const result = await processFile(fileInfo);
      const processingTime = (Date.now() - fileStartTime) / 1000;

      // Record metrics
      if (result.fixed > 0) {
        totalIssuesFixed += result.fixed;
        totalFilesFixed++;

        // Calculate time saved estimate (assuming 5 minutes per issue for manual fixing)
        const timeSavedMinutes = result.fixed * 5;

        // If showing ROI metrics is enabled
        if (config.SHOW_ROI_METRICS) {
          console.log(
            chalk.green(
              `⏱️ Estimated time saved: ${timeSavedMinutes} minutes (${
                result.fixed
              } issues fixed in ${processingTime.toFixed(1)}s)`
            )
          );
        }
      }

      // Check for affected files if cross-file analysis is enabled
      if (config.CROSS_FILE_ANALYSIS && result.fixed > 0) {
        const affectedFiles = await getAffectedFiles(
          fileInfo.filePath,
          fileInfo.issues
        );

        if (affectedFiles.length > 0) {
          console.log(
            chalk.yellow(
              `⚠️ Found ${affectedFiles.length} files potentially affected by these changes`
            )
          );

          if (config.VERBOSE) {
            console.log(chalk.gray("Affected files:"));
            affectedFiles.slice(0, 5).forEach((file) => {
              console.log(
                chalk.gray(`  ${path.relative(process.cwd(), file)}`)
              );
            });

            if (affectedFiles.length > 5) {
              console.log(
                chalk.gray(`  ... and ${affectedFiles.length - 5} more`)
              );
            }
          }
        }
      }
    }

    // Delay between chunks
    if (i < chunks.length - 1) {
      const delay = config.DELAY_BETWEEN_CHUNKS_MS;
      const delaySpinner = ora({
        text: chalk.gray(
          `Waiting ${delay / 1000} seconds before next chunk...`
        ),
        color: "gray",
      }).start();

      await new Promise((resolve) => setTimeout(resolve, delay));
      delaySpinner.stop();
    }
  }

  // Remove checkpoint when done
  try {
    fs.unlinkSync("fix_checkpoint.json");
  } catch (e) {
    // Ignore if file doesn't exist
  }

  // Calculate and display ROI summary
  const totalTime = (Date.now() - startTime) / 1000;
  const timeSavedMinutes = totalIssuesFixed * 5; // Assuming 5 minutes per issue for manual fixing

  if (config.SHOW_ROI_METRICS) {
    console.log(chalk.bold.green(`\n⏱️ ROI Summary:`));
    console.log(
      chalk.green(`Total processing time: ${totalTime.toFixed(1)} seconds`)
    );
    console.log(
      chalk.green(
        `Estimated time saved: ${timeSavedMinutes} minutes (${Math.round(
          timeSavedMinutes / 60
        )} hours)`
      )
    );
    console.log(
      chalk.green(
        `Issues fixed: ${totalIssuesFixed} in ${totalFilesFixed} files`
      )
    );
    console.log(
      chalk.green(
        `Efficiency ratio: ${((timeSavedMinutes * 60) / totalTime).toFixed(1)}x`
      )
    );
  }
}

export async function processInteractiveMode(filesWithIssues) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.bold("\n🛠️ Interactive Mode"));
  console.log(
    chalk.gray("You'll be guided through fixing each file with issues.\n")
  );

  // Initialize project context
  const projectContext = await getProjectContext();

  // Sort files by number of issues (most to least)
  const sortedFiles = [...filesWithIssues].sort(
    (a, b) => b.issues.length - a.issues.length
  );

  // Track metrics for ROI calculation
  let totalIssuesFixed = 0;
  let totalFilesFixed = 0;

  for (const fileInfo of sortedFiles) {
    const relativePath = path.relative(process.cwd(), fileInfo.filePath);
    console.log(chalk.bold(`\nFile: ${chalk.cyan(relativePath)}`));
    console.log(chalk.gray(`${fileInfo.issues.length} issues found`));

    // Read file content
    const fileContent = fs.readFileSync(fileInfo.filePath, "utf-8");
    const lines = fileContent.split("\n");

    // Group issues by type for better organization
    const issuesByType = {
      unused: [],
      style: [],
      type: [],
      other: [],
    };

    fileInfo.issues.forEach((issue) => {
      if (
        issue.ruleId === "no-unused-vars" ||
        issue.ruleId === "@typescript-eslint/no-unused-vars"
      ) {
        issuesByType.unused.push(issue);
      } else if (
        ["indent", "quotes", "semi", "no-multiple-empty-lines"].some((rule) =>
          issue.ruleId?.includes(rule)
        )
      ) {
        issuesByType.style.push(issue);
      } else if (
        issue.ruleId === "@typescript-eslint/no-explicit-any" ||
        issue.ruleId?.includes("type")
      ) {
        issuesByType.type.push(issue);
      } else {
        issuesByType.other.push(issue);
      }
    });

    // Handle unused variables with extra analysis
    if (issuesByType.unused.length > 0) {
      console.log(chalk.yellow("\n📝 Unused Variables Analysis:"));

      for (const issue of issuesByType.unused) {
        const varNameMatch = issue.message.match(
          /'([^']+)' is (?:defined|assigned a value) but never used/
        );

        if (varNameMatch && varNameMatch[1]) {
          const varName = varNameMatch[1];

          // Show code context
          const startLine = Math.max(0, issue.line - 3);
          const endLine = Math.min(lines.length, issue.line + 2);

          console.log(chalk.gray("\nCode context:"));
          for (let i = startLine; i < endLine; i++) {
            if (i === issue.line - 1) {
              // Highlight the issue line
              console.log(chalk.red(`> ${i + 1}: ${lines[i]}`));
            } else {
              console.log(chalk.gray(`  ${i + 1}: ${lines[i]}`));
            }
          }

          // Get variable analysis
          console.log(chalk.blue(`\nAnalyzing variable '${varName}'...`));

          const analysis = await projectContext.analyzeVariable(
            varName,
            fileInfo.filePath,
            issue,
            config.USE_AI_FOR_UNUSED_VARS
          );

          const confidencePercent = Math.round(analysis.confidence * 100);
          let analysisColor;

          // Color code based on analysis type
          switch (analysis.analysisType) {
            case "GENUINE_UNUSED":
              analysisColor = chalk.green;
              break;
            case "TYPO":
            case "REFACTOR_LEFTOVER":
              analysisColor = chalk.red;
              break;
            case "FUTURE_USE":
            case "FALSE_POSITIVE":
              analysisColor = chalk.yellow;
              break;
            default:
              analysisColor = chalk.white;
          }

          console.log(
            analysisColor(
              `Analysis: ${analysis.analysisType} (${confidencePercent}% confidence)`
            )
          );
          console.log(chalk.white(`  ${analysis.explanation}`));

          if (
            analysis.similarVariables &&
            analysis.similarVariables.length > 0
          ) {
            console.log(chalk.cyan(`  Similar variables found:`));
            analysis.similarVariables.slice(0, 3).forEach((similar) => {
              console.log(
                chalk.cyan(
                  `    - ${similar.name} (${similar.references.length} references)`
                )
              );
            });
          }

          // Get fix suggestions
          const suggestions = await getFixSuggestions(fileInfo.filePath, issue);

          console.log(chalk.cyan("\nSuggested fixes:"));
          suggestions.forEach((suggestion, idx) => {
            const confidence = Math.round(suggestion.confidence * 100);
            console.log(
              chalk.white(
                `  ${idx + 1}. ${suggestion.title} (${confidence}% confidence)`
              )
            );
            console.log(chalk.gray(`     ${suggestion.description}`));
          });

          // Ask user which fix to apply
          const fixChoice = await promptUser(
            rl,
            chalk.bold(`\nChoose a fix (1-${suggestions.length}) or [s]kip: `)
          );

          if (
            fixChoice &&
            !isNaN(fixChoice) &&
            fixChoice > 0 &&
            fixChoice <= suggestions.length
          ) {
            const selectedFix = suggestions[fixChoice - 1];
            console.log(chalk.green(`Applying: ${selectedFix.title}`));

            // Apply the selected fix
            const updatedContent = await applySpecificFix(
              fileContent,
              issue,
              selectedFix,
              fileInfo.filePath
            );

            // If the content changed, write it back to the file
            if (updatedContent !== fileContent) {
              fs.writeFileSync(fileInfo.filePath, updatedContent);

              // Update counters
              totalIssuesFixed++;

              // Show the change
              const originalLines = fileContent.split("\n");
              const fixedLines = updatedContent.split("\n");

              if (
                originalLines[issue.line - 1] !== fixedLines[issue.line - 1]
              ) {
                console.log(chalk.gray(`\nChange applied:`));
                console.log(chalk.red(`- ${originalLines[issue.line - 1]}`));
                console.log(chalk.green(`+ ${fixedLines[issue.line - 1]}`));
              }
            }
          } else if (fixChoice.toLowerCase() === "s") {
            console.log(chalk.gray("Skipping this issue"));
          }
        }
      }
    }

    // Display other types of issues with standard processing
    if (
      issuesByType.style.length +
        issuesByType.type.length +
        issuesByType.other.length >
      0
    ) {
      console.log(chalk.yellow("\n🔍 Other Issues:"));

      const otherIssues = [
        ...issuesByType.style,
        ...issuesByType.type,
        ...issuesByType.other,
      ];

      otherIssues.forEach((issue, idx) => {
        const severity =
          issue.severity === 2 ? chalk.red("error") : chalk.yellow("warning");
        console.log(
          `${idx + 1}. Line ${issue.line}: ${severity} - ${issue.message} (${
            issue.ruleId
          })`
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

    // Process any remaining issues with standard processing
    const answer = await promptUser(
      rl,
      chalk.bold("\nProceed with fixing other issues? [Y]es/[s]kip/[q]uit: ")
    );

    if (answer.toLowerCase() === "q") {
      break;
    } else if (answer.toLowerCase() !== "s") {
      const fileStartTime = Date.now();
      const result = await processFile(fileInfo, true);
      const processingTime = (Date.now() - fileStartTime) / 1000;

      if (result.fixed > 0) {
        totalIssuesFixed += result.fixed;
        totalFilesFixed++;

        // Calculate time saved estimate
        const timeSavedMinutes = result.fixed * 5;

        if (config.SHOW_ROI_METRICS) {
          console.log(
            chalk.green(`⏱️ Estimated time saved: ${timeSavedMinutes} minutes`)
          );
        }
      }
    } else {
      console.log(chalk.gray("Skipped"));
      results.unfixedFiles.push(fileInfo.filePath);
    }

    // Check for affected files
    if (config.CROSS_FILE_ANALYSIS) {
      const affectedFiles = await getAffectedFiles(
        fileInfo.filePath,
        fileInfo.issues
      );

      if (affectedFiles.length > 0) {
        console.log(
          chalk.yellow(
            `\n⚠️ Changes to this file may affect ${affectedFiles.length} other files:`
          )
        );

        affectedFiles.slice(0, 5).forEach((file) => {
          console.log(chalk.gray(`  - ${path.relative(process.cwd(), file)}`));
        });

        if (affectedFiles.length > 5) {
          console.log(chalk.gray(`  ... and ${affectedFiles.length - 5} more`));
        }

        const analyzeAnswer = await promptUser(
          rl,
          chalk.bold("\nAnalyze affected files? [y]es/[N]o: ")
        );

        if (analyzeAnswer.toLowerCase() === "y") {
          // TODO: Add code to analyze affected files
          console.log(
            chalk.blue(
              "Affected file analysis will be available in a future update"
            )
          );
        }
      }
    }
  }

  rl.close();

  // Show ROI summary
  if (config.SHOW_ROI_METRICS && totalIssuesFixed > 0) {
    console.log(chalk.bold.green(`\n⏱️ ROI Summary:`));
    const timeSavedMinutes = totalIssuesFixed * 5;
    console.log(
      chalk.green(
        `Estimated time saved: ${timeSavedMinutes} minutes (${Math.round(
          timeSavedMinutes / 60
        )} hours)`
      )
    );
    console.log(
      chalk.green(
        `Issues fixed: ${totalIssuesFixed} in ${totalFilesFixed} files`
      )
    );
  }
}

async function promptUser(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer || "y");
    });
  });
}

export async function processFile(fileInfo, interactive = false) {
  const spinner = !interactive
    ? ora({
        text: chalk.blue(`Processing ${path.basename(fileInfo.filePath)}...`),
        color: "blue",
      }).start()
    : null;

  const updateStatus = (text) => {
    if (spinner) {
      spinner.text = text;
    } else {
      console.log(text);
    }
  };

  // Read file content
  const fileContent = fs.readFileSync(fileInfo.filePath, "utf-8");

  // Create a backup
  const backupPath = `${fileInfo.filePath}.bak`;
  fs.writeFileSync(backupPath, fileContent);

  // Initialize project context
  const projectContext = await getProjectContext();

  // Track fixes for this file
  let fixedIssuesCount = 0;

  // Categorize issues for this file to optimize model selection
  const issuesByCategory = categorizeFileIssues(fileInfo.issues);
  const hasComplexIssues =
    issuesByCategory.TYPE > 0 ||
    issuesByCategory.SYNTAX > 0 ||
    issuesByCategory.IMPORT > 0 ||
    fileInfo.issues.length > 5;

  // Format issues for AI
  const issuesText = fileInfo.issues
    .map((issue) => `Line ${issue.line}: ${issue.message} (${issue.ruleId})`)
    .join("\n");

  updateStatus(
    chalk.blue(
      `Requesting AI assistance for ${path.basename(fileInfo.filePath)}...`
    )
  );

  try {
    // Try simple pattern fixes first for certain categories
    let simpleFixContent = null;
    const simpleFixableIssues =
      issuesByCategory.UNUSED + issuesByCategory.STYLE;

    if (simpleFixableIssues > 0) {
      updateStatus(chalk.blue(`Attempting simple pattern fixes first...`));
      simpleFixContent = await applySimplePatternFixes(
        fileContent,
        fileInfo.issues,
        fileInfo.filePath
      );

      if (simpleFixContent !== fileContent) {
        updateStatus(
          chalk.blue(
            `Applied simple pattern fixes, checking if issues remain...`
          )
        );

        // Write the simple fixes
        fs.writeFileSync(fileInfo.filePath, simpleFixContent);

        // Check if we resolved all issues
        const remainingIssues = await checkRemainingIssues(fileInfo.filePath);

        if (remainingIssues.length === 0) {
          // All fixed with simple patterns!
          updateStatus(
            chalk.green(`✅ All issues fixed with simple patterns!`)
          );
          stats.fixedBySimplePatterns += fileInfo.issues.length;
          results.fixedFiles.push(fileInfo.filePath);
          fixedIssuesCount = fileInfo.issues.length;

          if (interactive) {
            // Show what was changed
            const originalLines = fileContent.split("\n");
            const fixedLines = simpleFixContent.split("\n");

            console.log(chalk.bold("\nChanges applied:"));

            // Show before and after for each issue
            fileInfo.issues.forEach((issue) => {
              if (issue.line !== undefined) {
                const originalLine = originalLines[issue.line - 1];
                const fixedLine = fixedLines[issue.line - 1];

                if (originalLine !== fixedLine) {
                  console.log(chalk.gray(`\nIssue at line ${issue.line}:`));
                  console.log(chalk.red(`- ${originalLine}`));
                  console.log(chalk.green(`+ ${fixedLine}`));
                }
              }
            });
          }

          if (spinner)
            spinner.succeed(
              chalk.green(
                `Fixed all issues in ${path.basename(
                  fileInfo.filePath
                )} with simple patterns`
              )
            );
          return { fixed: fixedIssuesCount, total: fileInfo.issues.length };
        }

        // Some issues remain, track what we fixed
        const fixedCount = fileInfo.issues.length - remainingIssues.length;
        stats.fixedBySimplePatterns += fixedCount;
        fixedIssuesCount += fixedCount;

        // Update the issues list for AI fixing
        fileInfo.issues = remainingIssues;
        updateStatus(
          chalk.blue(
            `Fixed ${fixedCount} issues with simple patterns, ${remainingIssues.length} remain for AI`
          )
        );
      }
    }

    // Determine which model to use based on complexity
    const model = hasComplexIssues
      ? config.COMPLEX_MODEL
      : config.DEFAULT_MODEL;
    updateStatus(
      chalk.blue(
        `Using ${model} for ${
          hasComplexIssues ? "complex" : "standard"
        } issues...`
      )
    );

    // Get fix from AI
    const fixedContent = await getAIFix(
      simpleFixContent || fileContent,
      fileInfo.issues,
      fileInfo.filePath,
      model
    );

    if (fixedContent) {
      // Show diff in interactive mode
      if (interactive) {
        showDiff(fileContent, fixedContent);

        // Show specific changes for each issue
        const originalLines = fileContent.split("\n");
        const fixedLines = fixedContent.split("\n");

        console.log(chalk.bold("\nChanges applied:"));

        // For each issue, show before and after if the line changed
        fileInfo.issues.forEach((issue) => {
          if (issue.line !== undefined) {
            const originalLine = originalLines[issue.line - 1];
            const fixedLine = fixedLines[issue.line - 1];

            if (originalLine !== fixedLine) {
              console.log(chalk.gray(`\nIssue at line ${issue.line}:`));
              console.log(chalk.red(`- ${originalLine}`));
              console.log(chalk.green(`+ ${fixedLine}`));
            }
          }
        });

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await promptUser(
          rl,
          chalk.bold("Apply these changes? [Y]es/[n]o: ")
        );
        rl.close();

        if (answer.toLowerCase() === "n") {
          updateStatus(chalk.yellow("Changes rejected by user"));
          results.unfixedFiles.push(fileInfo.filePath);

          if (spinner)
            spinner.fail(
              chalk.yellow(
                `User rejected changes for ${path.basename(fileInfo.filePath)}`
              )
            );
          return { fixed: fixedIssuesCount, total: fileInfo.issues.length };
        }
      }

      // Apply the fix
      fs.writeFileSync(fileInfo.filePath, fixedContent);
      updateStatus(chalk.green("Applied AI-suggested fixes"));

      // Verify the fix worked
      const remainingIssues = await checkRemainingIssues(fileInfo.filePath);

      if (remainingIssues.length === 0) {
        // All fixed!
        updateStatus(chalk.green(`✅ All issues fixed successfully!`));
        stats.fixedByAI += fileInfo.issues.length;
        results.fixedFiles.push(fileInfo.filePath);
        fixedIssuesCount += fileInfo.issues.length;

        if (spinner)
          spinner.succeed(
            chalk.green(
              `Fixed all issues in ${path.basename(fileInfo.filePath)}`
            )
          );
      } else {
        // Some issues remain
        const fixedCount = fileInfo.issues.length - remainingIssues.length;

        if (fixedCount > 0) {
          updateStatus(
            chalk.blue(
              `Fixed ${fixedCount} of ${fileInfo.issues.length} issues`
            )
          );
          stats.fixedByAI += fixedCount;
          fixedIssuesCount += fixedCount;
          stats.remainingIssues += remainingIssues.length;
          results.partiallyFixedFiles.push(fileInfo.filePath);

          // Generate suggestions for remaining issues
          const suggestions = generateSuggestions(remainingIssues);
          results.suggestedActions.set(fileInfo.filePath, suggestions);

          if (spinner)
            spinner.succeed(
              chalk.blue(
                `Partially fixed ${path.basename(
                  fileInfo.filePath
                )} (${fixedCount}/${fileInfo.issues.length} issues)`
              )
            );
        } else {
          updateStatus(chalk.red(`Failed to fix any issues`));
          stats.remainingIssues += fileInfo.issues.length;
          results.unfixedFiles.push(fileInfo.filePath);

          // Generate suggestions for remaining issues
          const suggestions = generateSuggestions(remainingIssues);
          results.suggestedActions.set(fileInfo.filePath, suggestions);

          if (spinner)
            spinner.fail(
              chalk.red(
                `Could not fix issues in ${path.basename(fileInfo.filePath)}`
              )
            );
        }
      }
    } else {
      updateStatus(chalk.red("Failed to get useful AI suggestions"));

      // Try simple fixes as fallback if not already tried
      if (!simpleFixContent) {
        updateStatus(chalk.blue("Attempting simple fixes as fallback..."));
        const result = await applySimpleFixes(fileInfo);

        if (result.success && result.fixedCount > 0) {
          updateStatus(
            chalk.green(`Applied ${result.fixedCount} simple fixes`)
          );
          stats.fixedBySimplePatterns += result.fixedCount;
          fixedIssuesCount += result.fixedCount;
          stats.remainingIssues += result.remainingCount;

          if (result.remainingCount === 0) {
            results.fixedFiles.push(fileInfo.filePath);
            if (spinner)
              spinner.succeed(
                chalk.green(`Fixed all issues with fallback methods`)
              );
          } else {
            results.partiallyFixedFiles.push(fileInfo.filePath);

            // Generate suggestions for remaining issues
            const remainingIssues = await checkRemainingIssues(
              fileInfo.filePath
            );
            const suggestions = generateSuggestions(remainingIssues);
            results.suggestedActions.set(fileInfo.filePath, suggestions);

            if (spinner)
              spinner.warn(
                chalk.yellow(
                  `Partially fixed with fallback methods (${result.fixedCount}/${fileInfo.issues.length})`
                )
              );
          }
        } else {
          stats.remainingIssues += fileInfo.issues.length;
          results.unfixedFiles.push(fileInfo.filePath);

          // Generate suggestions
          const suggestions = generateSuggestions(fileInfo.issues);
          results.suggestedActions.set(fileInfo.filePath, suggestions);

          if (spinner)
            spinner.fail(chalk.red(`Could not fix issues with any method`));
        }
      } else {
        // We already tried simple fixes earlier
        const remainingCount = fileInfo.issues.length;
        stats.remainingIssues += remainingCount;
        results.unfixedFiles.push(fileInfo.filePath);

        // Generate suggestions
        const suggestions = generateSuggestions(fileInfo.issues);
        results.suggestedActions.set(fileInfo.filePath, suggestions);

        if (spinner)
          spinner.fail(
            chalk.red(
              `Could not fix remaining ${remainingCount} issues with AI`
            )
          );
      }
    }
  } catch (error) {
    // Handle all errors in a single catch block
    if (spinner)
      spinner.fail(
        chalk.red(
          `Error processing ${path.basename(fileInfo.filePath)}: ${
            error.message
          }`
        )
      );
    else console.error(chalk.red(`Error processing file: ${error.message}`));

    // Restore from backup
    fs.copyFileSync(backupPath, fileInfo.filePath);
    updateStatus(chalk.gray("Restored original file from backup"));
    stats.remainingIssues += fileInfo.issues.length;
    results.unfixedFiles.push(fileInfo.filePath);
  }

  return { fixed: fixedIssuesCount, total: fileInfo.issues.length };
}

async function applySimpleFixes(fileInfo) {
  console.log(
    chalk.blue(
      `Attempting simple fixes for ${path.basename(fileInfo.filePath)}...`
    )
  );

  try {
    // Read the file content
    const fileContent = fs.readFileSync(fileInfo.filePath, "utf-8");
    let fixedContent = fileContent;
    let fixCount = 0;

    // Apply simple pattern fixes
    fixedContent = await applySimplePatternFixes(
      fileContent,
      fileInfo.issues,
      fileInfo.filePath
    );

    if (fixedContent !== fileContent) {
      // Write the fixed content
      fs.writeFileSync(fileInfo.filePath, fixedContent);

      // Check how many issues we fixed
      const remainingIssues = await checkRemainingIssues(fileInfo.filePath);
      const fixedCount = fileInfo.issues.length - remainingIssues.length;

      return {
        success: true,
        fixedCount,
        remainingCount: remainingIssues.length,
      };
    }

    return {
      success: false,
      fixedCount: 0,
      remainingCount: fileInfo.issues.length,
    };
  } catch (error) {
    console.error(chalk.red(`Error applying simple fixes: ${error.message}`));
    return {
      success: false,
      fixedCount: 0,
      remainingCount: fileInfo.issues.length,
    };
  }
}
