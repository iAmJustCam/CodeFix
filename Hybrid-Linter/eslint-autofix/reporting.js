// reporting.js
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { config, results, stats } from "./state.js";

export function saveCheckpoint(currentChunk, totalChunks, remainingFiles) {
  fs.writeFileSync(
    "fix_checkpoint.json",
    JSON.stringify(
      {
        currentChunk,
        totalChunks,
        remainingFiles,
        stats,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

export function generateFinalReport() {
  // Calculate elapsed time
  // In reporting.js, find where elapsed time is calculated:
  const elapsedTime = Math.max(0, stats.endTime - stats.startTime);
  const seconds = Math.floor(elapsedTime / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const timeString =
    hours > 0
      ? `${hours}h ${minutes % 60}m ${seconds % 60}s`
      : minutes > 0
      ? `${minutes}m ${seconds % 60}s`
      : `${seconds}s`;

  // Generate HTML report
  const reportPath = path.join(config.OUTPUT_DIR, "linting-report.html");

  // Generate markdown for manual fixes
  let manualFixMd = "";

  if (
    results.unfixedFiles.length > 0 ||
    results.partiallyFixedFiles.length > 0
  ) {
    manualFixMd = "## Files Requiring Manual Attention\n\n";

    // Create a list of all files needing attention
    const attentionFiles = [
      ...results.unfixedFiles,
      ...results.partiallyFixedFiles,
    ];

    attentionFiles.forEach((filePath) => {
      const relativePath = path.relative(process.cwd(), filePath);
      manualFixMd += `### ${relativePath}\n\n`;

      const suggestions = results.suggestedActions.get(filePath) || [];

      if (suggestions.length > 0) {
        manualFixMd += "Remaining issues:\n\n";

        suggestions.forEach((suggestion) => {
          manualFixMd += `- **Line ${suggestion.line}**: ${suggestion.message} (${suggestion.rule})\n`;
          manualFixMd += `  - **Recommendation**: ${suggestion.recommendation}\n\n`;
        });
      } else {
        manualFixMd +=
          "Unknown issues remain. Run ESLint manually to check.\n\n";
      }
    });
  }

  // Create HTML content
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESLint Fix Report</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.5;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }
    h1, h2, h3 { color: #1a73e8; }
    .summary-card {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    }
    .stats-container {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin: 1rem 0;
    }
    .stat-item {
      background: white;
      border-radius: 6px;
      padding: 1rem;
      flex: 1;
      min-width: 200px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      margin: 0.5rem 0;
    }
    .stat-label {
      font-size: 0.9rem;
      color: #555;
      text-align: center;
    }
    .success-rate {
      font-size: 3rem;
      font-weight: 700;
      color: ${
        stats.fixedByESLint + stats.fixedByAI + stats.fixedBySimplePatterns ===
        stats.totalIssues
          ? "#34a853"
          : (stats.fixedByESLint +
              stats.fixedByAI +
              stats.fixedBySimplePatterns) /
              stats.totalIssues >
            0.7
          ? "#fbbc05"
          : "#ea4335"
      };
    }
    .progress-bar {
      width: 100%;
      background-color: #e0e0e0;
      border-radius: 4px;
      margin: 1rem 0;
    }
    .progress-fill {
      height: 20px;
      background-color: #34a853;
      border-radius: 4px;
      width: ${
        stats.totalIssues > 0
          ? Math.round(
              ((stats.fixedByESLint +
                stats.fixedByAI +
                stats.fixedBySimplePatterns) /
                stats.totalIssues) *
                100
            )
          : 0
      }%;
    }
    .file-list {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.05);
      margin-bottom: 2rem;
    }
    .file-list h3 {
      padding: 1rem;
      margin: 0;
      border-bottom: 1px solid #eee;
    }
    .file-list ul {
      list-style-type: none;
      padding: 0;
      margin: 0;
    }
    .file-list li {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #eee;
    }
    .file-list li:last-child {
      border-bottom: none;
    }
    .category-chart {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin: 1rem 0;
    }
    .category-bar {
      width: 100%;
      padding: 0.5rem 0;
      display: flex;
      align-items: center;
    }
    .category-name {
      width: 150px;
      text-align: right;
      padding-right: 1rem;
      font-weight: 500;
    }
    .category-value {
      flex: 1;
      background: #e0e0e0;
      border-radius: 4px;
      height: 20px;
      position: relative;
    }
    .category-fill {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      border-radius: 4px;
    }
    .category-number {
      margin-left: 0.5rem;
      font-weight: 500;
    }
    pre {
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }
    code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.9rem;
    }
    .recommendations h3 {
      color: #ea4335;
    }
    .recommendation-item {
      background: #fff;
      padding: 1rem;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 1rem;
    }
    .rule-name {
      font-family: monospace;
      background: #f5f5f5;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <h1>ESLint Auto-Fix Report</h1>
  <p>Generated on ${new Date().toLocaleString()}</p>

  <div class="summary-card">
    <h2>Summary</h2>
    <div class="stats-container">
      <div class="stat-item">
        <div class="stat-value">${stats.totalIssues}</div>
        <div class="stat-label">Total Issues</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${
          stats.fixedByESLint + stats.fixedByAI + stats.fixedBySimplePatterns
        }</div>
        <div class="stat-label">Fixed Issues</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.remainingIssues}</div>
        <div class="stat-label">Remaining Issues</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.filesWithIssues}</div>
        <div class="stat-label">Files Processed</div>
      </div>
    </div>

    <div style="text-align: center; margin: 2rem 0;">
      <div class="success-rate">${
        stats.totalIssues > 0
          ? Math.round(
              ((stats.fixedByESLint +
                stats.fixedByAI +
                stats.fixedBySimplePatterns) /
                stats.totalIssues) *
                100
            )
          : 100
      }%</div>
      <div style="font-size: 1.2rem; color: #555;">Success Rate</div>
    </div>

    <div class="progress-bar">
      <div class="progress-fill"></div>
    </div>

    <div style="display: flex; justify-content: space-between; color: #555; font-size: 0.9rem;">
      <div>Duration: ${timeString}</div>
      <div>Directory: ${config.TARGET_DIR}</div>
    </div>
  </div>

  <h2>Issues by Category</h2>
  <div class="category-chart">
    ${Object.entries(stats.errorsByCategory)
      .filter(([_, count]) => count > 0)
      .sort(([_, countA], [__, countB]) => countB - countA)
      .map(([category, count]) => {
        const percentage = Math.round((count / stats.totalIssues) * 100);
        const colors = {
          SYNTAX: "#ea4335",
          UNUSED: "#34a853",
          TYPE: "#4285f4",
          STYLE: "#fbbc05",
          IMPORT: "#db4437",
          BEST_PRACTICE: "#0f9d58",
          OTHER: "#757575",
        };
        return `
          <div class="category-bar">
            <div class="category-name">${category}</div>
            <div class="category-value">
              <div class="category-fill" style="width: ${percentage}%; background-color: ${
          colors[category] || "#757575"
        };"></div>
            </div>
            <div class="category-number">${count} (${percentage}%)</div>
          </div>
        `;
      })
      .join("")}
  </div>

  <div style="display: flex; flex-wrap: wrap; gap: 2rem;">
    <div style="flex: 1; min-width: 300px;">
      <div class="file-list">
        <h3>Successfully Fixed (${results.fixedFiles.length})</h3>
        <ul>
          ${
            results.fixedFiles.length > 0
              ? results.fixedFiles
                  .map(
                    (file) => `<li>${path.relative(process.cwd(), file)}</li>`
                  )
                  .join("")
              : '<li style="color: #757575;">No files completely fixed</li>'
          }
        </ul>
      </div>
    </div>

    <div style="flex: 1; min-width: 300px;">
      <div class="file-list">
        <h3>Partially Fixed (${results.partiallyFixedFiles.length})</h3>
        <ul>
          ${
            results.partiallyFixedFiles.length > 0
              ? results.partiallyFixedFiles
                  .map(
                    (file) => `<li>${path.relative(process.cwd(), file)}</li>`
                  )
                  .join("")
              : '<li style="color: #757575;">No partially fixed files</li>'
          }
        </ul>
      </div>
    </div>

    <div style="flex: 1; min-width: 300px;">
      <div class="file-list">
        <h3>Unfixed (${results.unfixedFiles.length})</h3>
        <ul>
          ${
            results.unfixedFiles.length > 0
              ? results.unfixedFiles
                  .map(
                    (file) => `<li>${path.relative(process.cwd(), file)}</li>`
                  )
                  .join("")
              : '<li style="color: #757575;">No unfixed files</li>'
          }
        </ul>
      </div>
    </div>
  </div>

  ${
    results.suggestedActions.size > 0
      ? `
  <div class="recommendations">
    <h2>Manual Fix Recommendations</h2>

    ${[...results.suggestedActions.entries()]
      .map(
        ([filePath, suggestions]) => `
      <h3>${path.relative(process.cwd(), filePath)}</h3>

      ${suggestions
        .map(
          (suggestion) => `
        <div class="recommendation-item">
          <p><strong>Line ${suggestion.line}:</strong> ${suggestion.message} <span class="rule-name">${suggestion.rule}</span></p>
          <p><strong>Recommendation:</strong> ${suggestion.recommendation}</p>
        </div>
      `
        )
        .join("")}
    `
      )
      .join("")}
  </div>
  `
      : ""
  }

  <h2>Fix Method Breakdown</h2>
  <div class="stats-container">
    <div class="stat-item">
      <div class="stat-value">${stats.fixedByESLint}</div>
      <div class="stat-label">Fixed by ESLint</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">${stats.fixedByAI}</div>
      <div class="stat-label">Fixed by AI</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">${stats.fixedBySimplePatterns}</div>
      <div class="stat-label">Fixed by Pattern Matching</div>
    </div>
  </div>

  <h2>Next Steps</h2>
  <div class="summary-card">
    <p>To address the remaining ${stats.remainingIssues} issues:</p>
    <ol>
      <li>Review the "Manual Fix Recommendations" section for guidance on specific issues</li>
      <li>Run ESLint manually on specific files to get more detailed feedback</li>
      <li>Consider adding ESLint rules to .eslintignore for valid exceptions</li>
      <li>Rerun this tool after making manual changes to fix any new issues introduced</li>
    </ol>
  </div>
</body>
</html>`;

  // Write HTML report
  fs.writeFileSync(reportPath, htmlContent);

  // Generate Markdown report
  const markdownPath = path.join(config.OUTPUT_DIR, "linting-report.md");

  const markdownContent = `# ESLint Auto-Fix Report

Generated on ${new Date().toLocaleString()}

## Summary

- **Total Issues:** ${stats.totalIssues}
- **Fixed Issues:** ${
    stats.fixedByESLint + stats.fixedByAI + stats.fixedBySimplePatterns
  }
- **Remaining Issues:** ${stats.remainingIssues}
- **Files Processed:** ${stats.filesWithIssues}
- **Success Rate:** ${
    stats.totalIssues > 0
      ? Math.round(
          ((stats.fixedByESLint +
            stats.fixedByAI +
            stats.fixedBySimplePatterns) /
            stats.totalIssues) *
            100
        )
      : 100
  }%
- **Duration:** ${timeString}
- **Directory:** ${config.TARGET_DIR}

## Fix Method Breakdown

- **Fixed by ESLint:** ${stats.fixedByESLint}
- **Fixed by AI:** ${stats.fixedByAI}
- **Fixed by Pattern Matching:** ${stats.fixedBySimplePatterns}

## Issues by Category

${Object.entries(stats.errorsByCategory)
  .filter(([_, count]) => count > 0)
  .sort(([_, countA], [__, countB]) => countB - countA)
  .map(([category, count]) => {
    const percentage = Math.round((count / stats.totalIssues) * 100);
    return `- **${category}:** ${count} (${percentage}%)`;
  })
  .join("\n")}

## File Status

### Successfully Fixed (${results.fixedFiles.length})

${
  results.fixedFiles.length > 0
    ? results.fixedFiles
        .map((file) => `- ${path.relative(process.cwd(), file)}`)
        .join("\n")
    : "No files completely fixed"
}

### Partially Fixed (${results.partiallyFixedFiles.length})

${
  results.partiallyFixedFiles.length > 0
    ? results.partiallyFixedFiles
        .map((file) => `- ${path.relative(process.cwd(), file)}`)
        .join("\n")
    : "No partially fixed files"
}

### Unfixed (${results.unfixedFiles.length})

${
  results.unfixedFiles.length > 0
    ? results.unfixedFiles
        .map((file) => `- ${path.relative(process.cwd(), file)}`)
        .join("\n")
    : "No unfixed files"
}

${manualFixMd}

## Next Steps

To address the remaining ${stats.remainingIssues} issues:

1. Review the "Manual Fix Recommendations" section for guidance on specific issues
2. Run ESLint manually on specific files to get more detailed feedback
3. Consider adding ESLint rules to .eslintignore for valid exceptions
4. Rerun this tool after making manual changes to fix any new issues introduced
`;

  fs.writeFileSync(markdownPath, markdownContent);

  // Show final message
  console.log("\n" + chalk.bold.green("✨ Fix process completed!"));
  console.log(chalk.bold(`📊 Final Report:`));
  console.log(`Total issues: ${chalk.bold(stats.totalIssues)}`);
  console.log(`Fixed by ESLint: ${chalk.bold(stats.fixedByESLint)}`);
  console.log(`Fixed by AI: ${chalk.bold(stats.fixedByAI)}`);
  console.log(
    `Fixed by Pattern Matching: ${chalk.bold(stats.fixedBySimplePatterns)}`
  );
  console.log(`Remaining issues: ${chalk.bold(stats.remainingIssues)}`);

  const successRate =
    stats.totalIssues > 0
      ? Math.round(
          ((stats.fixedByESLint +
            stats.fixedByAI +
            stats.fixedBySimplePatterns) /
            stats.totalIssues) *
            100
        )
      : 100;

  const successColor =
    successRate === 100
      ? chalk.green
      : successRate >= 70
      ? chalk.yellow
      : chalk.red;

  console.log(`Success rate: ${successColor(`${successRate}%`)}`);
  console.log(`Duration: ${chalk.bold(timeString)}`);

  console.log(chalk.bold("\n📋 Reports generated:"));
  console.log(
    `- HTML Report: ${chalk.blue(path.relative(process.cwd(), reportPath))}`
  );
  console.log(
    `- Markdown Report: ${chalk.blue(
      path.relative(process.cwd(), markdownPath)
    )}`
  );

  if (stats.remainingIssues > 0) {
    console.log(
      chalk.yellow(
        "\n⚠️ Some issues require manual attention. See the reports for details."
      )
    );
  } else {
    console.log(chalk.green("\n✅ All issues were fixed successfully!"));
  }
}
