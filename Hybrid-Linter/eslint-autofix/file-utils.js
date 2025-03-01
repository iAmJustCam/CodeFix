// file-utils.js
import chalk from "chalk";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "./state.js";

export function findTypeScriptFiles() {
  try {
    // Use simpler find commands and process filters in JavaScript
    let command;

    if (config.TARGET_DIR === "./") {
      // Handle current directory case specially
      command = 'find . -type f \\( -name "*.ts" -o -name "*.tsx" \\)';
    } else {
      // Handle specific directory
      command = `find "${config.TARGET_DIR}" -type f \\( -name "*.ts" -o -name "*.tsx" \\)`;
    }

    const output = execSync(command, { encoding: "utf-8" });

    // Manual filtering in JavaScript
    return output
      .trim()
      .split("\n")
      .filter((line) => {
        if (!line.trim()) return false;
        // Skip node_modules and other common excluded directories
        return (
          !line.includes("/node_modules/") &&
          !line.includes("/dist/") &&
          !line.includes("/build/") &&
          !line.includes("/.next/")
        );
      });
  } catch (error) {
    console.error(
      chalk.red(`Error finding TypeScript files: ${error.message}`)
    );
    return [];
  }
}

export function getCodeContext(filePath, line, column, contextLines = 3) {
  try {
    if (!fs.existsSync(filePath)) return null;

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const lines = fileContent.split("\n");

    const startLine = Math.max(0, line - contextLines - 1);
    const endLine = Math.min(lines.length - 1, line + contextLines - 1);

    return lines.slice(startLine, endLine + 1).map((text, idx) => {
      const lineNum = startLine + idx + 1;
      const isErrorLine = lineNum === line;
      return {
        lineNum,
        text,
        isErrorLine,
      };
    });
  } catch (e) {
    return null;
  }
}

export function resolveImportPath(currentFilePath, importPath) {
  try {
    const currentDir = path.dirname(currentFilePath);
    const extensions = [".ts", ".tsx", ".js", ".jsx"];

    // Handle extension-less imports
    if (!path.extname(importPath)) {
      for (const ext of extensions) {
        const testPath = path.resolve(currentDir, importPath + ext);
        if (fs.existsSync(testPath)) {
          return testPath;
        }
      }

      // Check for index files
      for (const ext of extensions) {
        const indexPath = path.resolve(currentDir, importPath, "index" + ext);
        if (fs.existsSync(indexPath)) {
          return indexPath;
        }
      }
    } else {
      return path.resolve(currentDir, importPath);
    }
  } catch (e) {
    return null;
  }

  return null;
}

export function findProjectRoot(filePath) {
  let currentDir = path.dirname(filePath);
  const maxDepth = 10; // Prevent infinite loops
  let depth = 0;

  while (depth < maxDepth) {
    const packageJsonPath = path.join(currentDir, "package.json");
    const gitPath = path.join(currentDir, ".git");

    if (fs.existsSync(packageJsonPath) || fs.existsSync(gitPath)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached the root directory
      break;
    }

    currentDir = parentDir;
    depth++;
  }

  // Fallback to the current directory
  return path.dirname(filePath);
}

export function getProjectContext(filePath) {
  try {
    // Get imports from the file to understand dependencies
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const importRegex =
      /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    const imports = [];
    let match;

    while ((match = importRegex.exec(fileContent)) !== null) {
      imports.push(match[1]);
    }

    const relativeImports = imports.filter((imp) => imp.startsWith("."));
    const context = [];

    // Find ESLint and TypeScript configuration
    const configFiles = [
      ".eslintrc.js",
      ".eslintrc.json",
      ".eslintrc",
      "eslint.config.js",
      "tsconfig.json",
    ];

    const rootDir = findProjectRoot(filePath);
    let configs = "";

    for (const configFile of configFiles) {
      const configPath = path.join(rootDir, configFile);
      if (fs.existsSync(configPath)) {
        try {
          const configContent = fs.readFileSync(configPath, "utf-8");
          configs += `${configFile}:\n${configContent}\n\n`;
        } catch (e) {
          // Skip if we can't read the file
        }
      }
    }

    if (configs) {
      context.push(`Configuration files:\n${configs}`);
    }

    // Check for related files from imports
    if (relativeImports.length > 0) {
      context.push("Related files from imports:");

      for (const imp of relativeImports) {
        try {
          const importPath = resolveImportPath(filePath, imp);
          if (importPath && fs.existsSync(importPath)) {
            const importContent = fs.readFileSync(importPath, "utf-8");
            // Only include short files or extract interfaces/types
            if (importContent.length < 1000) {
              context.push(`${imp}:\n${importContent}`);
            } else {
              // Extract just type definitions
              const typeRegex =
                /(export\s+(?:interface|type|enum)\s+\w+[\s\S]+?(?=export|$))/g;
              const types = [];
              let typeMatch;

              while ((typeMatch = typeRegex.exec(importContent)) !== null) {
                types.push(typeMatch[1]);
              }

              if (types.length > 0) {
                context.push(
                  `${imp} (type definitions only):\n${types.join("\n\n")}`
                );
              }
            }
          }
        } catch (e) {
          // Skip if we can't resolve the import
        }
      }
    }

    return context.join("\n\n");
  } catch (e) {
    return "";
  }
}

export function showDiff(oldContent, newContent) {
  console.log(chalk.bold("\nChanges:"));

  const differences = diffLines(oldContent, newContent);

  differences.forEach((part) => {
    const color = part.added
      ? chalk.green
      : part.removed
      ? chalk.red
      : chalk.gray;

    const prefix = part.added ? "+" : part.removed ? "-" : " ";

    const lines = part.value
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => `${prefix} ${line}`);

    if (lines.length > 0) {
      console.log(color(lines.join("\n")));
    }
  });

  console.log(); // Empty line for spacing
}
