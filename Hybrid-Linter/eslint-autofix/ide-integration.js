// ide-integration.js
import fs from "fs";
import path from "path";
import { getProjectContext } from "./project-context.js";
import { generateFixSuggestions } from "./simple-fixes.js";
import { config } from "./state.js";

/**
 * API for IDE integration
 *
 * These functions can be called directly from IDE extensions
 * to provide in-editor linting and fixing capabilities.
 */

/**
 * Initialize the project context for IDE integration
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} - Initialization status
 */
export async function initializeForIDE(options = {}) {
  try {
    // Override config with IDE-specific settings
    Object.assign(config, options);

    // Set interactive mode by default for IDE integration
    config.INTERACTIVE = true;

    // Initialize the project context
    const projectContext = await getProjectContext();
    await projectContext.initialize();

    // Check license
    const licenseStatus = projectContext.checkLicense();

    return {
      initialized: true,
      licenseStatus,
      filesAnalyzed: projectContext.files.size,
      variablesTracked: projectContext.variables.size,
      languagesSupported: Array.from(projectContext.languageSupport),
      teamProfiles: Array.from(projectContext.teamProfiles.keys()),
    };
  } catch (error) {
    return {
      initialized: false,
      error: error.message,
    };
  }
}

/**
 * Get suggested fixes for a file
 * @param {string} filePath - Path to the file
 * @param {string} fileContent - Current content of the file
 * @param {Array} issues - Linting issues (optional, will be detected if not provided)
 * @returns {Promise<Object>} - Suggested fixes
 */
export async function getSuggestedFixes(filePath, fileContent, issues = null) {
  try {
    const projectContext = await getProjectContext();

    // Make sure the context is initialized
    if (!projectContext.initialized) {
      await projectContext.initialize();
    }

    // If issues not provided, run linting to detect them
    if (!issues) {
      // Write the content to a temporary file if it doesn't match the actual file
      let tempFilePath = null;
      let actualContent = "";

      try {
        actualContent = fs.readFileSync(filePath, "utf8");
      } catch (e) {
        // File might not exist yet
      }

      if (fileContent !== actualContent) {
        tempFilePath = `${filePath}.temp`;
        fs.writeFileSync(tempFilePath, fileContent);
        filePath = tempFilePath;
      }

      // Run ESLint to find issues
      const { findRemainingIssues } = await import("./eslint-runner.js");
      const result = await findRemainingIssues([filePath]);
      issues = result.filesWithIssues[0]?.issues || [];

      // Clean up temp file
      if (tempFilePath) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }

    // Generate suggestions for each issue
    const suggestions = [];

    for (const issue of issues) {
      // For unused variables, run AI analysis
      if (
        issue.ruleId === "no-unused-vars" ||
        issue.ruleId === "@typescript-eslint/no-unused-vars"
      ) {
        const varNameMatch = issue.message.match(
          /'([^']+)' is (?:defined|assigned a value) but never used/
        );

        if (varNameMatch && varNameMatch[1]) {
          const varName = varNameMatch[1];

          // Get AI analysis
          const analysis = await projectContext.analyzeVariable(
            varName,
            filePath,
            issue,
            config.USE_AI_FOR_UNUSED_VARS
          );

          // Ensure possibleActions is properly populated
          const possibleFixes = analysis.possibleActions || [
            {
              action: "PREFIX",
              description: "Add underscore prefix",
              confidence: 0.9,
              title: `Prefix with underscore: _${varName}`,
            },
            {
              action: "REMOVE",
              description: "Remove unused variable",
              confidence: 0.7,
              title: "Remove unused variable",
            },
          ];

          // Add analysis to suggestions
          suggestions.push({
            line: issue.line,
            column: issue.column,
            ruleId: issue.ruleId,
            message: issue.message,
            analysisType: analysis.analysisType,
            confidence: analysis.confidence,
            explanation: analysis.explanation,
            possibleFixes: possibleFixes,
            severity: issue.severity,
            code: issue.code,
          });

          // Track usage for monetization
          projectContext.trackUsage("analysis", {
            filePath,
            ruleId: issue.ruleId,
            analysisType: analysis.analysisType,
          });
        }
      } else {
        // For other issues, get simple fix suggestions
        const fixSuggestions = await generateFixSuggestions(issue, filePath);

        // Ensure we have default suggestions if none were returned
        const possibleFixes =
          fixSuggestions && fixSuggestions.length > 0
            ? fixSuggestions
            : [
                {
                  action: "MANUAL_FIX",
                  description: "Manual fix required",
                  confidence: 0.5,
                  title: `Fix ${issue.ruleId} issue manually`,
                },
              ];

        suggestions.push({
          line: issue.line,
          column: issue.column,
          ruleId: issue.ruleId,
          message: issue.message,
          possibleFixes: possibleFixes,
          severity: issue.severity,
          code: issue.code,
        });
      }
    }

    return {
      success: true,
      filePath,
      suggestions,
      issueCount: issues.length,
    };
  } catch (error) {
    return {
      success: false,
      filePath,
      error: error.message,
      suggestions: [],
    };
  }
}

