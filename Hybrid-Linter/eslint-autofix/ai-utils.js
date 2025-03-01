// ai-utils.js
import axios from "axios";
import chalk from "chalk";
import path from "path";
import { getEnhancedMockResponse } from "./mock-ai-responses.js";
import { config } from "./state.js";

// Cache for AI responses to reduce API calls
const responseCache = new Map();

/**
 * Get AI analysis for a specific prompt
 */
export async function getAIAnalysis(prompt, model = config.COMPLEX_MODEL) {
  // Generate a cache key based on prompt and model
  const cacheKey = `${model}:${Buffer.from(prompt)
    .toString("base64")
    .substring(0, 50)}`;

  // Check cache first
  if (responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey);
  }

  // Check if we're using mock responses for testing/development
  if (config.USE_MOCK_AI_FOR_TESTING) {
    const mockResponse = getEnhancedMockResponse(prompt, model);
    responseCache.set(cacheKey, mockResponse);
    return mockResponse;
  }

  // Track retry attempts
  let attempt = 0;
  const maxRetries = config.MAX_RETRIES || 3;

  while (attempt < maxRetries) {
    try {
      attempt++;
      if (config.VERBOSE && attempt > 1) {
        console.log(
          chalk.gray(`AI analysis retry attempt ${attempt}/${maxRetries}`)
        );
      }

      // Call appropriate API based on AI provider config
      let response;
      if (config.AI_PROVIDER === "azure") {
        response = await callAzureOpenAI(prompt, model);
      } else {
        response = await callOpenAI(prompt, model);
      }

      // Cache the response
      responseCache.set(cacheKey, response);

      // If cache is getting too large, remove oldest entries
      if (responseCache.size > 100) {
        const keysIterator = responseCache.keys();
        responseCache.delete(keysIterator.next().value);
      }

      return response;
    } catch (error) {
      if (error.response && error.response.status === 429) {
        // Rate limit error, apply exponential backoff
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        console.log(
          chalk.yellow(
            `Rate limit hit, waiting ${(delay / 1000).toFixed(
              1
            )}s before retry ${attempt}/${maxRetries}`
          )
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (attempt < maxRetries) {
        // Other error, retry with backoff
        const delay = 1000 * attempt;
        console.log(
          chalk.yellow(
            `AI API error: ${error.message}. Retrying in ${delay / 1000}s...`
          )
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Max retries exceeded
        console.error(
          chalk.red(
            `AI analysis failed after ${maxRetries} attempts: ${error.message}`
          )
        );
        throw error;
      }
    }
  }

  throw new Error(`Failed to get AI analysis after ${maxRetries} attempts`);
}

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt, model) {
  if (!config.OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert code analyzer focused on understanding variable usage, code patterns, and refactoring. Provide detailed analysis and precise recommendations.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
    },
    {
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.choices[0].message.content.trim();
}

/**
 * Call Azure OpenAI API
 */
async function callAzureOpenAI(prompt, model) {
  if (!config.AZURE_OPENAI_KEY || !config.AZURE_OPENAI_ENDPOINT) {
    throw new Error("Azure OpenAI configuration missing");
  }

  const deploymentId = config.AZURE_OPENAI_DEPLOYMENTS[model] || model;

  const response = await axios.post(
    `${config.AZURE_OPENAI_ENDPOINT}/openai/deployments/${deploymentId}/chat/completions?api-version=2023-05-15`,
    {
      messages: [
        {
          role: "system",
          content:
            "You are an expert code analyzer focused on understanding variable usage, code patterns, and refactoring. Provide detailed analysis and precise recommendations.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
    },
    {
      headers: {
        "api-key": config.AZURE_OPENAI_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.choices[0].message.content.trim();
}

/**
 * Get a fix for a file with issues
 */
export async function getAIFix(
  fileContent,
  issues,
  filePath,
  model = config.DEFAULT_MODEL
) {
  // Prepare the prompt for the model
  const extension = path.extname(filePath);
  const fileType = extension === ".tsx" ? "TypeScript React" : "TypeScript";

  // Format issues with code snippets for context
  const formattedIssues = formatIssuesWithContext(issues);

  // Get file dependencies and impact
  let dependencyContext = "";
  if (config.CROSS_FILE_ANALYSIS) {
    try {
      const projectContext = (
        await import("./project-context.js")
      ).getProjectContext();
      const context = await projectContext();

      // Get dependencies of this file
      const deps = context.dependencies.get(filePath) || [];
      const revDeps = context.reverseDependencies.get(filePath) || [];

      if (deps.length > 0 || revDeps.length > 0) {
        dependencyContext = `
File Dependencies:
- This file depends on ${deps.length} other files
- ${revDeps.length} files depend on this file

This information is provided to help you make safer changes that won't break dependencies.
`;
      }
    } catch (error) {
      // Continue without dependency context
    }
  }

  // Build a detailed prompt with context awareness
  const prompt = `Fix the following ESLint issues in this ${fileType} file.

File path: ${filePath}

File content:
\`\`\`${extension.slice(1)}
${fileContent}
\`\`\`

ESLint issues:
${formattedIssues}

${dependencyContext}

Please consider these guidelines:
1. Only fix the reported issues without changing unrelated code
2. Preserve existing coding style and formatting
3. Make minimal changes needed to fix the issues
4. If a fix requires renaming variables, make sure to update all references

Please return ONLY the fixed code with no explanations or markdown formatting. The entire file should be returned, not just the fixed parts.`;

  // Get fix from AI
  const fixResponse = await getAIAnalysis(prompt, model);

  // Extract code from response (handling potential formatting)
  const codeMatch =
    fixResponse.match(/```(?:\w+)?\s*([\s\S]*?)```/) ||
    fixResponse.match(/^[^`][\s\S]*$/);

  if (codeMatch) {
    return codeMatch[1] ? codeMatch[1].trim() : fixResponse.trim();
  }

  return fixResponse.trim();
}

/**
 * Format issues with code context for better fixes
 */
function formatIssuesWithContext(issues) {
  return issues
    .map((issue) => {
      const context = issue.code
        ? `\nCode context:
${issue.code
  .map(
    (line) =>
      `${line.lineNum === issue.line ? ">" : " "} ${line.lineNum}: ${line.text}`
  )
  .join("\n")}`
        : "";

      return `Line ${issue.line}${issue.column ? `:${issue.column}` : ""}: ${
        issue.message
      } (${issue.ruleId})${context}`;
    })
    .join("\n\n");
}
