// preprocessing.js
import fs from "fs";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import { config } from "./state.js";

export function cleanMarkdownCodeBlocks(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

    // Detect markdown code blocks
    const hasMarkdownStart = content.match(/^```(tsx?|jsx?)/m);
    const hasMarkdownEnd = content.match(/```\s*$/m);

    if (hasMarkdownStart && hasMarkdownEnd) {
      console.log(
        chalk.blue(
          `Detected markdown code blocks in ${path.basename(filePath)}, cleaning...`
        )
      );

      // Extract the actual code content from within the code blocks
      const cleanedContent = content
        .replace(/^```(tsx?|jsx?)\n/m, "")
        .replace(/```\s*$/m, "");

      // Create a backup of the original file
      fs.writeFileSync(`${filePath}.original`, content);

      // Write the cleaned content back to the file
      fs.writeFileSync(filePath, cleanedContent);

      return true;
    }

    return false;
  } catch (error) {
    console.error(
      chalk.red(`Error cleaning markdown from ${filePath}: ${error.message}`)
    );
    return false;
  }
}

export function preprocessFiles(files) {
  const spinner = ora({
    text: chalk.blue("Preprocessing files for syntax issues..."),
    color: "blue",
  }).start();

  let cleanedCount = 0;

  for (const file of files) {
    if (cleanMarkdownCodeBlocks(file)) {
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    spinner.succeed(
      chalk.green(`Cleaned markdown code blocks from ${cleanedCount} files`)
    );
  } else {
    spinner.succeed(chalk.green("No markdown code blocks found"));
  }

  return cleanedCount;
}

export function preprocessFilesAdvanced(files) {
  const spinner = ora({
    text: chalk.blue("Performing advanced syntax validation..."),
    color: "blue",
  }).start();

  let fixedCount = 0;

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      let modified = false;
      let fixedContent = content;

      // Make a backup
      if (!fs.existsSync(`${filePath}.backup`)) {
        fs.writeFileSync(`${filePath}.backup`, content);
      }

      // 1. Detect and fix markdown code blocks
      if (
        fixedContent.match(/^```(tsx?|jsx?)/m) &&
        fixedContent.match(/```\s*$/m)
      ) {
        fixedContent = fixedContent
          .replace(/^```(tsx?|jsx?)\n/m, "")
          .replace(/```\s*$/m, "");
        modified = true;
      }

      // 2. Check for unbalanced brackets and braces
      const symbols = [
        { open: "<", close: ">" },
        { open: "(", close: ")" },
        { open: "{", close: "}" },
        { open: "[", close: "]" },
      ];

      let appendix = "";

      for (const { open, close } of symbols) {
        const openCount = (
          fixedContent.match(new RegExp(`\\${open}`, "g")) || []
        ).length;
        const closeCount = (
          fixedContent.match(new RegExp(`\\${close}`, "g")) || []
        ).length;

        if (openCount > closeCount) {
          appendix += close.repeat(openCount - closeCount);
          modified = true;
        }
      }

      if (appendix) {
        fixedContent += `\n\n/* Auto-inserted closing brackets: ${appendix} */\n${appendix}`;
      }

      // 3. Check for unclosed quotes
      const quotes = ["'", '"', "`"];

      for (const quote of quotes) {
        const quoteRegex = new RegExp(`${quote}`, "g");
        const quoteCount = (fixedContent.match(quoteRegex) || []).length;

        if (quoteCount % 2 !== 0) {
          // Find the last unclosed quote and close it
          const lines = fixedContent.split("\n");
          let lastLineWithQuote = -1;

          for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].includes(quote)) {
              const lineQuotes = (lines[i].match(quoteRegex) || []).length;
              if (lineQuotes % 2 !== 0) {
                lastLineWithQuote = i;
                break;
              }
            }
          }

          if (lastLineWithQuote >= 0) {
            lines[lastLineWithQuote] += quote;
            fixedContent = lines.join("\n");
            modified = true;
          }
        }
      }

      // 4. Add missing exports for modules that appear to be components
      if (
        path.extname(filePath) === ".tsx" &&
        !fixedContent.includes("export default")
      ) {
        const componentNameMatch = fixedContent.match(
          /const\s+([A-Z][a-zA-Z0-9_]*)\s*:\s*React\.FC/
        );
        if (componentNameMatch) {
          const componentName = componentNameMatch[1];
          fixedContent += `\n\nexport default ${componentName};\n`;
          modified = true;
        }
      }

      // 5. Fix common TypeScript/React import issues
      if (
        !fixedContent.includes("import React") &&
        path.extname(filePath) === ".tsx"
      ) {
        fixedContent = `import React from "react";\n${fixedContent}`;
        modified = true;
      }

      // 6. Fix JSX fragment syntax
      if (fixedContent.includes("<>") && fixedContent.includes("</>")) {
        if (
          !fixedContent.includes("Fragment") &&
          !fixedContent.includes("<React.Fragment>")
        ) {
          fixedContent = fixedContent.replace(
            /import React from "react";/,
            'import React, { Fragment } from "react";'
          );
          modified = true;
        }
      }

      // If we modified the content, write it back
      if (modified) {
        fs.writeFileSync(filePath, fixedContent);
        fixedCount++;
      }
    } catch (error) {
      console.error(
        chalk.red(`Error preprocessing ${filePath}: ${error.message}`)
      );
    }
  }

  if (fixedCount > 0) {
    spinner.succeed(
      chalk.green(`Applied advanced syntax fixes to ${fixedCount} files`)
    );
  } else {
    spinner.succeed(chalk.green("No advanced syntax issues found"));
  }

  return fixedCount;
}

