// issue-categorizer.js
import chalk from "chalk";
import { config, stats } from "./state.js";

export function categorizeIssues(filesWithIssues) {
  // Reset counters
  Object.keys(stats.errorsByCategory).forEach((key) => {
    stats.errorsByCategory[key] = 0;
  });

  for (const file of filesWithIssues) {
    for (const issue of file.issues) {
      let categorized = false;

      // Categorize by rule ID
      for (const [category, rules] of Object.entries(config.ERROR_CATEGORIES)) {
        if (issue.ruleId && rules.some((rule) => issue.ruleId.includes(rule))) {
          stats.errorsByCategory[category]++;
          categorized = true;
          break;
        }
      }

      // Default to OTHER if not categorized
      if (!categorized) {
        stats.errorsByCategory.OTHER++;
      }
    }
  }
}

export function displayCategorySummary() {
  console.log(chalk.bold("\n📊 Issues by Category:"));

  // Get the total issues
  const total = Object.values(stats.errorsByCategory).reduce(
    (sum, count) => sum + count,
    0
  );

  // Display categories with issues
  Object.entries(stats.errorsByCategory)
    .filter(([_, count]) => count > 0)
    .sort(([_, countA], [__, countB]) => countB - countA)
    .forEach(([category, count]) => {
      const percentage = Math.round((count / total) * 100);
      const bar = "█".repeat(Math.floor(percentage / 5));
      console.log(
        `${chalk.cyan(category.padEnd(15))} ${chalk.yellow(count.toString().padStart(3))} ${chalk.gray(`(${percentage}%)`)} ${chalk.blue(bar)}`
      );
    });

  console.log(""); // Empty line for spacing
}

export function categorizeFileIssues(issues) {
  const categoryCounts = {
    SYNTAX: 0,
    UNUSED: 0,
    TYPE: 0,
    STYLE: 0,
    IMPORT: 0,
    BEST_PRACTICE: 0,
    OTHER: 0,
  };

  for (const issue of issues) {
    let categorized = false;

    for (const [category, rules] of Object.entries(config.ERROR_CATEGORIES)) {
      if (issue.ruleId && rules.some((rule) => issue.ruleId.includes(rule))) {
        categoryCounts[category]++;
        categorized = true;
        break;
      }
    }

    if (!categorized) {
      categoryCounts.OTHER++;
    }
  }

  return categoryCounts;
}

export function generateSuggestions(issues) {
  const suggestions = [];

  for (const issue of issues) {
    let suggestion = {
      rule: issue.ruleId,
      message: issue.message,
      line: issue.line,
      recommendation: "",
    };

    // Generate specific recommendations based on rule
    if (issue.ruleId === "@typescript-eslint/no-explicit-any") {
      suggestion.recommendation =
        'Replace "any" with a more specific type or "unknown". If unsure, consider using a type assertion or a generic type parameter.';
    } else if (issue.ruleId === "@typescript-eslint/no-unused-vars") {
      suggestion.recommendation =
        "Remove the unused variable or prefix it with an underscore (_) to indicate it's intentionally unused.";
    } else if (issue.ruleId?.includes("import")) {
      suggestion.recommendation =
        "Check import paths and make sure imported items are actually used. You may need to install missing dependencies.";
    } else if (
      issue.ruleId === "@typescript-eslint/explicit-module-boundary-types"
    ) {
      suggestion.recommendation =
        'Add explicit return type to functions exported from modules. Example: "function example(): ReturnType { ... }"';
    } else {
      // Generic suggestion
      suggestion.recommendation =
        "Consider reviewing the ESLint documentation for this rule for guidance.";
    }

    suggestions.push(suggestion);
  }

  return suggestions;
}
