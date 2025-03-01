// vscode-extension.js
/**
 * VS Code Extension for Hybrid Linter
 * This file would be used as part of a VS Code extension package
 */

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

// Import core functionality from the hybrid linter
let hybridLinter;

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context - Extension context
 */
async function activate(context) {
  console.log("Hybrid Linter extension is now active");

  try {
    // Dynamically import the IDE integration module
    const extensionPath = context.extensionPath;
    const hybridLinterPath = path.join(
      extensionPath,
      "node_modules",
      "hybrid-linter"
    );

    // Attempt to load from node_modules first
    try {
      hybridLinter = require(path.join(hybridLinterPath, "ide-integration.js"));
    } catch (e) {
      // If not found in node_modules, try to load from extension root
      hybridLinter = require(path.join(extensionPath, "ide-integration.js"));
    }

    // Initialize the linter with VS Code-specific config
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceFolder) {
      vscode.window.showWarningMessage(
        "Hybrid Linter requires an open workspace to function."
      );
      return;
    }

    // Get extension settings
    const config = vscode.workspace.getConfiguration("hybridLinter");

    // Initialize the linter engine
    const initResult = await hybridLinter.initializeForIDE({
      TARGET_DIR: workspaceFolder,
      USE_AI_FOR_UNUSED_VARS: config.get("useAI", true),
      CROSS_FILE_ANALYSIS: config.get("crossFileAnalysis", true),
      INTERACTIVE: true,
      SHOW_PREVIEW: true,
      LICENSE_KEY: config.get("licenseKey", ""),
      USER_ID: config.get("userId", `vscode-user-${Date.now()}`),
    });

    if (!initResult.initialized) {
      vscode.window.showErrorMessage(
        `Failed to initialize Hybrid Linter: ${initResult.error}`
      );
      return;
    }

    // Display license information
    if (initResult.licenseStatus.valid) {
      console.log(`Hybrid Linter: Using ${initResult.licenseStatus.plan} plan`);

      if (initResult.licenseStatus.plan !== "free") {
        vscode.window.showInformationMessage(
          `Hybrid Linter: ${initResult.licenseStatus.plan} features activated`
        );
      }
    } else {
      vscode.window.showWarningMessage(
        "Hybrid Linter: Using free plan (limited features available)"
      );
    }

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "hybridLinter.analyzeFile",
        analyzeCurrentFile
      ),
      vscode.commands.registerCommand("hybridLinter.fixAll", fixAllIssues),
      vscode.commands.registerCommand("hybridLinter.showReport", showDashboard),
      vscode.commands.registerCommand(
        "hybridLinter.showCrossFileImpact",
        showCrossFileImpact
      )
    );

    // Register code actions provider
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        ["typescript", "javascript", "typescriptreact", "javascriptreact"],
        new HybridLinterActionProvider(),
        {
          providedCodeActionKinds: [
            vscode.CodeActionKind.QuickFix,
            vscode.CodeActionKind.Refactor,
          ],
        }
      )
    );

    // Register diagnostic collection
    const diagnosticCollection =
      vscode.languages.createDiagnosticCollection("hybridLinter");
    context.subscriptions.push(diagnosticCollection);

    // Set up file watcher for TS/JS files
    const fileWatcher = vscode.workspace.createFileSystemWatcher(
      "**/*.{ts,tsx,js,jsx}",
      false, // Don't ignore creates
      false, // Don't ignore changes
      false // Don't ignore deletes
    );

    fileWatcher.onDidChange(async (uri) => {
      await analyzeFile(uri, diagnosticCollection);
    });

    fileWatcher.onDidCreate(async (uri) => {
      await analyzeFile(uri, diagnosticCollection);
    });

    context.subscriptions.push(fileWatcher);

    // Analyze open files on startup
    if (vscode.window.activeTextEditor) {
      await analyzeFile(
        vscode.window.activeTextEditor.document.uri,
        diagnosticCollection
      );
    }

    // When editor changes, analyze the new file
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor) {
        await analyzeFile(editor.document.uri, diagnosticCollection);
      }
    });

    // Create status bar item
    const statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    statusBarItem.text = "$(search) Hybrid Linter";
    statusBarItem.tooltip = "Click to analyze current file";
    statusBarItem.command = "hybridLinter.analyzeFile";
    statusBarItem.show();

    context.subscriptions.push(statusBarItem);

    console.log("Hybrid Linter: Extension initialized successfully");
  } catch (error) {
    vscode.window.showErrorMessage(
      `Hybrid Linter: Initialization error: ${error.message}`
    );
    console.error("Hybrid Linter: Initialization error:", error);
  }
}