/**
 * Apply a fix to a file
 * @param {string} filePath - Path to the file
 * @param {string} fileContent - Current content of the file
 * @param {Object} issue - Issue to fix
 * @param {Object} fixDetails - Details of the fix to apply
 * @returns {Promise<Object>} - Updated content and status
 */
export async function applyFix(filePath, fileContent, issue, fixDetails) {
  try {
    const projectContext = await getProjectContext();

    // Make sure the context is initialized
    if (!projectContext.initialized) {
      await projectContext.initialize();
    }

    // Import fix application utilities
    const { applySpecificFix } = await import("./simple-fixes.js");

    // Apply the fix
    const updatedContent = await applySpecificFix(
      fileContent,
      issue,
      fixDetails,
      filePath
    );

    // Record the fix
    projectContext.recordFix(filePath, issue, fixDetails.action, {
      original: issue.message,
      fixType: fixDetails.action,
      confidence: fixDetails.confidence || 0.8,
    });

    // Track usage for monetization
    projectContext.trackUsage("fix", {
      filePath,
      ruleId: issue.ruleId,
      fixType: fixDetails.action,
    });

    return {
      success: true,
      filePath,
      originalContent: fileContent,
      updatedContent,
      fixDetails,
    };
  } catch (error) {
    return {
      success: false,
      filePath,
      error: error.message,
    };
  }
}

/**
 * Get project context information for the IDE
 * @returns {Promise<Object>} - Project context information
 */
