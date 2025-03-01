// simple-fixes.js
import chalk from "chalk";
import path from "path";
import { getProjectContext } from "./project-context.js";
import { config } from "./state.js";

export async function applySimplePatternFixes(fileContent, issues, filePath) {
  let fixedContent = fileContent;
  const projectContext = await getProjectContext();

  for (const issue of issues) {
    // Fix unused variables by prefixing with underscore or applying intelligent suggestions
    if (
      issue.ruleId === "no-unused-vars" ||
      issue.ruleId === "@typescript-eslint/no-unused-vars"
    ) {
      const varNameMatch = issue.message.match(
        /'([^']+)' is (?:defined|assigned a value) but never used/
      );
      if (varNameMatch && varNameMatch[1]) {
        const varName = varNameMatch[1];

        if (!varName.startsWith("_")) {
          // Get the line with the issue
          const lines = fixedContent.split("\n");
          const line = lines[issue.line - 1];

          if (line) {
            // Use the project context to analyze the variable
            const analysis = await projectContext.analyzeVariable(
              varName,
              filePath,
              issue,
              config.USE_AI_FOR_UNUSED_VARS
            );

            console.log(
              chalk.blue(
                `Variable analysis for '${varName}': ${
                  analysis.analysisType
                } (${Math.round(analysis.confidence * 100)}% confidence)`
              )
            );
            console.log(chalk.gray(`  ${analysis.explanation}`));

            let fixType = "PREFIX";
            let suggestedName = `_${varName}`;

            // Determine the best action based on analysis
            if (
              analysis.analysisType === "TYPO" &&
              analysis.similarVariables.length > 0
            ) {
              const similarVar = analysis.similarVariables[0].name;
              if (analysis.confidence > 0.7) {
                fixType = "RENAME";
                suggestedName = similarVar;
                console.log(
                  chalk.green(
                    `  Suggesting rename to '${similarVar}' because it appears to be a typo`
                  )
                );
              } else {
                console.log(
                  chalk.yellow(
                    `  Possible typo for '${similarVar}', but confidence too low for automatic fix`
                  )
                );
              }
            } else if (
              analysis.analysisType === "REFACTOR_LEFTOVER" &&
              analysis.confidence > 0.8
            ) {
              fixType = "REMOVE";
              console.log(
                chalk.green(
                  `  Suggesting removal as it appears to be a leftover from refactoring`
                )
              );
            }

            // Apply the appropriate fix
            if (fixType === "PREFIX") {
              // Replace the variable name with underscore prefix in different declarations
              const patterns = [
                // const/let/var declarations
                {
                  pattern: new RegExp(
                    `(const|let|var)\\s+(${varName})(?=\\s*[=:;])`,
                    "g"
                  ),
                  replacement: `$1 _${varName}`,
                },
                // function parameters
                {
                  pattern: new RegExp(
                    `(\\(|,\\s*)(${varName})(?=\\s*[:,)])`,
                    "g"
                  ),
                  replacement: `$1_${varName}`,
                },
                // destructuring assignments
                {
                  pattern: new RegExp(
                    `({\\s*|,\\s*)(${varName})(?=\\s*[,}])`,
                    "g"
                  ),
                  replacement: `$1_${varName}`,
                },
                // function declarations
                {
                  pattern: new RegExp(
                    `function\\s+(${varName})(?=\\s*\\()`,
                    "g"
                  ),
                  replacement: `function _${varName}`,
                },
              ];

              let updatedLine = line;
              for (const { pattern, replacement } of patterns) {
                updatedLine = updatedLine.replace(pattern, replacement);
              }

              if (updatedLine !== line) {
                lines[issue.line - 1] = updatedLine;
                fixedContent = lines.join("\n");

                // Record the fix
                projectContext.recordFix(filePath, issue, "PREFIX", {
                  original: varName,
                  fixed: `_${varName}`,
                });
              }
            } else if (
              fixType === "RENAME" &&
              analysis.similarVariables.length > 0
            ) {
              // Rename to the similar variable
              const similarVar = analysis.similarVariables[0].name;

              const patterns = [
                // const/let/var declarations
                {
                  pattern: new RegExp(
                    `(const|let|var)\\s+(${varName})(?=\\s*[=:;])`,
                    "g"
                  ),
                  replacement: `$1 ${similarVar}`,
                },
                // function parameters
                {
                  pattern: new RegExp(
                    `(\\(|,\\s*)(${varName})(?=\\s*[:,)])`,
                    "g"
                  ),
                  replacement: `$1${similarVar}`,
                },
                // destructuring assignments
                {
                  pattern: new RegExp(
                    `({\\s*|,\\s*)(${varName})(?=\\s*[,}])`,
                    "g"
                  ),
                  replacement: `$1${similarVar}`,
                },
                // function declarations
                {
                  pattern: new RegExp(
                    `function\\s+(${varName})(?=\\s*\\()`,
                    "g"
                  ),
                  replacement: `function ${similarVar}`,
                },
              ];

              let updatedLine = line;
              for (const { pattern, replacement } of patterns) {
                updatedLine = updatedLine.replace(pattern, replacement);
              }

              if (updatedLine !== line) {
                lines[issue.line - 1] = updatedLine;
                fixedContent = lines.join("\n");

                // Record the fix
                projectContext.recordFix(filePath, issue, "RENAME", {
                  original: varName,
                  fixed: similarVar,
                  similarity:
                    1 -
                    analysis.similarVariables[0].distance /
                      Math.max(varName.length, similarVar.length),
                });
              }
            } else if (fixType === "REMOVE") {
              // Remove the variable declaration
              // This is more complex and might require more sophisticated parsing
              // For now, we'll just comment it out
              if (
                line.trim().startsWith(`const ${varName}`) ||
                line.trim().startsWith(`let ${varName}`) ||
                line.trim().startsWith(`var ${varName}`)
              ) {
                lines[
                  issue.line - 1
                ] = `// ${line} // Removed during refactoring cleanup`;
                fixedContent = lines.join("\n");

                // Record the fix
                projectContext.recordFix(filePath, issue, "REMOVE", {
                  original: varName,
                  fixed: "removed",
                });
              }
            }
          }
        }
      }
    }

    // Fix any type with unknown
    if (issue.ruleId === "@typescript-eslint/no-explicit-any") {
      const lines = fixedContent.split("\n");
      const line = lines[issue.line - 1];

      if (line && line.includes(": any")) {
        const updatedLine = line.replace(/: any\b/g, ": unknown");
        if (updatedLine !== line) {
          lines[issue.line - 1] = updatedLine;
          fixedContent = lines.join("\n");

          // Record the fix
          const projectContext = await getProjectContext();
          projectContext.recordFix(filePath, issue, "TYPE_FIX", {
            change: "any → unknown",
          });
        }
      }
    }

    // Fix style issues
    if (
      issue.ruleId &&
      ["indent", "quotes", "semi", "no-multiple-empty-lines"].some((rule) =>
        issue.ruleId.includes(rule)
      )
    ) {
      // Common style fixes like semicolons, quotes, etc.
      const lines = fixedContent.split("\n");
      const line = lines[issue.line - 1];

      if (line) {
        let updatedLine = line;
        let fixType = "";

        // Missing semicolons
        if (issue.ruleId.includes("semi")) {
          if (issue.message.includes("Missing semicolon")) {
            updatedLine = updatedLine + ";";
            fixType = "ADD_SEMICOLON";
          } else if (issue.message.includes("Extra semicolon")) {
            updatedLine = updatedLine.replace(/;$/, "");
            fixType = "REMOVE_SEMICOLON";
          }
        }

        // Quote style
        if (issue.ruleId.includes("quotes")) {
          if (issue.message.includes("single quotes")) {
            updatedLine = updatedLine.replace(/"/g, "'");
            fixType = "CONVERT_TO_SINGLE_QUOTES";
          } else if (issue.message.includes("double quotes")) {
            updatedLine = updatedLine.replace(/'/g, '"');
            fixType = "CONVERT_TO_DOUBLE_QUOTES";
          }
        }

        if (updatedLine !== line) {
          lines[issue.line - 1] = updatedLine;
          fixedContent = lines.join("\n");

          // Record the fix
          const projectContext = await getProjectContext();
          projectContext.recordFix(filePath, issue, fixType, {
            line: issue.line,
          });
        }
      }
    }

    // Fix expressions that should be assignments or function calls
    if (issue.ruleId === "no-unused-expressions") {
      const lines = fixedContent.split("\n");
      const line = lines[issue.line - 1];

      // If it looks like a JSX/TSX component or element, try to add export default
      if (
        line &&
        /^<[A-Z][A-Za-z0-9]*/.test(line) &&
        path.extname(filePath) === ".tsx"
      ) {
        // Find component name from file
        const fileName = path.basename(filePath);
        const componentName = fileName.replace(/\.(tsx|jsx)$/, "");

        if (componentName) {
          // Add export default if it's not already there
          if (!fixedContent.includes(`export default ${componentName}`)) {
            fixedContent += `\n\nexport default ${componentName};\n`;

            // Record the fix
            const projectContext = await getProjectContext();
            projectContext.recordFix(filePath, issue, "ADD_EXPORT_DEFAULT", {
              component: componentName,
            });
          }
        }
      }
    }
  }

  return fixedContent;
}

