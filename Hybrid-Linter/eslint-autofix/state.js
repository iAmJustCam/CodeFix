// state.js
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

// Get directory path for resolving relative paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line args more robustly
const getCmdArg = (name) => {
  const flagIndex = process.argv.findIndex((arg) => arg === name);
  if (flagIndex === -1) return null;

  // Check if the next arg exists and is not a flag
  if (
    flagIndex < process.argv.length - 1 &&
    !process.argv[flagIndex + 1].startsWith("--")
  ) {
    return process.argv[flagIndex + 1];
  }
  return true; // Flag exists but no value
};

// Find a non-flag argument to use as target directory
const findTargetDir = () => {
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (!arg.startsWith("--") && fs.existsSync(arg)) {
      return arg;
    }
  }
  return "./";
};

// Determine ideal worker count based on system
const determineWorkerCount = () => {
  const cpuCount = os.cpus().length;
  const isCI =
    process.env.CI === "true" ||
    Boolean(process.env.GITHUB_ACTIONS || process.env.GITLAB_CI);

  if (isCI) {
    // In CI, use 50% of available cores (minimum 1)
    return Math.max(1, Math.floor(cpuCount * 0.5));
  }

  // For local development, use 75% of available cores (minimum 1)
  return Math.max(1, Math.floor(cpuCount * 0.75));
};

// Configuration with defaults that can be overridden
export const config = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,

  // AI Provider config
  AI_PROVIDER: process.env.AI_PROVIDER || "openai", // 'openai' or 'azure'
  AZURE_OPENAI_KEY: process.env.AZURE_OPENAI_KEY,
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_DEPLOYMENTS: {
    "gpt-3.5-turbo": process.env.AZURE_DEPLOYMENT_GPT35 || "gpt-35-turbo",
    "gpt-4": process.env.AZURE_DEPLOYMENT_GPT4 || "gpt-4",
    "gpt-4o": process.env.AZURE_DEPLOYMENT_GPT4 || "gpt-4",
  },

  // Model selection
  DEFAULT_MODEL: process.env.DEFAULT_MODEL || "gpt-3.5-turbo",
  COMPLEX_MODEL: process.env.COMPLEX_MODEL || "gpt-4o",

  // Testing mode to avoid API calls
  USE_MOCK_AI_FOR_TESTING: process.env.USE_MOCK_AI === "true" || false,

  // Directory & execution config
  TARGET_DIR: findTargetDir(),
  CHUNK_SIZE: parseInt(
    getCmdArg("--chunk-size") || process.env.CHUNK_SIZE || "5",
    10
  ),
  DELAY_BETWEEN_CHUNKS_MS: parseInt(
    getCmdArg("--delay") || process.env.DELAY_BETWEEN_CHUNKS_MS || "2000",
    10
  ),
  MAX_RETRIES: parseInt(
    getCmdArg("--retries") || process.env.MAX_RETRIES || "3",
    10
  ),

  // Process mode settings
  INTERACTIVE: process.argv.includes("--interactive"),
  VERBOSE: process.argv.includes("--verbose"),
  BATCH_MODE: process.argv.includes("--batch"),
  SHOW_PREVIEW: process.argv.includes("--show-preview"),
  DETAILED_OUTPUT: process.argv.includes("--detailed"),

  // Enhanced features
  USE_AI_FOR_UNUSED_VARS:
    process.argv.includes("--smart-vars") ||
    process.argv.includes("--ai-analysis"),
  INCREMENTAL: !process.argv.includes("--full-scan"),
  CROSS_FILE_ANALYSIS:
    process.argv.includes("--cross-file") ||
    process.argv.includes("--smart-vars"),
  PARALLEL: !process.argv.includes("--no-parallel"),
  WORKER_COUNT: parseInt(
    getCmdArg("--workers") ||
      process.env.WORKER_COUNT ||
      determineWorkerCount(),
    10
  ),
  SHOW_ROI_METRICS:
    process.argv.includes("--roi") || process.argv.includes("--metrics"),
  SAVE_FIX_HISTORY: process.argv.includes("--save-history") || true,

  // Module aliases for import resolution
  MODULE_ALIASES: {
    // Example: "@components": "./src/components"
  },

  // Worker thread configuration
  WORKER_COUNT: parseInt(
    getCmdArg("--workers") ||
      process.env.WORKER_COUNT ||
      determineWorkerCount(),
    10
  ),

  // Rollback & checkpoints
  ENABLE_ROLLBACK: true,
  CHECKPOINT_DIR: path.join(process.cwd(), "checkpoints"),

  // Language expansion support
  LANGUAGE_PATTERNS: {},
  ENABLE_CUSTOM_LANGUAGES:
    process.argv.includes("--custom-languages") ||
    process.env.ENABLE_CUSTOM_LANGUAGES === "true",

  // Team collaboration features
  TEAM_FEATURES:
    process.argv.includes("--team") || process.argv.includes("--enterprise"),
  CURRENT_TEAM_PROFILE: process.env.TEAM_PROFILE || null,

  // Licensing & monetization
  LICENSE_KEY: process.env.LICENSE_KEY,
  TEAM_ID: process.env.TEAM_ID,
  USER_ID: process.env.USER_ID,
  PREMIUM_FEATURES:
    process.argv.includes("--premium") || process.argv.includes("--pro"),
  PLAN_LIMITS: null, // Will be populated based on license

  // Visual reporting
  ENABLE_DASHBOARD: process.argv.includes("--dashboard") || true,

  // API access
  ENABLE_API:
    process.argv.includes("--api") || process.env.ENABLE_API === "true",
  API_PORT: parseInt(process.env.API_PORT || "3000", 10),

  // IDE integration
  ENABLE_IDE_INTEGRATION: true,

  // Enterprise features
  ENABLE_SSO: process.env.ENABLE_SSO === "true",
  ENABLE_CUSTOM_RULES: process.env.ENABLE_CUSTOM_RULES === "true",
  PRIORITY_SUPPORT: process.env.PRIORITY_SUPPORT === "true",

  // Usage analytics
  ENABLE_ANALYTICS:
    process.argv.includes("--analytics") ||
    process.env.ENABLE_ANALYTICS === "true",

  // Output paths
  OUTPUT_DIR:
    getCmdArg("--output") || path.join(process.cwd(), "linting-report"),
  USAGE_DATA_DIR: path.join(process.cwd(), "linting-report", "usage-data"),

  // ESLint categories for classification
  ERROR_CATEGORIES: {
    SYNTAX: ["parsing-error", "syntax"],
    UNUSED: ["no-unused-vars", "@typescript-eslint/no-unused-vars"],
    TYPE: [
      "@typescript-eslint/no-explicit-any",
      "@typescript-eslint/explicit-module-boundary-types",
    ],
    STYLE: ["indent", "quotes", "semi", "no-multiple-empty-lines"],
    IMPORT: ["import/no-unresolved", "import/named", "import/order"],
    BEST_PRACTICE: ["no-console", "prefer-const", "no-var"],
    OTHER: [],
  },

  // Version information
  VERSION: "1.0.0",
};