/**
 * Analyze the current file and show diagnostics
 */
async function analyzeCurrentFile() {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showInformationMessage("No active editor found");
    return;
  }

  const document = editor.document;

  // Only analyze TypeScript/JavaScript files
  if (
    ![
      "typescript",
      "javascript",
      "typescriptreact",
      "javascriptreact",
    ].includes(document.languageId)
  ) {
    vscode.window.showInformationMessage(
      "Hybrid Linter only works with TypeScript and JavaScript files"
    );
    return;
  }

  // Show progress indicator
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Hybrid Linter",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "Analyzing current file..." });

      try {
        const filePath = document.uri.fsPath;
        const fileContent = document.getText();

        // Get suggestions for the file
        const result = await hybridLinter.getSuggestedFixes(
          filePath,
          fileContent
        );

        if (!result.success && result.error) {
          vscode.window.showErrorMessage(`Analysis failed: ${result.error}`);
          return;
        }

        // Create diagnostics collection for this file
        const diagnosticCollection =
          vscode.languages.createDiagnosticCollection("hybridLinter");

        // Convert issues to diagnostics
        const diagnostics = result.suggestions.map((suggestion) => {
          // Create a diagnostic
          const range = new vscode.Range(
            new vscode.Position(suggestion.line - 1, suggestion.column - 1),
            new vscode.Position(suggestion.line - 1, suggestion.column + 20) // Approximate end
          );

          const diagnostic = new vscode.Diagnostic(
            range,
            suggestion.message,
            suggestion.severity === 2
              ? vscode.DiagnosticSeverity.Error
              : vscode.DiagnosticSeverity.Warning
          );

          // Add metadata for code actions
          diagnostic.code = suggestion.ruleId;
          diagnostic.source = "Hybrid Linter";

          // Store fix suggestions in diagnostic
          diagnostic.suggestions = suggestion.possibleFixes;
          if (suggestion.analysisType) {
            diagnostic.aiAnalysis = {
              type: suggestion.analysisType,
              confidence: suggestion.confidence,
              explanation: suggestion.explanation,
            };
          }

          return diagnostic;
        });

        // Set diagnostics for this file
        diagnosticCollection.set(document.uri, diagnostics);

        // Show success message
        if (diagnostics.length > 0) {
          vscode.window.showInformationMessage(
            `Found ${diagnostics.length} issues in ${path.basename(filePath)}`
          );
        } else {
          vscode.window.showInformationMessage(
            `No issues found in ${path.basename(filePath)}`
          );
        }

        return diagnostics;
      } catch (error) {
        vscode.window.showErrorMessage(`Analysis error: ${error.message}`);
        console.error("Analysis error:", error);
      }
    }
  );
}

/**
 * Analyze a specific file
 */
async function analyzeFile(uri, diagnosticCollection) {
  try {
    const document = await vscode.workspace.openTextDocument(uri);

    // Only analyze TypeScript/JavaScript files
    if (
      ![
        "typescript",
        "javascript",
        "typescriptreact",
        "javascriptreact",
      ].includes(document.languageId)
    ) {
      return;
    }

    const filePath = uri.fsPath;
    const fileContent = document.getText();

    // Get suggestions for the file
    const result = await hybridLinter.getSuggestedFixes(filePath, fileContent);

    if (!result.success && result.error) {
      console.error(`Analysis failed for ${filePath}: ${result.error}`);
      return;
    }

    // Convert issues to diagnostics
    const diagnostics = result.suggestions.map((suggestion) => {
      // Create diagnostic with appropriate range
      const range = new vscode.Range(
        new vscode.Position(suggestion.line - 1, suggestion.column - 1),
        new vscode.Position(suggestion.line - 1, suggestion.column + 20)
      );

      const diagnostic = new vscode.Diagnostic(
        range,
        suggestion.message,
        suggestion.severity === 2
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning
      );

      // Add metadata for code actions
      diagnostic.code = suggestion.ruleId;
      diagnostic.source = "Hybrid Linter";
      diagnostic.suggestions = suggestion.possibleFixes;

      if (suggestion.analysisType) {
        diagnostic.aiAnalysis = {
          type: suggestion.analysisType,
          confidence: suggestion.confidence,
          explanation: suggestion.explanation,
        };
      }

      return diagnostic;
    });

    // Set diagnostics for this file
    diagnosticCollection.set(uri, diagnostics);
  } catch (error) {
    console.error(`Error analyzing ${uri.fsPath}:`, error);
  }
}