/**
 * Generate fix suggestions for an issue
 */
export async function generateFixSuggestions(issue, filePath) {
  const suggestions = [];

  // For unused variables
  if (
    issue.ruleId === "no-unused-vars" ||
    issue.ruleId === "@typescript-eslint/no-unused-vars"
  ) {
    const varNameMatch = issue.message.match(
      /'([^']+)' is (?:defined|assigned a value) but never used/
    );

    if (varNameMatch && varNameMatch[1]) {
      const varName = varNameMatch[1];

      // Get analysis from project context
      const projectContext = await getProjectContext();
      const analysis = await projectContext.analyzeVariable(
        varName,
        filePath,
        issue,
        config.USE_AI_FOR_UNUSED_VARS
      );

      // Add suggestions based on analysis
      if (
        analysis.analysisType === "TYPO" &&
        analysis.similarVariables.length > 0
      ) {
        const similarVar = analysis.similarVariables[0].name;
        suggestions.push({
          title: `Rename to '${similarVar}'`,
          description: `Variable appears to be a typo of '${similarVar}'`,
          confidence: analysis.confidence,
          action: "RENAME",
          targetName: similarVar,
        });
      }

      if (
        analysis.analysisType === "REFACTOR_LEFTOVER" &&
        analysis.confidence > 0.6
      ) {
        suggestions.push({
          title: "Remove unused variable",
          description: "Variable appears to be leftover from refactoring",
          confidence: analysis.confidence,
          action: "REMOVE",
        });
      }

      // Always add the prefix option
      suggestions.push({
        title: `Prefix with underscore: _${varName}`,
        description: "Mark variable as intentionally unused",
        confidence: 1.0, // This is always a valid option
        action: "PREFIX",
      });
    }
  }

  // For "any" type issues
  else if (issue.ruleId === "@typescript-eslint/no-explicit-any") {
    suggestions.push({
      title: "Replace 'any' with 'unknown'",
      description: "Use more specific type to improve type safety",
      confidence: 0.9,
      action: "REPLACE_ANY",
    });

    suggestions.push({
      title: "Create a specific type",
      description: "Define a custom type for this variable",
      confidence: 0.7,
      action: "CREATE_TYPE",
    });
  }

  return suggestions;
}

