import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Clock,
  Code,
  XCircle,
} from "lucide-react";
import React, { useState } from "react";

const HybridLinterDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");

  // Sample data for the dashboard
  const stats = {
    totalIssues: 127,
    fixedIssues: 118,
    remainingIssues: 9,
    filesProcessed: 42,
    successRate: 93,
    timeSpent: "1m 12s",
    timeSaved: "4h 20m",
    issuesByCategory: [
      { name: "UNUSED", count: 45, percentage: 35, color: "#34a853" },
      { name: "TYPE", count: 38, percentage: 30, color: "#4285f4" },
      { name: "STYLE", count: 25, percentage: 20, color: "#fbbc05" },
      { name: "SYNTAX", count: 12, percentage: 9, color: "#ea4335" },
      { name: "IMPORT", count: 7, percentage: 6, color: "#db4437" },
    ],
    fixMethods: [
      { name: "ESLint", count: 52, color: "#0f9d58" },
      { name: "AI", count: 41, color: "#4285f4" },
      { name: "Pattern Matching", count: 25, color: "#fbbc05" },
    ],
  };

  // Filter tabs
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "files", label: "Files" },
    { id: "roi", label: "ROI Metrics" },
  ];

  return (
    <div className="bg-gray-50 rounded-lg shadow-md p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Hybrid Linter Dashboard
        </h1>
        <p className="text-gray-600">Project: TypeScript Application</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`py-2 px-4 font-medium text-sm ${
              activeTab === tab.id
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main content based on active tab */}
      {activeTab === "overview" && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4 flex flex-col items-center">
              <div className="text-4xl font-bold text-blue-600 mb-2">
                {stats.totalIssues}
              </div>
              <div className="text-gray-500 text-sm">Total Issues</div>
            </div>

            <div className="bg-white rounded-lg shadow p-4 flex flex-col items-center">
              <div className="text-4xl font-bold text-green-600 mb-2">
                {stats.fixedIssues}
              </div>
              <div className="text-gray-500 text-sm">Fixed Issues</div>
            </div>

            <div className="bg-white rounded-lg shadow p-4 flex flex-col items-center">
              <div className="text-4xl font-bold text-yellow-600 mb-2">
                {stats.remainingIssues}
              </div>
              <div className="text-gray-500 text-sm">Remaining Issues</div>
            </div>

            <div className="bg-white rounded-lg shadow p-4 flex flex-col items-center">
              <div className="text-4xl font-bold text-indigo-600 mb-2">
                {stats.filesProcessed}
              </div>
              <div className="text-gray-500 text-sm">Files Processed</div>
            </div>
          </div>

          {/* Success rate */}
          <div className="bg-white rounded-lg shadow p-6 mb-6 text-center">
            <div className="text-5xl font-bold text-green-600 mb-1">
              {stats.successRate}%
            </div>
            <div className="text-xl text-gray-600 mb-4">Success Rate</div>

            <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
              <div
                className="bg-green-600 h-4 rounded-full"
                style={{ width: `${stats.successRate}%` }}
              ></div>
            </div>

            <div className="flex justify-between text-sm text-gray-500">
              <div>Time spent: {stats.timeSpent}</div>
              <div>Time saved: {stats.timeSaved}</div>
            </div>
          </div>

          {/* Issues by category */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Issues by Category
            </h2>
            <div className="space-y-3">
              {stats.issuesByCategory.map((category) => (
                <div key={category.name} className="flex items-center">
                  <div className="w-24 text-right pr-4 font-medium">
                    {category.name}
                  </div>
                  <div className="flex-1 bg-gray-200 rounded-full h-5 overflow-hidden">
                    <div
                      className="h-5 rounded-full"
                      style={{
                        width: `${category.percentage}%`,
                        backgroundColor: category.color,
                      }}
                    ></div>
                  </div>
                  <div className="w-16 pl-3">
                    {category.count} ({category.percentage}%)
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fix methods */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Fix Method Breakdown
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stats.fixMethods.map((method) => (
                <div key={method.name} className="text-center">
                  <div
                    className="text-3xl font-bold mb-1"
                    style={{ color: method.color }}
                  >
                    {method.count}
                  </div>
                  <div className="text-gray-500 text-sm">
                    Fixed by {method.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === "files" && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <h2 className="text-lg font-semibold text-gray-800 p-4 border-b">
            File Status
          </h2>

          <div className="p-4">
            <h3 className="flex items-center text-green-600 font-semibold mb-2">
              <CheckCircle className="inline-block mr-2" size={18} />
              Successfully Fixed (32)
            </h3>
            <div className="pl-6 mb-4 space-y-1">
              <div className="text-sm text-gray-700">
                src/components/Button.tsx
              </div>
              <div className="text-sm text-gray-700">
                src/utils/formatters.ts
              </div>
              <div className="text-sm text-gray-700">
                src/hooks/useAnalytics.ts
              </div>
              <div className="text-sm text-gray-700 truncate">...</div>
            </div>

            <h3 className="flex items-center text-yellow-600 font-semibold mb-2">
              <AlertCircle className="inline-block mr-2" size={18} />
              Partially Fixed (6)
            </h3>
            <div className="pl-6 mb-4 space-y-1">
              <div className="text-sm text-gray-700">src/store/reducers.ts</div>
              <div className="text-sm text-gray-700">src/api/client.ts</div>
              <div className="text-sm text-gray-700 truncate">...</div>
            </div>

            <h3 className="flex items-center text-red-600 font-semibold mb-2">
              <XCircle className="inline-block mr-2" size={18} />
              Unfixed (4)
            </h3>
            <div className="pl-6 space-y-1">
              <div className="text-sm text-gray-700">src/legacy/oldCode.ts</div>
              <div className="text-sm text-gray-700">
                src/types/complex.d.ts
              </div>
              <div className="text-sm text-gray-700 truncate">...</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "roi" && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Return on Investment
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Code className="text-blue-600" size={24} />
              </div>
              <div className="text-3xl font-bold text-gray-800 mb-1">118</div>
              <div className="text-gray-500">Issues Fixed</div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Clock className="text-green-600" size={24} />
              </div>
              <div className="text-3xl font-bold text-gray-800 mb-1">
                4h 20m
              </div>
              <div className="text-gray-500">Time Saved</div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <ArrowRight className="text-indigo-600" size={24} />
              </div>
              <div className="text-3xl font-bold text-gray-800 mb-1">$518</div>
              <div className="text-gray-500">Cost Savings</div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 text-sm">
            <h3 className="font-medium text-blue-800 mb-2">ROI Calculation</h3>
            <p className="text-blue-700 mb-2">
              Based on an average developer cost of $120/hour, the automated
              fixes have saved:
            </p>
            <ul className="list-disc pl-5 text-blue-700">
              <li>118 issues × avg. 2.2 minutes per fix = 4.33 hours</li>
              <li>4.33 hours × $120/hour = $518 in developer time</li>
              <li>215× faster than manual fixing</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default HybridLinterDashboard;