/**
 * Fix all issues in current file
 */
async function fixAllIssues() {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showInformationMessage("No active editor found");
    return;
  }

  const document = editor.document;

  // Only fix TypeScript/JavaScript files
  if (
    ![
      "typescript",
      "javascript",
      "typescriptreact",
      "javascriptreact",
    ].includes(document.languageId)
  ) {
    vscode.window.showInformationMessage(
      "Hybrid Linter only works with TypeScript and JavaScript files"
    );
    return;
  }

  // Show progress indicator
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Hybrid Linter",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "Fixing issues..." });

      try {
        const filePath = document.uri.fsPath;
        const fileContent = document.getText();

        // Get suggestions for the file
        const result = await hybridLinter.getSuggestedFixes(
          filePath,
          fileContent
        );

        if (!result.success && result.error) {
          vscode.window.showErrorMessage(`Analysis failed: ${result.error}`);
          return;
        }

        if (result.suggestions.length === 0) {
          vscode.window.showInformationMessage("No issues to fix in this file");
          return;
        }

        // Apply fixes one by one
        let updatedContent = fileContent;
        let fixCount = 0;

        for (const suggestion of result.suggestions) {
          // Get highest confidence fix for each issue
          const bestFix = suggestion.possibleFixes.sort(
            (a, b) => b.confidence - a.confidence
          )[0];

          if (bestFix) {
            // Apply the fix
            const fixResult = await hybridLinter.applyFix(
              filePath,
              updatedContent,
              suggestion,
              bestFix
            );

            if (fixResult.success) {
              updatedContent = fixResult.updatedContent;
              fixCount++;
            }
          }
        }

        // Update the document if fixes were applied
        if (fixCount > 0) {
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            updatedContent
          );

          await vscode.workspace.applyEdit(edit);

          // Save the document
          await document.save();

          // Show success message
          vscode.window.showInformationMessage(
            `Fixed ${fixCount} issues in ${path.basename(filePath)}`
          );

          // Re-analyze file to update diagnostics
          const diagnosticCollection =
            vscode.languages.getDiagnostics("hybridLinter");
          await analyzeFile(document.uri, diagnosticCollection);
        } else {
          vscode.window.showInformationMessage(
            `No issues could be automatically fixed in ${path.basename(
              filePath
            )}`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Fix error: ${error.message}`);
        console.error("Fix error:", error);
      }
    }
  );
}

/**
 * Show cross-file impact analysis for current file
 */
async function showCrossFileImpact() {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showInformationMessage("No active editor found");
    return;
  }

  const document = editor.document;

  // Only work with TypeScript/JavaScript files
  if (
    ![
      "typescript",
      "javascript",
      "typescriptreact",
      "javascriptreact",
    ].includes(document.languageId)
  ) {
    vscode.window.showInformationMessage(
      "Cross-file analysis only works with TypeScript and JavaScript files"
    );
    return;
  }

  // Show progress indicator
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Hybrid Linter",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "Analyzing cross-file impact..." });

      try {
        const filePath = document.uri.fsPath;

        // Get cross-file impact
        const result = await hybridLinter.getCrossFileImpact(filePath);

        if (!result.success) {
          if (result.error === "Cross-file analysis is disabled") {
            vscode.window.showWarningMessage(
              "Cross-file analysis requires the Pro plan. Upgrade to unlock this feature."
            );
          } else {
            vscode.window.showErrorMessage(`Analysis failed: ${result.error}`);
          }
          return;
        }

        if (result.affectedFiles.length === 0) {
          vscode.window.showInformationMessage(
            `No files are affected by changes to ${path.basename(filePath)}`
          );
          return;
        }

        // Show impact in a tree view
        const panel = vscode.window.createWebviewPanel(
          "hybridLinter.crossFileImpact",
          "Cross-File Impact Analysis",
          vscode.ViewColumn.Beside,
          {
            enableScripts: true,
            localResourceRoots: [
              vscode.Uri.file(path.join(context.extensionPath, "media")),
            ],
          }
        );

        // Generate HTML content for the webview
        panel.webview.html = generateCrossFileImpactHTML(
          filePath,
          result.affectedFiles
        );

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage((message) => {
          if (message.command === "openFile") {
            const openPath = message.filePath;
            vscode.workspace.openTextDocument(openPath).then((doc) => {
              vscode.window.showTextDocument(doc);
            });
          }
        });
      } catch (error) {
        vscode.window.showErrorMessage(`Analysis error: ${error.message}`);
        console.error("Analysis error:", error);
      }
    }
  );
}

/**
 * Generate HTML for cross-file impact panel
 */
function generateCrossFileImpactHTML(filePath, affectedFiles) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const relativeSourcePath = path.relative(workspaceFolder, filePath);

  const fileListItems = affectedFiles
    .map((file) => {
      const relativePath = path.relative(workspaceFolder, file.filePath);
      const impactScore = Math.round(file.impactScore * 100);
      const impactColor =
        impactScore > 80 ? "red" : impactScore > 50 ? "orange" : "green";

      return `
      <li class="file-item">
        <div class="file-header">
          <span class="file-name">${relativePath}</span>
          <span class="impact-score" style="background-color: ${impactColor}">${impactScore}%</span>
        </div>
        <div class="file-details">
          <p>Impact Path: ${file.impactPath
            .map((p) => path.basename(p))
            .join(" → ")}</p>
          ${
            file.sharedVariables.length > 0
              ? `<p>Shared Variables: ${file.sharedVariables.join(", ")}</p>`
              : ""
          }
          <button class="open-file-btn" data-path="${
            file.filePath
          }">Open File</button>
        </div>
      </li>
    `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cross-File Impact Analysis</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 20px;
    }
    h1 {
      color: var(--vscode-editor-foreground);
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    .source-file {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      padding: 8px 12px;
      margin-bottom: 20px;
      border-radius: 4px;
    }
    .file-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .file-item {
      border: 1px solid var(--vscode-panel-border);
      margin-bottom: 10px;
      border-radius: 4px;
      overflow: hidden;
    }
    .file-header {
      background-color: var(--vscode-editor-background);
      padding: 8px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .impact-score {
      border-radius: 12px;
      padding: 2px 8px;
      color: white;
      font-size: 0.8rem;
      font-weight: bold;
    }
    .file-details {
      padding: 10px 12px;
      background-color: var(--vscode-panel-background);
    }
    .file-details p {
      margin: 5px 0;
      font-size: 0.9rem;
    }
    .open-file-btn {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 12px;
      border-radius: 2px;
      cursor: pointer;
      font-size: 0.9rem;
      margin-top: 6px;
    }
    .open-file-btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .summary {
      margin-bottom: 20px;
      padding: 10px;
      background-color: var(--vscode-editor-infoBackground);
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <h1>Cross-File Impact Analysis</h1>

  <div class="source-file">
    <strong>Source File:</strong> ${relativeSourcePath}
  </div>

  <div class="summary">
    <p><strong>${affectedFiles.length}</strong> files may be affected by changes to this file.</p>
  </div>

  <h2>Affected Files</h2>
  <ul class="file-list">
    ${fileListItems}
  </ul>

  <script>
    // Handle "Open File" button clicks
    document.querySelectorAll('.open-file-btn').forEach(button => {
      button.addEventListener('click', () => {
        const filePath = button.getAttribute('data-path');
        // Send message to extension
        vscode.postMessage({
          command: 'openFile',
          filePath
        });
      });
    });

    // VS Code API
    const vscode = acquireVsCodeApi();
  </script>
</body>
</html>`;
}

