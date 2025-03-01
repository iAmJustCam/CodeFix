// mock-ai-responses.js
/**
 * This file provides mock responses for AI analysis in testing environments
 */

/**
 * Mock responses for cross-module analysis based on the prompt content
 * @param {string} prompt - The prompt sent to the AI
 * @returns {string} - A mock response
 */
export function getMockCrossModuleResponse(prompt) {
  // Check what type of issue we're dealing with
  if (prompt.includes("userService") && prompt.includes("userController")) {
    // Variable renamed across modules
    return JSON.stringify({
      analysisType: "REFACTOR_ISSUE",
      confidence: 0.92,
      explanation:
        "The variable 'userData' in userController.ts is not actually unused. The issue is that in userService.ts, the parameter name was changed from 'userData' to 'userInfo' during refactoring, but the variable in userController.ts was not updated.",
      rootCause: "Parameter name mismatch after refactoring",
      recommendation: {
        actionType: "UPDATE_USAGE",
        details:
          "Either pass userData as the second parameter in updateUserInfo() call, or rename the variable to match the parameter name in updateUserInfo function.",
      },
      possibleActions: [
        {
          action: "UPDATE_USAGE",
          description:
            "Update the function call to use the userData variable: return updateUserInfo(userId, userData);",
          confidence: 0.95,
        },
        {
          action: "RENAME",
          description:
            "Rename variable to match the parameter name: const userInfo = getUserData(userId);",
          confidence: 0.9,
        },
        {
          action: "PREFIX",
          description:
            "Add underscore prefix if intentionally unused: const _userData = getUserData(userId);",
          confidence: 0.3,
        },
      ],
    });
  } else if (prompt.includes("configUtils") && prompt.includes("app.ts")) {
    // Parameter name change
    return JSON.stringify({
      analysisType: "PARAMETER_MISMATCH",
      confidence: 0.89,
      explanation:
        "The variable 'options' in app.ts is created but never used because the parameter name in the initializeApp() function was changed from 'options' to 'config' during refactoring.",
      rootCause:
        "The parameter name in initializeApp() was changed from 'options' to 'config'",
      recommendation: {
        actionType: "UPDATE_FUNCTION_CALL",
        details:
          "Change the function call to use the 'options' variable: const app = initializeApp(options);",
      },
      possibleActions: [
        {
          action: "UPDATE_FUNCTION_CALL",
          description:
            "Change the function call to use the 'options' variable: const app = initializeApp(options);",
          confidence: 0.95,
        },
        {
          action: "RENAME_VAR",
          description:
            "Rename the variable to match the parameter: const config = { debug: true, logLevel: 'info' };",
          confidence: 0.88,
        },
        {
          action: "PREFIX",
          description:
            "Add underscore prefix if intentionally unused: const _options = { debug: true, logLevel: 'info' };",
          confidence: 0.25,
        },
      ],
    });
  } else if (prompt.includes("types.ts") && prompt.includes("component.tsx")) {
    // Type definition change
    return JSON.stringify({
      analysisType: "TYPE_DEFINITION_MISMATCH",
      confidence: 0.95,
      explanation:
        "The 'description' property extracted in the component is unused because the property name was changed to 'content' in the CardProps interface in types.ts during refactoring.",
      rootCause: "Property renamed in interface but not updated in component",
      recommendation: {
        actionType: "UPDATE_USAGE",
        details:
          "Change the destructuring to use 'content' instead of 'description': const { title, content, imageUrl, onClick } = props;",
      },
      possibleActions: [
        {
          action: "UPDATE_DESTRUCTURING",
          description:
            "Change the destructuring to use 'content' instead of 'description': const { title, content, imageUrl, onClick } = props;",
          confidence: 0.95,
        },
        {
          action: "UPDATE_JSX",
          description: "Change JSX to reference content: <p>{content}</p>",
          confidence: 0.9,
        },
        {
          action: "UPDATE_INTERFACE",
          description:
            "Change the interface to include description: export interface CardProps { title: string; content: string; description?: string; imageUrl?: string; onClick?: () => void; }",
          confidence: 0.4,
        },
        {
          action: "PREFIX",
          description:
            "Add underscore prefix if intentionally unused: const { title, _description, imageUrl, onClick } = props;",
          confidence: 0.2,
        },
      ],
    });
  } else if (
    prompt.includes("analyzeUnusedVariable") ||
    prompt.includes("analyze this unused variable")
  ) {
    // For variable analysis prompts
    return JSON.stringify({
      analysisType: "TYPO",
      confidence: 0.85,
      explanation:
        "This variable appears to be a typo of a similar variable used elsewhere",
      reasoning: [
        "The variable name is very similar to other variables in the codebase",
        "The file has recently been refactored according to git history",
        "There's a pattern of variable renaming in recent commits",
      ],
      recommendedAction: "RENAME",
      possibleActions: [
        {
          action: "RENAME",
          description: "Rename to similar variable",
          confidence: 0.85,
        },
        {
          action: "PREFIX",
          description: "Add underscore prefix",
          confidence: 0.5,
        },
        {
          action: "REMOVE",
          description: "Remove the variable",
          confidence: 0.3,
        },
      ],
    });
  } else if (prompt.includes("Fix the following ESLint issues")) {
    // Return fixed code (just return original code since this is a mock)
    const codeMatch = prompt.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    if (codeMatch && codeMatch[1]) {
      // For testing, prefix all unused variables with underscore
      let fixedCode = codeMatch[1];
      if (prompt.includes("no-unused-vars")) {
        fixedCode = fixedCode.replace(
          /\b(const|let|var)\s+([a-zA-Z0-9_]+)/g,
          "$1 _$2"
        );
      }
      return fixedCode;
    }
    return "// Mock fixed code";
  } else {
    // Default case - simple mock response
    return JSON.stringify({
      analysisType: "GENUINE_UNUSED",
      confidence: 0.75,
      explanation:
        "Based on the analysis, this appears to be a genuinely unused variable rather than a cross-module issue.",
      rootCause: "Variable is declared but not used",
      recommendation: {
        actionType: "PREFIX",
        details:
          "Add an underscore prefix to indicate intentionally unused variable",
      },
      possibleActions: [
        {
          action: "PREFIX",
          description:
            "Add underscore prefix to indicate intentionally unused variable",
          confidence: 0.85,
        },
        {
          action: "REMOVE",
          description: "Remove the unused variable completely",
          confidence: 0.7,
        },
      ],
    });
  }
}