export function fixParseErrors(filePath, errors) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    let modified = false;

    // Make a backup if not already done
    if (!fs.existsSync(`${filePath}.original`)) {
      fs.writeFileSync(`${filePath}.original`, content);
    }

    // Extract error messages for easier analysis
    const errorMessages = errors.map((e) => e.message || "").join("\n");

    let fixedContent = content;

    // 1. Fix markdown code blocks
    if (
      fixedContent.match(/^```(tsx?|jsx?)/m) &&
      fixedContent.match(/```\s*$/m)
    ) {
      fixedContent = fixedContent
        .replace(/^```(tsx?|jsx?)\n/m, "")
        .replace(/```\s*$/m, "");
      modified = true;
    }

    // 2. Handle "Module declaration names" error
    if (errorMessages.includes("Module declaration names may only use ' or")) {
      fixedContent = fixedContent.replace(/module\s+`([^`]+)`/g, 'module "$1"');
      modified = true;
    }

    // 3. Fix unbalanced angle brackets (common in JSX/TSX)
    const bracketErrorPatterns = [
      "Unexpected token '<'",
      "Unexpected token '>'",
      "Expected corresponding JSX closing tag",
      "Unterminated JSX contents",
    ];

    if (
      bracketErrorPatterns.some((pattern) => errorMessages.includes(pattern))
    ) {
      // Count opening and closing brackets to identify issues
      const openAngleBrackets = (fixedContent.match(/</g) || []).length;
      const closeAngleBrackets = (fixedContent.match(/>/g) || []).length;

      // If we have unbalanced brackets, try to fix them
      if (openAngleBrackets !== closeAngleBrackets) {
        console.log(
          chalk.yellow(
            `Detected unbalanced angle brackets: ${openAngleBrackets} opening vs ${closeAngleBrackets} closing`
          )
        );

        if (openAngleBrackets > closeAngleBrackets) {
          // Find lines with unclosed tags
          const lines = fixedContent.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const openTags = (line.match(/</g) || []).length;
            const closeTags = (line.match(/>/g) || []).length;

            if (openTags > closeTags) {
              // Add missing closing bracket at the end of the line
              lines[i] = line + ">".repeat(openTags - closeTags);
              modified = true;
            }
          }

          fixedContent = lines.join("\n");
        } else if (closeAngleBrackets > openAngleBrackets) {
          // Find lines with extra closing tags
          const lines = fixedContent.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const openTags = (line.match(/</g) || []).length;
            const closeTags = (line.match(/>/g) || []).length;

            if (closeTags > openTags) {
              // Add missing opening brackets at the beginning of content
              const leadingWhitespace = line.match(/^\s*/)[0];
              lines[i] =
                leadingWhitespace +
                "<".repeat(closeTags - openTags) +
                line.trimStart();
              modified = true;
            }
          }

          fixedContent = lines.join("\n");
        }
      }
    }

    // 4. Fix unclosed strings
    if (errorMessages.includes("Unterminated string constant")) {
      const lines = fixedContent.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Count quotes in the line
        const singleQuotes = (line.match(/'/g) || []).length;
        const doubleQuotes = (line.match(/"/g) || []).length;
        const backticks = (line.match(/`/g) || []).length;

        // If there's an odd number of any quote type, it's likely unclosed
        if (singleQuotes % 2 !== 0) {
          lines[i] = line + "'";
          modified = true;
        } else if (doubleQuotes % 2 !== 0) {
          lines[i] = line + '"';
          modified = true;
        } else if (backticks % 2 !== 0) {
          lines[i] = line + "`";
          modified = true;
        }
      }

      fixedContent = lines.join("\n");
    }

    // 5. Fix missing semicolons
    if (errorMessages.includes("Missing semicolon")) {
      const lines = fixedContent.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Check if line needs a semicolon
        if (
          line &&
          !line.endsWith(";") &&
          !line.endsWith("{") &&
          !line.endsWith("}") &&
          !line.endsWith(",") &&
          !line.startsWith("import") && // avoid import statements that use line breaks
          !line.startsWith("export")
        ) {
          // Add semicolon if it's a statement that likely needs one
          const needsSemicolon =
            /\b(const|let|var|return|throw|new|delete|typeof|void)\b/.test(
              line
            );

          if (needsSemicolon) {
            lines[i] = lines[i] + ";";
            modified = true;
          }
        }
      }

      fixedContent = lines.join("\n");
    }

    // 6. Fix unbalanced parentheses, curly braces, and square brackets
    if (
      errorMessages.includes("Unexpected token") ||
      errorMessages.includes("Expected token")
    ) {
      const openParens = (fixedContent.match(/\(/g) || []).length;
      const closeParens = (fixedContent.match(/\)/g) || []).length;
      const openCurly = (fixedContent.match(/{/g) || []).length;
      const closeCurly = (fixedContent.match(/}/g) || []).length;
      const openSquare = (fixedContent.match(/\[/g) || []).length;
      const closeSquare = (fixedContent.match(/\]/g) || []).length;

      let appendAtEnd = "";

      // Add missing closing brackets
      if (openParens > closeParens) {
        appendAtEnd += ")".repeat(openParens - closeParens);
        modified = true;
      }

      if (openCurly > closeCurly) {
        appendAtEnd += "}".repeat(openCurly - closeCurly);
        modified = true;
      }

      if (openSquare > closeSquare) {
        appendAtEnd += "]".repeat(openSquare - closeSquare);
        modified = true;
      }

      if (appendAtEnd) {
        fixedContent = fixedContent + "\n" + appendAtEnd;
      }
    }

    // 7. Fix incorrect object key formatting
    if (errorMessages.includes("Unexpected identifier")) {
      // Look for object keys without quotes
      fixedContent = fixedContent.replace(/{([^}]*?)}/g, (match, contents) => {
        return (
          "{" +
          contents.replace(/(\s*)([a-zA-Z0-9_$]+)(\s*):(\s*)/g, '$1"$2"$3:$4') +
          "}"
        );
      });
      modified = true;
    }

    // 8. Fix invalid escape sequences in strings
    if (errorMessages.includes("Invalid escape sequence")) {
      fixedContent = fixedContent.replace(
        /(["'])(?:(?=(\\?))\2.)*?\1/g,
        (match) => {
          return match.replace(/\\([^ntrbfv'"\\/])/g, "$1");
        }
      );
      modified = true;
    }

    // 9. Fix double commas in arrays and objects
    if (errorMessages.includes("Unexpected token ','")) {
      fixedContent = fixedContent.replace(/,\s*,+/g, ",");
      modified = true;
    }

    // 10. Fix missing return statement in arrow functions
    if (errorMessages.includes("Expected an assignment or function call")) {
      // Match arrow functions without curly braces that might be missing return
      fixedContent = fixedContent.replace(
        /(\([^)]*\)\s*=>\s*)(?!{)(.+)/g,
        "$1{ return $2; }"
      );
      modified = true;
    }

    // If we modified the content, write it back
    if (modified) {
      fs.writeFileSync(filePath, fixedContent);
      console.log(
        chalk.green(`Applied syntax fixes to ${path.basename(filePath)}`)
      );
      return true;
    }

    return false;
  } catch (error) {
    console.error(
      chalk.red(`Error fixing parse errors in ${filePath}: ${error.message}`)
    );
    return false;
  }
}
