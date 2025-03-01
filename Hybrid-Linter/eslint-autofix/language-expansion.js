// language-expansion.js
import fs from "fs";
import path from "path";
import { config } from "./state.js";

/**
 * Languages with built-in support patterns
 */
export const SUPPORTED_LANGUAGES = {
  // JavaScript and TypeScript (base support)
  js: {
    extensions: [".js", ".jsx"],
    variablePattern: /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g,
    functionPattern: /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g,
    importPattern:
      /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g,
    unusedPrefix: "_",
    commentStyle: "//",
    engines: ["eslint"],
  },
  ts: {
    extensions: [".ts", ".tsx"],
    variablePattern: /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g,
    functionPattern: /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g,
    importPattern:
      /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g,
    unusedPrefix: "_",
    commentStyle: "//",
    engines: ["eslint", "tsc"],
  },

  // Python support
  python: {
    extensions: [".py"],
    variablePattern: /^(\s*[a-zA-Z_][a-zA-Z0-9_]*)\s*=/gm,
    functionPattern: /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    importPattern:
      /(?:from\s+([a-zA-Z_.][a-zA-Z0-9_.]*)\s+import)|(?:import\s+([a-zA-Z_.][a-zA-Z0-9_.]*))/g,
    unusedPrefix: "_",
    commentStyle: "#",
    engines: ["pylint", "flake8", "mypy"],
  },

  // Ruby support
  ruby: {
    extensions: [".rb"],
    variablePattern: /(?:^|\s)([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g,
    functionPattern: /def\s+([a-zA-Z_][a-zA-Z0-9_?!]*)/g,
    importPattern: /require\s+['"]([^'"]+)['"]/g,
    unusedPrefix: "_",
    commentStyle: "#",
    engines: ["rubocop"],
  },

  // Go support
  go: {
    extensions: [".go"],
    variablePattern: /\b(?:var|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
    functionPattern: /func\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    importPattern: /import\s+(?:\(\s*|\s+)["']([^"']+)["']/g,
    unusedPrefix: "_",
    commentStyle: "//",
    engines: ["golint", "golangci-lint"],
  },

  // Rust support
  rust: {
    extensions: [".rs"],
    variablePattern: /(?:let|const)\s+(?:mut\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/g,
    functionPattern: /fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    importPattern: /use\s+([a-zA-Z_:][a-zA-Z0-9_:]*)/g,
    unusedPrefix: "_",
    commentStyle: "//",
    engines: ["clippy"],
  },
};

/**
 * Register a new language for processing
 * @param {string} langKey - Shortcode for the language (e.g., 'py', 'go')
 * @param {object} languageConfig - Language configuration
 * @returns {Promise<boolean>} - Success status
 */
export async function registerLanguage(langKey, languageConfig) {
  try {
    // Validate language config
    if (
      !languageConfig.extensions ||
      !languageConfig.variablePattern ||
      !languageConfig.functionPattern
    ) {
      throw new Error(
        "Invalid language configuration: missing required patterns"
      );
    }

    // Get project context for initialization
    const { getProjectContext } = await import("./project-context.js");
    const projectContext = await getProjectContext();

    // Add extensions to the languageSupport set
    languageConfig.extensions.forEach((ext) => {
      const extWithoutDot = ext.startsWith(".") ? ext.substring(1) : ext;
      projectContext.languageSupport.add(extWithoutDot);
    });

    // Store language patterns
    config.LANGUAGE_PATTERNS = config.LANGUAGE_PATTERNS || {};
    config.LANGUAGE_PATTERNS[langKey] = languageConfig;

    // If project context is already initialized, we need to re-initialize
    if (projectContext.initialized) {
      console.log(
        `Added support for ${langKey} language. Re-initializing project context...`
      );
      projectContext.initialized = false;
      await projectContext.initialize();
    } else {
      console.log(`Added support for ${langKey} language`);
    }

    return true;
  } catch (error) {
    console.error(`Error registering language ${langKey}: ${error.message}`);
    return false;
  }
}

/**
 * Find all files with a specific extension
 * @param {string} extension - File extension to search for (e.g., '.py')
 * @returns {string[]} Array of file paths
 */
export function findFilesByExtension(extension) {
  try {
    // Ensure extension starts with a dot
    if (!extension.startsWith(".")) {
      extension = "." + extension;
    }

    // Use appropriate command based on OS
    const { execSync } = require("child_process");
    const output = execSync(
      `find "${config.TARGET_DIR}" -type f -name "*${extension}"`,
      { encoding: "utf-8" }
    );

    // Filter out excluded directories
    return output
      .trim()
      .split("\n")
      .filter((line) => line.trim() !== "")
      .filter((filePath) => {
        return (
          !filePath.includes("/node_modules/") &&
          !filePath.includes("/dist/") &&
          !filePath.includes("/build/") &&
          !filePath.includes("/.git/")
        );
      });
  } catch (error) {
    console.error(`Error finding ${extension} files: ${error.message}`);
    return [];
  }
}

/**
 * Run language-specific linting tools
 * @param {string} langKey - Language key (e.g., 'python', 'go')
 * @param {string[]} files - Files to lint
 * @returns {Promise<Array>} - List of linting issues
 */
export async function runLanguageLinter(langKey, files = []) {
  if (!config.LANGUAGE_PATTERNS || !config.LANGUAGE_PATTERNS[langKey]) {
    console.error(`Language configuration not found for ${langKey}`);
    return [];
  }

  const langConfig = config.LANGUAGE_PATTERNS[langKey];

  if (!langConfig.engines || langConfig.engines.length === 0) {
    console.warn(`No linting engines configured for ${langKey}`);
    return [];
  }

  const issues = [];

  // If no files provided, find all files with this language's extensions
  if (files.length === 0) {
    for (const ext of langConfig.extensions) {
      files.push(...findFilesByExtension(ext));
    }
  }

  if (files.length === 0) {
    console.log(`No ${langKey} files found to lint`);
    return [];
  }

  console.log(`Running linters for ${langKey} on ${files.length} files...`);

  // Run each configured linting engine
  for (const engine of langConfig.engines) {
    try {
      const engineIssues = await runLintingEngine(engine, langKey, files);
      issues.push(...engineIssues);
    } catch (error) {
      console.error(`Error running ${engine} for ${langKey}: ${error.message}`);
    }
  }

  return issues;
}

/**
 * Run a specific linting engine
 * @private
 */
async function runLintingEngine(engine, langKey, files) {
  // Implement engine-specific linting here
  // This is just a placeholder - each engine needs custom implementation
  switch (engine) {
    case "eslint":
      // Use existing ESLint runner
      const { findRemainingIssues } = await import("./eslint-runner.js");
      return findRemainingIssues(files);

    case "pylint":
      // We'd need to implement Python-specific linting
      console.log(`Python linting with pylint not yet implemented`);
      return [];

    case "flake8":
      console.log(`Python linting with flake8 not yet implemented`);
      return [];

    // Add other engine implementations

    default:
      console.warn(`Linting engine ${engine} not yet implemented`);
      return [];
  }
}

/**
 * Apply language-specific fixes for common issues
 * @param {string} filePath - Path to the file to fix
 * @param {Array} issues - List of detected issues
 * @returns {Promise<boolean>} - Success status
 */
export async function applyLanguageSpecificFixes(filePath, issues) {
  // Determine language from file extension
  const ext = path.extname(filePath).toLowerCase();
  let langKey = null;

  // Find the language that matches this extension
  for (const [key, lang] of Object.entries(
    config.LANGUAGE_PATTERNS || SUPPORTED_LANGUAGES
  )) {
    if (lang.extensions.includes(ext)) {
      langKey = key;
      break;
    }
  }

  if (!langKey) {
    console.warn(`No language configuration found for ${ext} files`);
    return false;
  }

  const langConfig =
    config.LANGUAGE_PATTERNS[langKey] || SUPPORTED_LANGUAGES[langKey];

  if (!langConfig) {
    console.warn(`Language configuration missing for ${langKey}`);
    return false;
  }

  // Read file content
  const content = fs.readFileSync(filePath, "utf8");
  let fixedContent = content;
  let fixCount = 0;

  // Apply language-specific fixes
  for (const issue of issues) {
    // Common linting issue types across languages
    if (
      issue.ruleId?.includes("unused") ||
      issue.message?.includes("unused") ||
      issue.message?.includes("never used")
    ) {
      // Fix unused variable by adding language-specific prefix
      const varNameMatch = issue.message.match(
        /'([^']+)' is (?:defined|assigned a value|declared) but never used/
      );

      if (varNameMatch && varNameMatch[1]) {
        const varName = varNameMatch[1];
        const unusedPrefix = langConfig.unusedPrefix || "_";

        if (!varName.startsWith(unusedPrefix)) {
          // Apply language-specific variable pattern replacement
          switch (langKey) {
            case "js":
            case "ts":
              // TypeScript/JavaScript pattern
              fixedContent = fixedContent.replace(
                new RegExp(`(const|let|var)\\s+(${varName})(?=\\s*[=:;])`, "g"),
                `$1 ${unusedPrefix}${varName}`
              );
              break;

            case "python":
              // Python pattern
              fixedContent = fixedContent.replace(
                new RegExp(`^(\\s*)(${varName})\\s*=`, "gm"),
                `$1${unusedPrefix}${varName} =`
              );
              break;

            case "go":
              // Go pattern
              fixedContent = fixedContent.replace(
                new RegExp(`\\b(var|const)\\s+(${varName})\\b`, "g"),
                `$1 ${unusedPrefix}${varName}`
              );
              break;

            default:
              // Generic pattern for other languages
              fixedContent = fixedContent.replace(
                new RegExp(`\\b(${varName})\\b(?=\\s*[=:])`, "g"),
                `${unusedPrefix}${varName}`
              );
          }

          if (fixedContent !== content) {
            fixCount++;
          }
        }
      }
    }

    // Add language-specific fixes for other issue types
    // For example, Python-specific indentation fixes, Go-specific imports, etc.
    if (langKey === "python" && issue.ruleId?.includes("indentation")) {
      // Fix Python indentation issues
      // This would need to be implemented based on specific Python linting rules
    }

    if (langKey === "go" && issue.ruleId?.includes("import")) {
      // Fix Go import organization issues
      // This would need to be implemented based on specific Go linting rules
    }
  }

  // Only write to file if changes were made
  if (fixCount > 0 && fixedContent !== content) {
    // Create a backup
    fs.writeFileSync(`${filePath}.backup`, content);

    // Write fixed content
    fs.writeFileSync(filePath, fixedContent);

    console.log(
      `Applied ${fixCount} language-specific fixes to ${path.basename(
        filePath
      )}`
    );
    return true;
  }

  return false;
}

/**
 * Add support for a specific language
 * @param {string} language - Language name (e.g., 'python', 'go', 'ruby')
 * @returns {Promise<boolean>} - Success status
 */
export async function addLanguageSupport(language) {
  // Convert language name to lowercase
  language = language.toLowerCase();

  // Check if it's a built-in supported language
  if (SUPPORTED_LANGUAGES[language]) {
    console.log(`Adding support for ${language}...`);

    // Register the language
    await registerLanguage(language, SUPPORTED_LANGUAGES[language]);

    // Look for linting tools for this language
    const engines = SUPPORTED_LANGUAGES[language].engines || [];
    let enginesFound = 0;

    // Try to execute the linting engine to check if it's installed
    for (const engine of engines) {
      try {
        const { execSync } = require("child_process");
        execSync(`which ${engine}`, { stdio: "ignore" });
        console.log(`✓ Found ${engine} for ${language} linting`);
        enginesFound++;
      } catch (e) {
        console.log(
          `⚠ ${engine} not found. Some ${language} linting features may be limited.`
        );
      }
    }

    if (enginesFound === 0 && engines.length > 0) {
      console.log(
        `No linting engines found for ${language}. Please install one of: ${engines.join(
          ", "
        )}`
      );
    }

    return true;
  } else {
    console.log(`Language '${language}' is not a built-in supported language.`);
    console.log(
      `Supported languages: ${Object.keys(SUPPORTED_LANGUAGES).join(", ")}`
    );

    // Prompt for custom language configuration
    console.log(
      `\nTo add custom language support, use registerLanguage() with appropriate patterns.`
    );

    return false;
  }
}