/**
 * Show metrics dashboard
 */
async function showDashboard() {
  // Show progress indicator
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Hybrid Linter",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "Generating dashboard..." });

      try {
        // Generate metrics report
        const report = await hybridLinter.generateMetricsReport();

        if (!report.success) {
          if (report.error === "Dashboard features require the Pro plan") {
            vscode.window.showWarningMessage(
              "Dashboard features require the Pro plan. Upgrade to unlock this feature."
            );
          } else {
            vscode.window.showErrorMessage(
              `Report generation failed: ${report.error}`
            );
          }
          return;
        }

        // Create webview panel for the dashboard
        const panel = vscode.window.createWebviewPanel(
          "hybridLinter.dashboard",
          "Hybrid Linter Dashboard",
          vscode.ViewColumn.Active,
          {
            enableScripts: true,
            localResourceRoots: [
              vscode.Uri.file(path.join(context.extensionPath, "media")),
            ],
          }
        );

        // Generate HTML content for the dashboard
        panel.webview.html = generateDashboardHTML(report);
      } catch (error) {
        vscode.window.showErrorMessage(`Dashboard error: ${error.message}`);
        console.error("Dashboard error:", error);
      }
    }
  );
}

/**
 * Generate HTML for the dashboard
 */
function generateDashboardHTML(report) {
  // This would be a more complex HTML template with charts and metrics
  // For now, we'll create a simple version
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hybrid Linter Dashboard</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 20px;
    }
    h1, h2 {
      color: var(--vscode-editor-foreground);
    }
    .card {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    .metric-item {
      padding: 16px;
      border-radius: 4px;
      background-color: var(--vscode-editor-background);
      text-align: center;
    }
    .metric-value {
      font-size: 2rem;
      font-weight: bold;
      margin-bottom: 8px;
      color: var(--vscode-inputOption-activeForeground);
    }
    .metric-label {
      font-size: 0.9rem;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <h1>Hybrid Linter Dashboard</h1>

  <div class="card">
    <h2>ROI Metrics</h2>
    <div class="metrics-grid">
      <div class="metric-item">
        <div class="metric-value">${report.roi.totalFixes}</div>
        <div class="metric-label">Total Fixes</div>
      </div>
      <div class="metric-item">
        <div class="metric-value">${report.roi.timeSavedFormatted}</div>
        <div class="metric-label">Time Saved</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Fix Types</h2>
    <div class="metrics-grid">
      ${Object.entries(report.fixesByType || {})
        .map(
          ([type, count]) => `
        <div class="metric-item">
          <div class="metric-value">${count}</div>
          <div class="metric-label">${type}</div>
        </div>
      `
        )
        .join("")}
    </div>
  </div>

  <div class="card">
    <h2>AI Analysis</h2>
    <div class="metrics-grid">
      ${Object.entries(report.aiMetrics.byType || {})
        .map(
          ([type, count]) => `
        <div class="metric-item">
          <div class="metric-value">${count}</div>
          <div class="metric-label">${type}</div>
        </div>
      `
        )
        .join("")}
    </div>
  </div>
</body>
</html>`;
}

/**
 * HybridLinterActionProvider class to provide code actions for diagnostics
 */
class HybridLinterActionProvider {
  provideCodeActions(document, range, context, token) {
    // Get all hybrid linter diagnostics
    const diagnostics = context.diagnostics.filter(
      (diagnostic) => diagnostic.source === "Hybrid Linter"
    );

    if (diagnostics.length === 0) {
      return [];
    }

    const actions = [];

    // Generate code actions for each diagnostic
    for (const diagnostic of diagnostics) {
      // Skip if no suggestions available
      if (!diagnostic.suggestions || diagnostic.suggestions.length === 0) {
        continue;
      }

      // Add each suggestion as a code action
      for (const suggestion of diagnostic.suggestions) {
        const action = new vscode.CodeAction(
          `${suggestion.title} (${Math.round(
            suggestion.confidence * 100
          )}% confident)`,
          vscode.CodeActionKind.QuickFix
        );

        action.diagnostics = [diagnostic];
        action.command = {
          command: "hybridLinter.applyFix",
          title: "Apply Fix",
          arguments: [document.uri, diagnostic, suggestion],
        };

        actions.push(action);
      }

      // If AI analysis is available, add an info action
      if (diagnostic.aiAnalysis) {
        const infoAction = new vscode.CodeAction(
          `AI Analysis: ${diagnostic.aiAnalysis.type}`,
          vscode.CodeActionKind.QuickFix
        );

        infoAction.diagnostics = [diagnostic];
        infoAction.isPreferred = false;
        infoAction.command = {
          command: "hybridLinter.showAIAnalysis",
          title: "Show AI Analysis",
          arguments: [diagnostic.aiAnalysis],
        };

        actions.push(infoAction);
      }
    }

    return actions;
  }
}

/**
 * Deactivate the extension
 */
function deactivate() {
  // Clean up any resources
}

module.exports = {
  activate,
  deactivate,
};
