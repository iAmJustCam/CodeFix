// worker-file-processor.js
import fs from "fs";
import { parentPort, workerData } from "worker_threads";

// Worker receives workerId and files to process
const { workerId, files } = workerData;

// Track processing metrics
const startTime = performance.now();
let processedFiles = 0;
const results = [];

// Process each file in this worker's chunk
for (const filePath of files) {
  try {
    // Send progress update to main thread
    parentPort.postMessage({
      type: "progress",
      workerId,
      current: ++processedFiles,
      total: files.length,
    });

    // Read and process file
    const content = fs.readFileSync(filePath, "utf8");

    // Extract file information
    const fileInfo = {
      path: filePath,
      variables: extractVariables(content),
      imports: extractImports(content),
      exports: extractExports(content),
      // Add stats for parallel processing performance tracking
      processingTime: 0,
      size: content.length,
    };

    // Record processing time for this file
    fileInfo.processingTime = performance.now() - startTime;

    // Add to results
    results.push(fileInfo);
  } catch (error) {
    // Report error to main thread
    parentPort.postMessage({
      type: "error",
      workerId,
      error: `Error processing ${filePath}: ${error.message}`,
    });
  }
}

// Send complete results back to main thread
parentPort.postMessage({
  type: "results",
  workerId,
  data: results,
  metrics: {
    totalTime: performance.now() - startTime,
    averageTimePerFile: (performance.now() - startTime) / files.length,
    totalFiles: files.length,
    memoryUsage: process.memoryUsage(),
  },
});

/**
 * Extract variable declarations and usages from file content
 */
function extractVariables(content) {
  const variables = [];
  const lines = content.split("\n");

  // Regular expressions for different types of declarations
  const patterns = [
    // Variable declarations
    {
      regex: /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g,
      type: "variable",
    },
    // Function declarations
    { regex: /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g, type: "function" },
    // Class declarations
    { regex: /\bclass\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g, type: "class" },
    // Method declarations
    {
      regex: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{/g,
      type: "method",
    },
    // JSX/TSX component references
    { regex: /<([A-Z][a-zA-Z0-9_$]*)(?:\s|\/|>)/g, type: "component" },
  ];

  // Variable usages (not declarations)
  const usagePattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;

  // Process each line to find declarations
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // Check for declarations
    for (const pattern of patterns) {
      let match;
      pattern.regex.lastIndex = 0; // Reset the regex
      while ((match = pattern.regex.exec(line)) !== null) {
        const name = match[1];
        if (name) {
          variables.push({
            name,
            line: lineNum + 1,
            type: pattern.type,
            declaration: true,
            usage: false,
          });
        }
      }
    }

    // Check for usages
    let usageMatch;
    usagePattern.lastIndex = 0; // Reset the regex
    while ((usageMatch = usagePattern.exec(line)) !== null) {
      const name = usageMatch[1];
      // Filter out common keywords and short variable names
      if (name && name.length > 1 && !isCommonKeyword(name)) {
        // Only add usage if it's not already added as a declaration on this line
        const existingDeclaration = variables.find(
          (v) => v.name === name && v.line === lineNum + 1 && v.declaration
        );

        if (!existingDeclaration) {
          variables.push({
            name,
            line: lineNum + 1,
            type: "usage",
            declaration: false,
            usage: true,
          });
        }
      }
    }
  }

  return variables;
}

/**
 * Check if a word is a common JavaScript/TypeScript keyword
 */
function isCommonKeyword(word) {
  const keywords = [
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "new",
    "null",
    "return",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
    "let",
    "static",
    "enum",
    "await",
    "implements",
    "package",
    "protected",
    "interface",
    "private",
    "public",
    "as",
    "from",
  ];

  return keywords.includes(word);
}

/**
 * Extract import statements from file content
 */
function extractImports(content) {
  const imports = [];
  const importRegex =
    /import\s+(?:{([^}]+)}|\*\s+as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|([a-zA-Z_$][a-zA-Z0-9_$]*))?(?:\s*,\s*{([^}]+)})?(?:\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*))?(?:\s*from\s+['"]([^'"]+)['"])/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const [
      fullMatch,
      namedImports,
      namespaceImport,
      defaultImport,
      additionalNamedImports,
      additionalDefaultImport,
      source,
    ] = match;

    // Process all named imports
    const allNamedImports = [];
    if (namedImports) {
      allNamedImports.push(
        ...namedImports.split(",").map((i) => i.trim().split(" as ")[0].trim())
      );
    }
    if (additionalNamedImports) {
      allNamedImports.push(
        ...additionalNamedImports
          .split(",")
          .map((i) => i.trim().split(" as ")[0].trim())
      );
    }

    imports.push({
      source,
      defaultImport: defaultImport || additionalDefaultImport || null,
      namespaceImport: namespaceImport || null,
      namedImports: allNamedImports,
    });
  }

  return imports;
}

/**
 * Extract export statements from file content
 */
function extractExports(content) {
  const exports = [];
  const exportRegex =
    /export\s+(?:default\s+)?(?:(?:class|function|const|let|var)\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    const [fullMatch, exportName] = match;
    const isDefault = fullMatch.includes("default");

    exports.push({
      name: exportName,
      isDefault,
    });
  }

  return exports;
}