export async function getProjectInfo() {
  try {
    const projectContext = await getProjectContext();

    // Make sure the context is initialized
    if (!projectContext.initialized) {
      await projectContext.initialize();
    }

    // Get project statistics
    const stats = projectContext.getStats();

    // Get license info
    const licenseInfo = projectContext.checkLicense();

    return {
      success: true,
      stats,
      license: licenseInfo,
      config: {
        // Only return non-sensitive config
        TARGET_DIR: config.TARGET_DIR,
        INTERACTIVE: config.INTERACTIVE,
        BATCH_MODE: config.BATCH_MODE,
        SHOW_PREVIEW: config.SHOW_PREVIEW,
        USE_AI_FOR_UNUSED_VARS: config.USE_AI_FOR_UNUSED_VARS,
        CROSS_FILE_ANALYSIS: config.CROSS_FILE_ANALYSIS,
        PARALLEL: config.PARALLEL,
        PREMIUM_FEATURES: config.PREMIUM_FEATURES,
        TEAM_FEATURES: config.TEAM_FEATURES,
        CURRENT_TEAM_PROFILE: config.CURRENT_TEAM_PROFILE,
      },
      languagesSupported: Array.from(projectContext.languageSupport),
      teamProfiles: Array.from(projectContext.teamProfiles.entries()).map(
        ([id, profile]) => ({
          id,
          name: profile.name,
          updated: profile.updated,
        })
      ),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get cross-file impact for a specific file
 * @param {string} filePath - Path to the file
 * @returns {Promise<Object>} - Impact analysis
 */
export async function getCrossFileImpact(filePath) {
  try {
    if (!config.CROSS_FILE_ANALYSIS) {
      return {
        success: false,
        error: "Cross-file analysis is disabled",
      };
    }

    const projectContext = await getProjectContext();

    // Make sure the context is initialized
    if (!projectContext.initialized) {
      await projectContext.initialize();
    }

    // Get affected files
    const affectedFiles = projectContext.getAffectedFiles(filePath);

    // Track usage for monetization
    projectContext.trackUsage("cross_file_analysis", {
      filePath,
      affectedCount: affectedFiles.length,
    });

    return {
      success: true,
      filePath,
      affectedFiles,
      dependencyCount: (projectContext.dependencies.get(filePath) || []).length,
      reverseDependencyCount: (
        projectContext.reverseDependencies.get(filePath) || []
      ).length,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generate metrics and ROI data for reporting
 * @returns {Promise<Object>} - Metrics and ROI data
 */
export async function generateMetricsReport() {
  try {
    const projectContext = await getProjectContext();

    // Make sure the context is initialized
    if (!projectContext.initialized) {
      await projectContext.initialize();
    }

    // Get general stats
    const stats = projectContext.getStats();

    // Calculate time saved
    // Assume 5 minutes saved per fix
    const timePerFix = 5; // minutes
    const totalFixCount = projectContext.fixHistory.length;
    const timeSavedMinutes = totalFixCount * timePerFix;

    // Group fixes by type
    const fixesByType = {};
    projectContext.fixHistory.forEach((fix) => {
      const type = fix.fixType || "unknown";
      fixesByType[type] = (fixesByType[type] || 0) + 1;
    });

    // Group by file extension
    const fixesByExtension = {};
    projectContext.fixHistory.forEach((fix) => {
      const ext = path.extname(fix.filePath).toLowerCase();
      fixesByExtension[ext] = (fixesByExtension[ext] || 0) + 1;
    });

    // Track usage for monetization
    projectContext.trackUsage("generate_report", {
      fixCount: totalFixCount,
      timeSavedMinutes,
    });

    return {
      success: true,
      stats,
      roi: {
        totalFixes: totalFixCount,
        timeSavedMinutes,
        timeSavedFormatted: `${Math.floor(timeSavedMinutes / 60)}h ${
          timeSavedMinutes % 60
        }m`,
        avgTimePerFile:
          totalFixCount > 0
            ? stats.processingStats.totalTimeMs / totalFixCount
            : 0,
        fixesByType,
        fixesByExtension,
      },
      aiMetrics: {
        totalAnalyses: stats.decisionStats.totalDecisions,
        averageConfidence: stats.decisionStats.averageConfidence,
        byType: stats.decisionStats.byType,
        byAction: stats.decisionStats.byAction,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Handle VSCode extension specific integration
 * The VSCode extension would call this to register commands and hooks
 */
export function registerVSCodeIntegration(vscode, context) {
  // This function would be called from the VSCode extension's activate function
  // It would register commands and hooks to integrate with the VS Code API

  console.log("VSCode integration registered");

  // This is just a placeholder - actual implementation would depend on
  // the VSCode API and extension requirements

  return {
    commands: {
      analyzeCurrentFile: async () => {
        // Implementation would use VSCode APIs
      },
      applyFix: async () => {
        // Implementation would use VSCode APIs
      },
      showReport: async () => {
        // Implementation would use VSCode APIs
      },
    },
  };
}

/**
 * Create a VS Code extension manifest for this tool
 * This can be used to generate a package.json for a VS Code extension
 */
export function generateVSCodeExtensionManifest() {
  return {
    name: "hybrid-linter",
    displayName: "Hybrid Linter",
    description: "AI-powered TypeScript & JavaScript linting and fixing",
    version: "1.0.0",
    publisher: "hybrid-linter",
    engines: {
      vscode: "^1.60.0",
    },
    categories: ["Linters", "Programming Languages", "Other"],
    activationEvents: [
      "onLanguage:typescript",
      "onLanguage:javascript",
      "onLanguage:typescriptreact",
      "onLanguage:javascriptreact",
    ],
    main: "./extension.js",
    contributes: {
      commands: [
        {
          command: "hybrid-linter.analyzeFile",
          title: "Hybrid Linter: Analyze Current File",
        },
        {
          command: "hybrid-linter.fixAll",
          title: "Hybrid Linter: Fix All Issues",
        },
        {
          command: "hybrid-linter.showReport",
          title: "Hybrid Linter: Show Report",
        },
      ],
      configuration: {
        title: "Hybrid Linter",
        properties: {
          "hybrid-linter.useAI": {
            type: "boolean",
            default: true,
            description: "Use AI for advanced analysis",
          },
          "hybrid-linter.crossFileAnalysis": {
            type: "boolean",
            default: true,
            description: "Enable cross-file dependency analysis",
          },
        },
      },
    },
  };
}
