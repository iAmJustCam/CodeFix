// ai-analyzer.js - Enhanced version to support cross-module analysis
import fs from "fs";
import path from "path";
import { getAIAnalysis } from "./ai-utils.js";
import { config } from "./state.js";

/**
 * Analyzes potential cross-module issues related to unused variables
 * @param {Object} context - Analysis context
 * @param {string} context.filePath - Path to the file with the issue
 * @param {string} context.varName - Name of the variable flagged as unused
 * @param {number} context.line - Line number where the issue occurs
 * @param {Object} context.projectContext - ProjectContext instance
 * @returns {Promise<Object>} - Analysis result
 */
export async function analyzeCrossModuleIssue(context) {
  const { filePath, varName, line, projectContext } = context;

  // Read the current file
  const fileContent = fs.readFileSync(filePath, "utf8");
  const fileDir = path.dirname(filePath);

  // Find imports in this file
  const fileInfo = projectContext.files.get(filePath);
  if (!fileInfo) return { analysisType: "UNKNOWN", confidence: 0 };

  // Get imported modules
  const imports = fileInfo.imports || [];

  // Find all dependencies for deeper analysis
  const dependencies = projectContext.dependencies.get(filePath) || [];

  // Find relevant related files (dependencies and reverse dependencies)
  const relatedFiles = [];

  // Add direct dependencies
  for (const depPath of dependencies) {
    if (fs.existsSync(depPath)) {
      relatedFiles.push({
        path: depPath,
        relationship: "imports from",
        content: fs.readFileSync(depPath, "utf8"),
      });
    }
  }

  // Add reverse dependencies (files that import this file)
  const reverseDependencies =
    projectContext.reverseDependencies.get(filePath) || [];
  for (const depPath of reverseDependencies) {
    if (fs.existsSync(depPath)) {
      relatedFiles.push({
        path: depPath,
        relationship: "imported by",
        content: fs.readFileSync(depPath, "utf8"),
      });
    }
  }

  // Limit to most relevant files (we don't want to overwhelm the model)
  const mostRelevantFiles = relatedFiles.slice(0, 3);

  // Build a prompt for AI analysis
  const prompt = `
I'm analyzing a potential cross-module issue in a TypeScript project.

File with the issue (${path.basename(filePath)}):
\`\`\`typescript
${fileContent}
\`\`\`

The variable "${varName}" on line ${line} is flagged as unused by ESLint.
However, this might be due to refactoring where variable names changed between modules.

Here are the related files that might help understand the issue:

${mostRelevantFiles
  .map(
    (file) => `
Related file (${path.basename(file.path)}) - This file ${
      file.relationship
    } the file with the issue:
\`\`\`typescript
${file.content}
\`\`\`
`
  )
  .join("\n")}

Based on your analysis of these files:
1. Is "${varName}" genuinely unused or is it related to a cross-module refactoring issue?
2. If it's a refactoring issue, what specific changes would fix the problem?
3. What is the root cause of this issue?

Please format your response as JSON with the following structure:
{
  "analysisType": "REFACTOR_ISSUE", "GENUINE_UNUSED", "TYPE_MISMATCH", "PARAMETER_CHANGE", or "UNKNOWN",
  "confidence": (number between 0-1),
  "explanation": (string explanation),
  "rootCause": (brief description of the cause),
  "recommendation": {
    "actionType": "RENAME", "UPDATE_IMPORT", "UPDATE_USAGE", "REMOVE", or "OTHER",
    "details": (specific changes needed)
  },
  "possibleActions": [
    {
      "action": "ACTION_TYPE",
      "description": "Description of the action",
      "confidence": (number between 0-1)
    }
  ]
}
`;

  // Get analysis from AI
  try {
    const aiResponse = await getAIAnalysis(prompt, config.COMPLEX_MODEL);

    // Parse the JSON response
    try {
      const analysis = JSON.parse(aiResponse);
      return analysis;
    } catch (e) {
      console.error(
        "Failed to parse AI response as JSON:",
        aiResponse.substring(0, 100)
      );
      // If parsing fails, create a structured response based on the text
      return {
        analysisType: "PARSE_ERROR",
        confidence: 0.5,
        explanation: "Failed to parse AI response as JSON.",
        rootCause: "Response format error",
        recommendation: {
          actionType: "OTHER",
          details: aiResponse.substring(0, 500) + "...",
        },
        possibleActions: [
          {
            action: "PREFIX",
            description: "Add underscore prefix to indicate unused variable",
            confidence: 0.8,
          },
          {
            action: "MANUAL_REVIEW",
            description: "Manual review recommended due to parsing error",
            confidence: 0.7,
          },
        ],
      };
    }
  } catch (error) {
    console.error("Error getting AI analysis:", error);
    return {
      analysisType: "ERROR",
      confidence: 0,
      explanation: `Error during AI analysis: ${error.message}`,
      recommendation: {
        actionType: "MANUAL",
        details: "Manual review required due to analysis error",
      },
      possibleActions: [
        {
          action: "PREFIX",
          description: "Add underscore prefix to indicate unused variable",
          confidence: 0.8,
        },
      ],
    };
  }
}

/**
 * Analyze a variable to detect if it's unused due to refactoring issues
 * Enhanced version of the original analyzeVariable function
 */
export async function analyzeVariableWithCrossModuleAwareness(
  varName,
  filePath,
  issue,
  projectContext
) {
  // First, try the standard variable analysis
  const standardAnalysis = await projectContext.analyzeVariable(
    varName,
    filePath,
    issue,
    false // Don't use AI in the first pass
  );

  // If it's clearly a genuine unused variable with high confidence, return that
  if (
    standardAnalysis.analysisType === "GENUINE_UNUSED" &&
    standardAnalysis.confidence > 0.9
  ) {
    return standardAnalysis;
  }

  // Otherwise, do a deeper cross-module analysis
  const crossModuleAnalysis = await analyzeCrossModuleIssue({
    filePath,
    varName,
    line: issue.line,
    projectContext,
  });

  // If cross-module analysis found an issue, return that
  if (
    crossModuleAnalysis.confidence > 0.7 &&
    crossModuleAnalysis.analysisType !== "GENUINE_UNUSED" &&
    crossModuleAnalysis.analysisType !== "UNKNOWN"
  ) {
    // Convert to the format expected by the original API
    return {
      varName,
      filePath,
      analysisType: crossModuleAnalysis.analysisType,
      confidence: crossModuleAnalysis.confidence,
      explanation: crossModuleAnalysis.explanation,
      recommendedAction:
        crossModuleAnalysis.recommendation?.actionType || "UNKNOWN",
      reasoning: [crossModuleAnalysis.rootCause || "Unknown root cause"],
      possibleActions: crossModuleAnalysis.possibleActions || [
        {
          action: crossModuleAnalysis.recommendation?.actionType || "PREFIX",
          description:
            crossModuleAnalysis.recommendation?.details ||
            "Add underscore prefix",
          confidence: crossModuleAnalysis.confidence,
        },
        // Also include the standard recommended action as a fallback
        {
          action: standardAnalysis.recommendedAction,
          description: `Standard fix: ${standardAnalysis.explanation}`,
          confidence: standardAnalysis.confidence,
        },
      ],
    };
  }

  // If cross-module analysis didn't find anything conclusive,
  // fall back to the standard analysis
  return standardAnalysis;
}

export default {
  analyzeCrossModuleIssue,
  analyzeVariableWithCrossModuleAwareness,
};