/**
 * Apply a specific fix based on fix details
 */
export async function applySpecificFix(
  fileContent,
  issue,
  fixDetails,
  filePath
) {
  const lines = fileContent.split("\n");
  const line = lines[issue.line - 1];
  let fixedContent = fileContent;

  if (!line) return fileContent;

  if (
    issue.ruleId === "no-unused-vars" ||
    issue.ruleId === "@typescript-eslint/no-unused-vars"
  ) {
    const varNameMatch = issue.message.match(
      /'([^']+)' is (?:defined|assigned a value) but never used/
    );

    if (varNameMatch && varNameMatch[1]) {
      const varName = varNameMatch[1];

      if (fixDetails.action === "PREFIX") {
        // Replace with underscore prefix
        const patterns = [
          // const/let/var declarations
          {
            pattern: new RegExp(
              `(const|let|var)\\s+(${varName})(?=\\s*[=:;])`,
              "g"
            ),
            replacement: `$1 _${varName}`,
          },
          // function parameters
          {
            pattern: new RegExp(`(\\(|,\\s*)(${varName})(?=\\s*[:,)])`, "g"),
            replacement: `$1_${varName}`,
          },
          // destructuring assignments
          {
            pattern: new RegExp(`({\\s*|,\\s*)(${varName})(?=\\s*[,}])`, "g"),
            replacement: `$1_${varName}`,
          },
          // function declarations
          {
            pattern: new RegExp(`function\\s+(${varName})(?=\\s*\\()`, "g"),
            replacement: `function _${varName}`,
          },
        ];

        let updatedLine = line;
        for (const { pattern, replacement } of patterns) {
          updatedLine = updatedLine.replace(pattern, replacement);
        }

        if (updatedLine !== line) {
          lines[issue.line - 1] = updatedLine;
          fixedContent = lines.join("\n");

          // Record the fix
          const projectContext = await getProjectContext();
          projectContext.recordFix(filePath, issue, "PREFIX", {
            original: varName,
            fixed: `_${varName}`,
          });
        }
      } else if (fixDetails.action === "RENAME" && fixDetails.targetName) {
        // Rename to the target variable
        const targetName = fixDetails.targetName;

        const patterns = [
          // const/let/var declarations
          {
            pattern: new RegExp(
              `(const|let|var)\\s+(${varName})(?=\\s*[=:;])`,
              "g"
            ),
            replacement: `$1 ${targetName}`,
          },
          // function parameters
          {
            pattern: new RegExp(`(\\(|,\\s*)(${varName})(?=\\s*[:,)])`, "g"),
            replacement: `$1${targetName}`,
          },
          // destructuring assignments
          {
            pattern: new RegExp(`({\\s*|,\\s*)(${varName})(?=\\s*[,}])`, "g"),
            replacement: `$1${targetName}`,
          },
          // function declarations
          {
            pattern: new RegExp(`function\\s+(${varName})(?=\\s*\\()`, "g"),
            replacement: `function ${targetName}`,
          },
        ];

        let updatedLine = line;
        for (const { pattern, replacement } of patterns) {
          updatedLine = updatedLine.replace(pattern, replacement);
        }

        if (updatedLine !== line) {
          lines[issue.line - 1] = updatedLine;
          fixedContent = lines.join("\n");

          // Record the fix
          const projectContext = await getProjectContext();
          projectContext.recordFix(filePath, issue, "RENAME", {
            original: varName,
            fixed: targetName,
          });
        }
      } else if (fixDetails.action === "REMOVE") {
        // Remove the variable
        if (
          line.trim().startsWith(`const ${varName}`) ||
          line.trim().startsWith(`let ${varName}`) ||
          line.trim().startsWith(`var ${varName}`)
        ) {
          lines[
            issue.line - 1
          ] = `// ${line} // Removed during refactoring cleanup`;
          fixedContent = lines.join("\n");

          // Record the fix
          const projectContext = await getProjectContext();
          projectContext.recordFix(filePath, issue, "REMOVE", {
            original: varName,
            fixed: "removed",
          });
        }
      }
    }
  } else if (issue.ruleId === "@typescript-eslint/no-explicit-any") {
    if (fixDetails.action === "REPLACE_ANY") {
      const updatedLine = line.replace(/: any\b/g, ": unknown");
      if (updatedLine !== line) {
        lines[issue.line - 1] = updatedLine;
        fixedContent = lines.join("\n");

        // Record the fix
        const projectContext = await getProjectContext();
        projectContext.recordFix(filePath, issue, "TYPE_FIX", {
          change: "any → unknown",
        });
      }
    }
  }

  return fixedContent;
}