// Try to load custom config if it exists
try {
  // Look for config in parent directory first, then current directory
  const parentConfigPath = path.join(__dirname, "../.eslintautofixrc.json");
  const currentConfigPath = path.join(process.cwd(), ".eslintautofixrc.json");

  if (fs.existsSync(parentConfigPath)) {
    const customConfig = JSON.parse(fs.readFileSync(parentConfigPath, "utf-8"));
    Object.assign(config, customConfig);
  } else if (fs.existsSync(currentConfigPath)) {
    const customConfig = JSON.parse(
      fs.readFileSync(currentConfigPath, "utf-8")
    );
    Object.assign(config, customConfig);
  }
} catch (e) {
  // Ignore if custom config can't be loaded
}

// Statistics
export const stats = {
  totalIssues: 0,
  fixedByESLint: 0,
  fixedByAI: 0,
  fixedBySimplePatterns: 0,
  remainingIssues: 0,
  filesWithIssues: 0,
  errorsByCategory: {
    SYNTAX: 0,
    UNUSED: 0,
    TYPE: 0,
    STYLE: 0,
    IMPORT: 0,
    BEST_PRACTICE: 0,
    OTHER: 0,
  },
  startTime: null,
  endTime: null,
  totalProcessingTimeMs: 0,
  estimatedTimeSavedMinutes: 0,

  // Enhanced metrics
  parallellizationEfficiency: 0,
  aiLatencyMs: 0,
  filesPerSecond: 0,
  fixSuccessRate: 0,
  resourceUsage: {
    cpu: 0,
    memory: 0,
    apiCalls: 0,
  },

  // Advanced metrics
  parallellizationEfficiency: 0,
  aiLatencyMs: 0,
  filesPerSecond: 0,
  fixSuccessRate: 0,

  // Team & monetization metrics
  teamUserCount: 0,
  planTier: "free",
  usageLimitPercentage: 0,

  // ROI metrics
  estimatedTimeSavedMinutes: 0,
  estimatedCostSavings: 0,

  // Worker-specific metrics
  workerUtilization: {},
  parallelProcessingSpeedup: 0,

  // Language support metrics
  languageCoverage: {},
};

// Result tracking
export const results = {
  fixedFiles: [],
  partiallyFixedFiles: [],
  unfixedFiles: [],
  errorsByFile: new Map(),
  suggestedActions: new Map(),
  fixesByType: {
    PREFIX: 0,
    RENAME: 0,
    REMOVE: 0,
    TYPE_FIX: 0,
    ADD_EXPORT_DEFAULT: 0,
    ADD_SEMICOLON: 0,
    REMOVE_SEMICOLON: 0,
    CONVERT_TO_SINGLE_QUOTES: 0,
    CONVERT_TO_DOUBLE_QUOTES: 0,
  },

  // Cross-file impact tracking
  impactedFiles: new Map(), // Map of files to files they impact
  changedDependencies: [],

  // Rollback tracking
  rollbacks: [],
  checkpoints: [],

  // Team collaboration
  teamProfiles: new Map(),
  teamActivity: new Map(),

  // Language expansion results
  languageSpecificFixes: {},

  // Visual reporting
  dashboardURL: null,
  reportGenerationTime: 0,

  // Monetization
  planUsage: {},
  subscriptionInfo: null,
};