/**
 * Determine if a prompt is requesting JSON response
 * @param {string} prompt - The prompt text
 * @returns {boolean} - Whether JSON is expected
 */
export function isJsonExpected(prompt) {
  // Common patterns that indicate JSON is expected
  return (
    prompt.includes("format your response as JSON") ||
    prompt.includes("return JSON") ||
    prompt.includes("JSON format") ||
    prompt.includes("JSON structure") ||
    prompt.includes("JSON with the following") ||
    prompt.includes("response in JSON")
  );
}

/**
 * Enhanced mock AI response handler
 * @param {string} prompt - The prompt sent to the AI
 * @param {string} model - The model being used (for context)
 * @returns {string} - A mock response
 */
export function getEnhancedMockResponse(prompt, model = "gpt-3.5-turbo") {
  // Determine if JSON response is expected
  const jsonExpected = isJsonExpected(prompt);

  if (jsonExpected) {
    return getMockCrossModuleResponse(prompt);
  }

  // For non-JSON prompts, provide a simple text response
  if (prompt.includes("unused variable") || prompt.includes("no-unused-vars")) {
    return `
I've analyzed the unused variable and here are my findings:

This appears to be a genuine unused variable rather than a refactoring issue.
The variable is declared but never referenced elsewhere in the code.

Recommended actions:
1. Add an underscore prefix to indicate it's intentionally unused
2. Remove the variable if it's not needed
3. Use the variable in your code if it was meant to be used

Adding an underscore prefix is the simplest solution and follows common TypeScript conventions.
`;
  }

  // Default response for any other prompt
  return "Mock AI response for testing";
}

export default {
  getMockCrossModuleResponse,
  getEnhancedMockResponse,
  isJsonExpected,
};
