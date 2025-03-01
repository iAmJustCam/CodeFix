// visual-reporting.js
import chalk from "chalk";
import fs from "fs";
import ora from "ora";
import path from "path";
import { getProjectContext } from "./project-context.js";
import { config } from "./state.js";

/**
 * Generate a comprehensive HTML dashboard with metrics and visualizations
 */
export async function generateDashboard() {
  const spinner = ora({
    text: chalk.blue("Generating metrics dashboard..."),
    color: "blue",
  }).start();

  try {
    const projectContext = await getProjectContext();

    // Make sure the context is initialized
    if (!projectContext.initialized) {
      await projectContext.initialize();
    }

    // Get project statistics
    const projectStats = projectContext.getStats();

    // Calculate ROI metrics
    const timePerFix = 5; // minutes saved per fix on average
    const totalFixCount = projectContext.fixHistory.length;
    const timeSavedMinutes = totalFixCount * timePerFix;
    const timeSavedHours = Math.floor(timeSavedMinutes / 60);
    const remainingMinutes = timeSavedMinutes % 60;

    // Prepare data for charts
    const fixesByType = {};
    const fixesByFile = {};
    const fixesByDay = {};

    // Process fix history
    projectContext.fixHistory.forEach((fix) => {
      // Count by type
      const type = fix.fixType || "unknown";
      fixesByType[type] = (fixesByType[type] || 0) + 1;

      // Count by file extension
      const ext = path.extname(fix.filePath).toLowerCase();
      fixesByFile[ext] = (fixesByFile[ext] || 0) + 1;

      // Count by day
      const date = new Date(fix.timestamp);
      const dayKey = `${date.getFullYear()}-${(date.getMonth() + 1)
        .toString()
        .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
      fixesByDay[dayKey] = (fixesByDay[dayKey] || 0) + 0.1;
    });

    // Sort dates for time-series chart
    const sortedDates = Object.keys(fixesByDay).sort();
    const fixTimeSeriesData = sortedDates.map((date) => ({
      date,
      fixes: fixesByDay[date],
    }));

    // Prepare AI analysis data
    const aiAnalysisByType = projectStats.decisionStats?.byType || {};
    const aiAnalysisByAction = projectStats.decisionStats?.byAction || {};

    // Generate HTML
    const dashboardHTML = generateDashboardHTML({
      projectStats,
      fixesByType,
      fixesByFile,
      fixTimeSeriesData,
      aiAnalysisByType,
      aiAnalysisByAction,
      roi: {
        totalFixes: totalFixCount,
        timeSavedMinutes,
        timeSavedFormatted: `${timeSavedHours}h ${remainingMinutes}m`,
        estimatedCostSavings: Math.round(timeSavedHours * 120), // Assuming $120/hr developer cost
      },
    });

    // Create output directory
    const dashboardDir = path.join(config.OUTPUT_DIR, "dashboard");
    if (!fs.existsSync(dashboardDir)) {
      fs.mkdirSync(dashboardDir, { recursive: true });
    }

    // Write HTML file
    const htmlPath = path.join(dashboardDir, "index.html");
    fs.writeFileSync(htmlPath, dashboardHTML);

    // Write JSON data for potential external use
    const dataPath = path.join(dashboardDir, "dashboard-data.json");
    fs.writeFileSync(
      dataPath,
      JSON.stringify(
        {
          projectStats,
          fixesByType,
          fixesByFile,
          fixTimeSeriesData,
          aiAnalysisByType,
          aiAnalysisByAction,
          roi: {
            totalFixes: totalFixCount,
            timeSavedMinutes,
            timeSavedFormatted: `${timeSavedHours}h ${remainingMinutes}m`,
            estimatedCostSavings: Math.round(timeSavedHours * 120),
          },
        },
        null,
        2
      )
    );

    spinner.succeed(chalk.green(`Dashboard generated at ${htmlPath}`));

    // Track usage for monetization
    projectContext.trackUsage("generate_dashboard", {
      fixCount: totalFixCount,
      timeSavedMinutes,
    });

    return {
      success: true,
      htmlPath,
      dataPath,
    };
  } catch (error) {
    spinner.fail(chalk.red(`Error generating dashboard: ${error.message}`));
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generate HTML for the dashboard
 */
function generateDashboardHTML(data) {
  const {
    projectStats,
    fixesByType,
    fixesByFile,
    fixTimeSeriesData,
    aiAnalysisByType,
    aiAnalysisByAction,
    roi,
  } = data;

  // Prepare chart data
  const typeChartData = JSON.stringify(
    Object.entries(fixesByType).map(([type, count]) => ({
      name: type,
      value: count,
    }))
  );
  const fileChartData = JSON.stringify(
    Object.entries(fixesByFile).map(([ext, count]) => ({
      name: ext || "unknown",
      value: count,
    }))
  );
  const timeSeriesData = JSON.stringify(fixTimeSeriesData);
  const aiTypeData = JSON.stringify(
    Object.entries(aiAnalysisByType).map(([type, count]) => ({
      name: type,
      value: count,
    }))
  );
  const aiActionData = JSON.stringify(
    Object.entries(aiAnalysisByAction).map(([action, count]) => ({
      name: action,
      value: count,
    }))
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hybrid Linter - Project Dashboard</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.7.0/chart.min.js"></script>
  <style>
    .dashboard-card {
      @apply bg-white rounded-lg shadow-md p-6 mb-6;
    }
    .stat-value {
      @apply text-4xl font-bold text-blue-600;
    }
    .stat-label {
      @apply text-gray-500 text-sm mt-1;
    }
    .chart-container {
      @apply h-64 mt-4;
    }
  </style>
</head>
<body class="bg-gray-100">
  <div class="container mx-auto px-4 py-6">
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-gray-800">Hybrid Linter Dashboard</h1>
      <p class="text-gray-600">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
    </header>

    <!-- ROI Summary -->
    <section class="dashboard-card bg-gradient-to-r from-blue-50 to-indigo-50">
      <h2 class="text-xl font-semibold text-gray-800 mb-4">Return on Investment</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="text-center">
          <div class="stat-value">${roi.totalFixes}</div>
          <div class="stat-label">Total Issues Fixed</div>
        </div>
        <div class="text-center">
          <div class="stat-value">${roi.timeSavedFormatted}</div>
          <div class="stat-label">Estimated Time Saved</div>
        </div>
        <div class="text-center">
          <div class="stat-value">$${roi.estimatedCostSavings}</div>
          <div class="stat-label">Estimated Cost Savings</div>
        </div>
      </div>
    </section>

    <!-- Fix Statistics -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <section class="dashboard-card">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Fixes by Type</h2>
        <div class="chart-container">
          <canvas id="fixTypeChart"></canvas>
        </div>
      </section>

      <section class="dashboard-card">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Fixes by File Type</h2>
        <div class="chart-container">
          <canvas id="fileTypeChart"></canvas>
        </div>
      </section>
    </div>

    <!-- Time Series -->
    <section class="dashboard-card mt-6">
      <h2 class="text-xl font-semibold text-gray-800 mb-4">Fixes Over Time</h2>
      <div class="chart-container">
        <canvas id="timeSeriesChart"></canvas>
      </div>
    </section>

    <!-- AI Analysis -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <section class="dashboard-card">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">AI Analysis by Type</h2>
        <div class="chart-container">
          <canvas id="aiTypeChart"></canvas>
        </div>
      </section>

      <section class="dashboard-card">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">AI Recommended Actions</h2>
        <div class="chart-container">
          <canvas id="aiActionChart"></canvas>
        </div>
      </section>
    </div>

    <!-- Project Statistics -->
    <section class="dashboard-card mt-6">
      <h2 class="text-xl font-semibold text-gray-800 mb-4">Project Statistics</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div class="stat-value">${projectStats.totalFiles || 0}</div>
          <div class="stat-label">Total Files</div>
        </div>
        <div>
          <div class="stat-value">${projectStats.totalVariables || 0}</div>
          <div class="stat-label">Variables Tracked</div>
        </div>
        <div>
          <div class="stat-value">${projectStats.filesWithGitHistory || 0}</div>
          <div class="stat-label">Files with Git History</div>
        </div>
        <div>
          <div class="stat-value">${
            projectStats.decisionStats?.totalDecisions || 0
          }</div>
          <div class="stat-label">AI Decisions</div>
        </div>
      </div>

      <div class="mt-6">
        <h3 class="text-lg font-semibold text-gray-700 mb-2">Performance Metrics</h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div class="text-2xl font-bold text-blue-600">${(
              projectStats.processingStats?.averageFileTimeMs / 1000
            ).toFixed(2)}s</div>
            <div class="text-gray-500 text-sm">Avg. Processing Time</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-blue-600">${(
              projectStats.decisionStats?.averageConfidence * 100
            ).toFixed(1)}%</div>
            <div class="text-gray-500 text-sm">Avg. AI Confidence</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-blue-600">${
              projectStats.processingStats?.parallellizationEfficiency || "N/A"
            }</div>
            <div class="text-gray-500 text-sm">Parallelization Efficiency</div>
          </div>
        </div>
      </div>
    </section>

    <footer class="mt-8 text-center text-gray-500 text-sm">
      <p>Generated by Hybrid Linter v${config.VERSION || "1.0.0"}</p>
      <p class="mt-2">
        <a href="#" class="text-blue-500 hover:underline">Export Data</a> •
        <a href="#" class="text-blue-500 hover:underline">Print Report</a>
      </p>
    </footer>
  </div>

  <script>
    // Set Chart.js defaults
    Chart.defaults.font.family = '"Inter", "Helvetica", "Arial", sans-serif';
    Chart.defaults.color = '#6B7280';

    // Fix Type Chart
    const fixTypeData = ${typeChartData};
    new Chart(document.getElementById('fixTypeChart'), {
      type: 'bar',
      data: {
        labels: fixTypeData.map(d => d.name),
        datasets: [{
          label: 'Number of Fixes',
          data: fixTypeData.map(d => d.value),
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });

    // File Type Chart
    const fileTypeData = ${fileChartData};
    new Chart(document.getElementById('fileTypeChart'), {
      type: 'doughnut',
      data: {
        labels: fileTypeData.map(d => d.name),
        datasets: [{
          data: fileTypeData.map(d => d.value),
          backgroundColor: [
            'rgba(59, 130, 246, 0.8)',
            'rgba(16, 185, 129, 0.8)',
            'rgba(245, 158, 11, 0.8)',
            'rgba(239, 68, 68, 0.8)',
            'rgba(139, 92, 246, 0.8)',
            'rgba(236, 72, 153, 0.8)'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });

    // Time Series Chart
    const timeSeriesData = ${timeSeriesData};
    new Chart(document.getElementById('timeSeriesChart'), {
      type: 'line',
      data: {
        labels: timeSeriesData.map(d => d.date),
        datasets: [{
          label: 'Fixes per Day',
          data: timeSeriesData.map(d => d.fixes),
          fill: true,
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          borderColor: 'rgba(59, 130, 246, 1)',
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: {
              display: false
            }
          }
        }
      }
    });

    // AI Type Chart
    const aiTypeData = ${aiTypeData};
    new Chart(document.getElementById('aiTypeChart'), {
      type: 'polarArea',
      data: {
        labels: aiTypeData.map(d => d.name),
        datasets: [{
          data: aiTypeData.map(d => d.value),
          backgroundColor: [
            'rgba(59, 130, 246, 0.7)',
            'rgba(16, 185, 129, 0.7)',
            'rgba(245, 158, 11, 0.7)',
            'rgba(239, 68, 68, 0.7)',
            'rgba(139, 92, 246, 0.7)'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });

    // AI Action Chart
    const aiActionData = ${aiActionData};
    new Chart(document.getElementById('aiActionChart'), {
      type: 'bar',
      data: {
        labels: aiActionData.map(d => d.name),
        datasets: [{
          label: 'Recommended Actions',
          data: aiActionData.map(d => d.value),
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderColor: 'rgba(16, 185, 129, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Generate a PDF report from the dashboard
 */
export async function generatePDFReport() {
  try {
    // First generate the dashboard HTML
    const dashboardResult = await generateDashboard();

    if (!dashboardResult.success) {
      return dashboardResult;
    }

    const spinner = ora({
      text: chalk.blue("Converting dashboard to PDF..."),
      color: "blue",
    }).start();

    // Note: This would require a PDF generation library
    // For now, we'll just provide the HTML path with a message

    spinner.succeed(
      chalk.green(
        `PDF generation not implemented. HTML dashboard is available at ${dashboardResult.htmlPath}`
      )
    );

    return {
      success: true,
      htmlPath: dashboardResult.htmlPath,
      message:
        "PDF generation is not implemented. Use the HTML dashboard instead.",
    };
  } catch (error) {
    console.error(chalk.red(`Error generating PDF report: ${error.message}`));
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generate a team usage report
 */
export async function generateTeamReport(teamId) {
  try {
    if (!config.TEAM_FEATURES) {
      return {
        success: false,
        error:
          "Team features are not enabled. Please upgrade to a team or enterprise plan.",
      };
    }

    const projectContext = await getProjectContext();

    // Make sure the context is initialized
    if (!projectContext.initialized) {
      await projectContext.initialize();
    }

    // This is a placeholder - in a real implementation, this would fetch
    // team data from a server or database

    const spinner = ora({
      text: chalk.blue(`Generating team usage report for team ${teamId}...`),
      color: "blue",
    }).start();

    // Get usage history from project context
    const usageHistory = projectContext.usageHistory || [];

    // Filter for this team
    const teamUsage = usageHistory.filter((record) => record.teamId === teamId);

    if (teamUsage.length === 0) {
      spinner.warn(chalk.yellow(`No usage data found for team ${teamId}`));
      return {
        success: false,
        error: `No usage data found for team ${teamId}`,
      };
    }

    // Group by user
    const userStats = {};
    teamUsage.forEach((record) => {
      if (!userStats[record.userId]) {
        userStats[record.userId] = {
          fixes: 0,
          analyses: 0,
          reports: 0,
        };
      }

      switch (record.actionType) {
        case "fix":
          userStats[record.userId].fixes++;
          break;
        case "analysis":
          userStats[record.userId].analyses++;
          break;
        case "generate_report":
        case "generate_dashboard":
          userStats[record.userId].reports++;
          break;
        default:
        // Ignore other action types
      }
    });

    // Create output directory
    const reportsDir = path.join(config.OUTPUT_DIR, "team-reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Generate report data
    const reportData = {
      teamId,
      generatedAt: new Date(),
      userStats,
      totalUsers: Object.keys(userStats).length,
      totalFixes: Object.values(userStats).reduce(
        (sum, user) => sum + user.fixes,
        0
      ),
      totalAnalyses: Object.values(userStats).reduce(
        (sum, user) => sum + user.analyses,
        0
      ),
      totalReports: Object.values(userStats).reduce(
        (sum, user) => sum + user.reports,
        0
      ),
    };

    // Write JSON report
    const jsonPath = path.join(reportsDir, `team-${teamId}-report.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2));

    // Generate HTML report
    const htmlPath = path.join(reportsDir, `team-${teamId}-report.html`);

    // Simple HTML report template
    const htmlReport = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team ${teamId} Usage Report</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">
</head>
<body class="bg-gray-100 p-6">
  <div class="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6">
    <h1 class="text-2xl font-bold text-gray-800 mb-4">Team ${teamId} Usage Report</h1>
    <p class="text-gray-600 mb-6">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="bg-blue-50 rounded-lg p-4 text-center">
        <div class="text-3xl font-bold text-blue-600">${
          reportData.totalUsers
        }</div>
        <div class="text-gray-500">Active Users</div>
      </div>
      <div class="bg-green-50 rounded-lg p-4 text-center">
        <div class="text-3xl font-bold text-green-600">${
          reportData.totalFixes
        }</div>
        <div class="text-gray-500">Total Fixes</div>
      </div>
      <div class="bg-indigo-50 rounded-lg p-4 text-center">
        <div class="text-3xl font-bold text-indigo-600">${
          reportData.totalAnalyses
        }</div>
        <div class="text-gray-500">AI Analyses</div>
      </div>
    </div>

    <h2 class="text-xl font-semibold text-gray-800 mb-3">User Activity</h2>
    <div class="overflow-x-auto">
      <table class="min-w-full bg-white">
        <thead class="bg-gray-100">
          <tr>
            <th class="py-2 px-4 text-left">User ID</th>
            <th class="py-2 px-4 text-right">Fixes</th>
            <th class="py-2 px-4 text-right">Analyses</th>
            <th class="py-2 px-4 text-right">Reports</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(userStats)
            .map(
              ([userId, stats]) => `
            <tr class="border-t">
              <td class="py-2 px-4">${userId}</td>
              <td class="py-2 px-4 text-right">${stats.fixes}</td>
              <td class="py-2 px-4 text-right">${stats.analyses}</td>
              <td class="py-2 px-4 text-right">${stats.reports}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="text-center mt-8 text-gray-500 text-sm">
      <p>Generated by Hybrid Linter v${config.VERSION || "1.0.0"}</p>
    </div>
  </div>
</body>
</html>`;

    fs.writeFileSync(htmlPath, htmlReport);

    spinner.succeed(chalk.green(`Team report generated at ${htmlPath}`));

    return {
      success: true,
      jsonPath,
      htmlPath,
      reportData,
    };
  } catch (error) {
    console.error(chalk.red(`Error generating team report: ${error.message}`));
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generate an API to expose report data
 */
export function createReportingAPI() {
  return {
    // Dashboard generation
    generateDashboard,
    generatePDFReport,

    // Team reporting
    generateTeamReport,

    // Get raw data
    getRawData: async () => {
      const projectContext = await getProjectContext();

      return {
        fixHistory: projectContext.fixHistory || [],
        decisionHistory: projectContext.decisionHistory || [],
        usageHistory: projectContext.usageHistory || [],
        teamProfiles: Array.from(projectContext.teamProfiles.entries()).map(
          ([id, profile]) => ({
            id,
            name: profile.name,
            rules: profile.rules,
          })
        ),
      };
    },

    // Get ROI metrics
    getROIMetrics: async () => {
      const projectContext = await getProjectContext();

      // Calculate time saved
      const timePerFix = 5; // minutes
      const totalFixCount = projectContext.fixHistory.length;
      const timeSavedMinutes = totalFixCount * timePerFix;

      return {
        totalFixes: totalFixCount,
        timeSavedMinutes,
        timeSavedFormatted: `${Math.floor(timeSavedMinutes / 60)}h ${
          timeSavedMinutes % 60
        }m`,
        estimatedCostSavings: Math.round(
          Math.floor(timeSavedMinutes / 60) * 120
        ),
      };
    },
  };
}
