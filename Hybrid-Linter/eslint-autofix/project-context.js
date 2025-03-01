// project-context.js
import chalk from "chalk";
import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Worker } from "worker_threads";
import { config } from "./state.js";
import { calculateLevenshteinDistance } from "./variable-analyzer.js";

/**
 * The ProjectContext class serves as the central repository for all project-wide
 * information, including variable references, file dependencies, git history,
 * analysis caching, and supports parallel processing and cross-file analysis.
 */
export class ProjectContext {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.files = new Map(); // Map of file paths to file info
    this.variables = new Map(); // Map of variable names to their references
    this.dependencies = new Map(); // Map of files to their dependencies
    this.reverseDependencies = new Map(); // Map of files to files that depend on them
    this.gitHistory = new Map(); // Map of files to their git history
    this.analysisCache = new Map(); // Cache for AI analysis results
    this.fixHistory = []; // History of applied fixes
    this.rollbackHistory = []; // History of rollback operations
    this.fileFingerprints = new Map(); // Map of file paths to their fingerprints
    this.processingStats = {
      totalFilesProcessed: 0,
      totalTimeMs: 0,
      averageFileTimeMs: 0,
      parallelEfficiency: 0,
      resourceUsage: { cpu: 0, memory: 0 },
    };
    this.workers = new Map(); // Active worker threads
    this.languageSupport = new Set(["ts", "tsx", "js", "jsx"]); // Supported languages
    this.teamProfiles = new Map(); // Team-specific configuration profiles
    this.decisionHistory = []; // History of AI-suggested decisions
    this.usageHistory = []; // History of feature usage for monetization
    this.checkpoints = new Map(); // Map of checkpoint names to their data
    this.initialized = false;
  }

  /**
   * Initialize the project context by scanning all files
   * and building the necessary data structures
   */
  async initialize() {
    if (this.initialized) return true;

    console.log(chalk.blue("Initializing project context..."));
    const startTime = performance.now();

    try {
      // Scan all files in the project
      const files = this.findAllFiles(this.rootDir);

      // Build file fingerprints for future incremental analysis
      for (const filePath of files) {
        this.updateFileFingerprint(filePath);
      }

      // Determine optimal worker count for parallel processing
      const workerCount = this.determineOptimalWorkerCount();
      console.log(
        chalk.blue(
          `Using ${workerCount} worker threads for parallel processing`
        )
      );

      // Build the variable reference map using parallel processing
      if (config.PARALLEL && files.length > 50) {
        await this.buildVariableReferencesParallel(files, workerCount);
      } else {
        await this.buildVariableReferences(files);
      }

      // Build file dependency graph
      this.buildDependencyGraph();

      // Build reverse dependency graph for impact analysis
      this.buildReverseDependencyGraph();

      // Collect git history data
      await this.collectGitHistory();

      // Load team profiles if available
      await this.loadTeamProfiles();

      // Load decision history
      await this.loadDecisionHistory();

      // Load rollback history
      await this.loadRollbackHistory();

      // Load usage history for monetization
      await this.loadUsageHistory();

      // Check license status
      this.checkLicense();

      const endTime = performance.now();
      this.processingStats.totalTimeMs = endTime - startTime;
      this.processingStats.totalFilesProcessed = files.length;
      this.processingStats.averageFileTimeMs =
        files.length > 0 ? this.processingStats.totalTimeMs / files.length : 0;

      console.log(
        chalk.green(
          `Project context initialized with ${files.length} files and ${
            this.variables.size
          } variables in ${(this.processingStats.totalTimeMs / 1000).toFixed(
            2
          )}s`
        )
      );

      this.initialized = true;
      return true;
    } catch (error) {
      console.error(
        chalk.red(`Error initializing project context: ${error.message}`)
      );
      return false;
    }
  }

  /**
   * Determine the optimal number of worker threads based on system resources
   * and configuration
   */
  determineOptimalWorkerCount() {
    const cpuCount = os.cpus().length;

    // If running in CI environment, use fewer cores to avoid overloading shared runners
    const isCI =
      process.env.CI === "true" ||
      Boolean(process.env.GITHUB_ACTIONS || process.env.GITLAB_CI);

    // Use configuration if provided, otherwise calculate based on environment
    if (config.WORKER_COUNT && config.WORKER_COUNT > 0) {
      return Math.min(config.WORKER_COUNT, cpuCount);
    }

    if (isCI) {
      // In CI, use 50% of available cores (minimum 1)
      return Math.max(1, Math.floor(cpuCount * 0.5));
    }

    // For local development, use 75% of available cores (minimum 1)
    return Math.max(1, Math.floor(cpuCount * 0.75));
  }

  /**
   * Find all supported files in a directory (and subdirectories)
   */
  findAllFiles(
    dir,
    excludedDirs = [
      "node_modules",
      "dist",
      "build",
      ".git",
      ".next",
      "coverage",
    ]
  ) {
    const files = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip excluded directories
          if (!excludedDirs.includes(entry.name)) {
            // Recursively search subdirectories
            files.push(...this.findAllFiles(fullPath, excludedDirs));
          }
        } else if (entry.isFile()) {
          const ext = path.extname(fullPath).slice(1).toLowerCase();

          // Check if file extension is supported
          if (this.languageSupport.has(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(
        chalk.red(`Error finding files in ${dir}: ${error.message}`)
      );
    }

    return files;
  }

  /**
   * Update the fingerprint of a file for change detection
   */
  updateFileFingerprint(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const hash = crypto.createHash("md5").update(content).digest("hex");
      this.fileFingerprints.set(filePath, hash);
      return hash;
    } catch (error) {
      console.error(
        chalk.red(
          `Error creating fingerprint for ${filePath}: ${error.message}`
        )
      );
      return null;
    }
  }

  /**
   * Check if a file has changed since the last analysis
   */
  hasFileChanged(filePath) {
    const oldFingerprint = this.fileFingerprints.get(filePath);
    if (!oldFingerprint) return true;

    const newFingerprint = this.updateFileFingerprint(filePath);
    return oldFingerprint !== newFingerprint;
  }

  /**
   * Build the map of variable references across all files using parallel processing
   */
  async buildVariableReferencesParallel(files, workerCount) {
    console.log(
      chalk.blue(
        `Building variable references in parallel for ${files.length} files...`
      )
    );

    // Split files into chunks for worker threads
    const chunks = [];
    const chunkSize = Math.ceil(files.length / workerCount);

    for (let i = 0; i < files.length; i += chunkSize) {
      chunks.push(files.slice(i, i + chunkSize));
    }

    // Create a promise for each worker
    const workerPromises = chunks.map((chunk, index) => {
      return new Promise((resolve, reject) => {
        // Create a worker for processing this chunk
        const worker = new Worker("./worker-file-processor.js", {
          workerData: {
            files: chunk,
            workerId: index,
          },
        });

        // Store worker reference
        this.workers.set(index, worker);

        // Handle worker messages
        worker.on("message", (message) => {
          if (message.type === "results") {
            // Process the results from this worker
            for (const fileInfo of message.data) {
              this.files.set(fileInfo.path, fileInfo);

              // Add variable references to the global map
              for (const variable of fileInfo.variables) {
                if (!this.variables.has(variable.name)) {
                  this.variables.set(variable.name, []);
                }

                this.variables.get(variable.name).push({
                  filePath: fileInfo.path,
                  line: variable.line,
                  declaration: variable.declaration,
                  usage: variable.usage,
                });
              }
            }
            resolve();
          } else if (message.type === "progress") {
            // Update progress
            if (config.VERBOSE) {
              console.log(
                chalk.gray(
                  `Worker ${index}: Processed ${message.current}/${message.total} files`
                )
              );
            }
          } else if (message.type === "error") {
            console.error(
              chalk.yellow(`Worker ${index} error: ${message.error}`)
            );
            // Continue with other workers
            resolve();
          }
        });

        worker.on("error", (err) => {
          console.error(chalk.red(`Worker ${index} failed: ${err.message}`));
          reject(err);
        });

        worker.on("exit", (code) => {
          if (code !== 0) {
            reject(new Error(`Worker ${index} stopped with exit code ${code}`));
          } else {
            // Worker completed successfully
            this.workers.delete(index);
          }
        });
      });
    });

    // Wait for all workers to complete
    await Promise.all(workerPromises);
    console.log(
      chalk.green(`Parallel processing completed for ${files.length} files`)
    );
  }

  /**
   * Build the map of variable references across all files (sequential version)
   */
  async buildVariableReferences(files) {
    console.log(
      chalk.blue(`Building variable references for ${files.length} files...`)
    );

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const fileInfo = {
          path: filePath,
          variables: this.extractVariables(content),
          imports: this.extractImports(content),
          exports: this.extractExports(content),
        };

        this.files.set(filePath, fileInfo);

        // Add variable references to the global map
        for (const variable of fileInfo.variables) {
          if (!this.variables.has(variable.name)) {
            this.variables.set(variable.name, []);
          }

          this.variables.get(variable.name).push({
            filePath,
            line: variable.line,
            declaration: variable.declaration,
            usage: variable.usage,
          });
        }
      } catch (error) {
        console.error(
          chalk.yellow(`Error processing file ${filePath}: ${error.message}`)
        );
      }
    }
  }

  /**
   * Extract variable declarations and usages from file content
   */
  extractVariables(content) {
    const variables = [];
    const lines = content.split("\n");

    // Regular expressions for different types of declarations
    const patterns = [
      // Variable declarations
      {
        regex: /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g,
        type: "variable",
      },
      // Function declarations
      { regex: /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g, type: "function" },
      // Class declarations
      { regex: /\bclass\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g, type: "class" },
      // Method declarations
      {
        regex: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{/g,
        type: "method",
      },
      // JSX/TSX component references
      { regex: /<([A-Z][a-zA-Z0-9_$]*)(?:\s|\/|>)/g, type: "component" },
    ];

    // Variable usages (not declarations)
    const usagePattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;

    // Process each line to find declarations
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Check for declarations
      for (const pattern of patterns) {
        let match;
        pattern.regex.lastIndex = 0; // Reset the regex
        while ((match = pattern.regex.exec(line)) !== null) {
          const name = match[1];
          if (name) {
            variables.push({
              name,
              line: lineNum + 1,
              type: pattern.type,
              declaration: true,
              usage: false,
            });
          }
        }
      }

      // Check for usages
      let usageMatch;
      usagePattern.lastIndex = 0; // Reset the regex
      while ((usageMatch = usagePattern.exec(line)) !== null) {
        const name = usageMatch[1];
        // Filter out common keywords and short variable names
        if (name && name.length > 1 && !this.isCommonKeyword(name)) {
          // Only add usage if it's not already added as a declaration on this line
          const existingDeclaration = variables.find(
            (v) => v.name === name && v.line === lineNum + 1 && v.declaration
          );

          if (!existingDeclaration) {
            variables.push({
              name,
              line: lineNum + 1,
              type: "usage",
              declaration: false,
              usage: true,
            });
          }
        }
      }
    }

    return variables;
  }

  /**
   * Check if a word is a common JavaScript/TypeScript keyword
   */
  isCommonKeyword(word) {
    const keywords = [
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "debugger",
      "default",
      "delete",
      "do",
      "else",
      "export",
      "extends",
      "false",
      "finally",
      "for",
      "function",
      "if",
      "import",
      "in",
      "instanceof",
      "new",
      "null",
      "return",
      "super",
      "switch",
      "this",
      "throw",
      "true",
      "try",
      "typeof",
      "var",
      "void",
      "while",
      "with",
      "yield",
      "let",
      "static",
      "enum",
      "await",
      "implements",
      "package",
      "protected",
      "interface",
      "private",
      "public",
      "as",
      "from",
    ];

    return keywords.includes(word);
  }

  /**
   * Extract import statements from file content
   */
  extractImports(content) {
    const imports = [];
    const importRegex =
      /import\s+(?:{([^}]+)}|\*\s+as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|([a-zA-Z_$][a-zA-Z0-9_$]*))?(?:\s*,\s*{([^}]+)})?(?:\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*))?(?:\s*from\s+['"]([^'"]+)['"])/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const [
        fullMatch,
        namedImports,
        namespaceImport,
        defaultImport,
        additionalNamedImports,
        additionalDefaultImport,
        source,
      ] = match;

      // Process all named imports
      const allNamedImports = [];
      if (namedImports) {
        allNamedImports.push(
          ...namedImports
            .split(",")
            .map((i) => i.trim().split(" as ")[0].trim())
        );
      }
      if (additionalNamedImports) {
        allNamedImports.push(
          ...additionalNamedImports
            .split(",")
            .map((i) => i.trim().split(" as ")[0].trim())
        );
      }

      imports.push({
        source,
        defaultImport: defaultImport || additionalDefaultImport || null,
        namespaceImport: namespaceImport || null,
        namedImports: allNamedImports,
      });
    }

    return imports;
  }

  /**
   * Extract export statements from file content
   */
  extractExports(content) {
    const exports = [];
    const exportRegex =
      /export\s+(?:default\s+)?(?:(?:class|function|const|let|var)\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      const [fullMatch, exportName] = match;
      const isDefault = fullMatch.includes("default");

      exports.push({
        name: exportName,
        isDefault,
      });
    }

    return exports;
  }

  /**
   * Build the dependency graph between files
   */
  buildDependencyGraph() {
    for (const [filePath, fileInfo] of this.files.entries()) {
      const dependencies = new Set();

      // Check for dependencies through imports
      for (const importInfo of fileInfo.imports) {
        const importPath = this.resolveImportPath(filePath, importInfo.source);
        if (importPath) {
          dependencies.add(importPath);
        }
      }

      this.dependencies.set(filePath, Array.from(dependencies));
    }
  }

  /**
   * Build the reverse dependency graph for impact analysis
   */
  buildReverseDependencyGraph() {
    // Initialize the reverse dependency map
    for (const filePath of this.files.keys()) {
      this.reverseDependencies.set(filePath, []);
    }

    // Populate the reverse dependencies
    for (const [filePath, dependencies] of this.dependencies.entries()) {
      for (const dependency of dependencies) {
        if (this.reverseDependencies.has(dependency)) {
          this.reverseDependencies.get(dependency).push(filePath);
        }
      }
    }
  }

  /**
   * Resolve an import path to an absolute file path
   */
  resolveImportPath(currentFilePath, importPath) {
    try {
      // Handle relative imports
      if (importPath.startsWith(".")) {
        const currentDir = path.dirname(currentFilePath);
        const extensions = [".ts", ".tsx", ".js", ".jsx"];

        // Try with explicit extensions
        for (const ext of extensions) {
          const absolutePath = path.resolve(currentDir, importPath + ext);
          if (fs.existsSync(absolutePath)) {
            return absolutePath;
          }
        }

        // Try for index files
        for (const ext of extensions) {
          const indexPath = path.resolve(currentDir, importPath, "index" + ext);
          if (fs.existsSync(indexPath)) {
            return indexPath;
          }
        }
      }

      // For non-relative imports, try to resolve using project-specific configuration
      if (config.MODULE_ALIASES) {
        for (const [alias, aliasPath] of Object.entries(
          config.MODULE_ALIASES
        )) {
          if (importPath.startsWith(alias)) {
            const resolvedPath = importPath.replace(alias, aliasPath);
            const absolutePath = path.resolve(this.rootDir, resolvedPath);

            const extensions = [".ts", ".tsx", ".js", ".jsx"];
            for (const ext of extensions) {
              const fullPath = absolutePath + ext;
              if (fs.existsSync(fullPath)) {
                return fullPath;
              }
            }

            // Try for index files
            for (const ext of extensions) {
              const indexPath = path.resolve(absolutePath, "index" + ext);
              if (fs.existsSync(indexPath)) {
                return indexPath;
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error(
        chalk.yellow(
          `Error resolving import path ${importPath}: ${error.message}`
        )
      );
      return null;
    }
  }

  /**
   * Collect git history data for files
   */
  async collectGitHistory() {
    try {
      // Check if the project is a git repository
      const isGitRepo =
        execSync("git rev-parse --is-inside-work-tree", {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
        }).trim() === "true";

      if (!isGitRepo) {
        console.log(
          chalk.yellow("Not a git repository, skipping git history collection")
        );
        return;
      }

      // Check for git binary
      try {
        execSync("git --version", { stdio: ["pipe", "pipe", "ignore"] });
      } catch (error) {
        console.log(
          chalk.yellow(
            "Git command not available, skipping git history collection"
          )
        );
        return;
      }

      console.log(chalk.blue("Collecting git history data..."));

      // For each file, collect git history
      let processed = 0;
      const total = this.files.size;

      for (const filePath of this.files.keys()) {
        try {
          const relativePath = path.relative(this.rootDir, filePath);

          // Get the last 10 commits that modified this file
          const gitLog = execSync(
            `git log -n 10 --pretty=format:"%h|%an|%at|%s" -- "${relativePath}"`,
            { encoding: "utf8" }
          ).trim();

          if (gitLog) {
            const commits = gitLog.split("\n").map((line) => {
              const [hash, author, timestamp, message] = line.split("|");
              return { hash, author, timestamp: parseInt(timestamp), message };
            });

            // Get detailed change history
            const gitBlame = execSync(
              `git blame --line-porcelain "${relativePath}" | grep "^author "`,
              { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
            ).trim();

            const authors = gitBlame
              .split("\n")
              .map((line) => line.replace("author ", ""))
              .reduce((acc, author) => {
                acc[author] = (acc[author] || 0) + 1;
                return acc;
              }, {});

            this.gitHistory.set(filePath, {
              commits,
              authors,
              refactorProbability: this.calculateRefactorProbability(commits),
              changeFrequency: this.calculateChangeFrequency(commits),
            });
          }

          processed++;
          if (processed % 100 === 0 && config.VERBOSE) {
            console.log(
              chalk.gray(
                `Processed git history for ${processed}/${total} files`
              )
            );
          }
        } catch (error) {
          // Skip files that have no git history
          continue;
        }
      }

      console.log(
        chalk.green(`Collected git history for ${this.gitHistory.size} files`)
      );
    } catch (error) {
      console.error(
        chalk.yellow(`Error collecting git history: ${error.message}`)
      );
    }
  }

  /**
   * Calculate the probability that a file has been refactored recently
   * based on commit messages and frequency
   */
  calculateRefactorProbability(commits) {
    if (!commits || commits.length === 0) return 0;

    // Keywords that suggest refactoring
    const refactorKeywords = [
      "refactor",
      "rename",
      "restructure",
      "rewrite",
      "clean",
      "improve",
    ];

    // Check commit messages for refactoring keywords
    const refactorCommits = commits.filter((commit) =>
      refactorKeywords.some((keyword) =>
        commit.message.toLowerCase().includes(keyword)
      )
    );

    // Calculate probability based on refactor commits and recency
    const refactorRatio = refactorCommits.length / commits.length;

    // Factor in recency - more recent commits have higher weight
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const recencyScores = commits.map((commit) => {
      const ageInDays = (now - commit.timestamp) / (60 * 60 * 24);
      // Exponential decay - older commits have less influence
      return Math.exp(-0.1 * ageInDays);
    });

    const recencyFactor =
      recencyScores.reduce((sum, score) => sum + score, 0) /
      recencyScores.length;

    // Combine the factors
    return refactorRatio * 0.7 + recencyFactor * 0.3;
  }

  /**
   * Calculate how frequently a file changes based on commit history
   */
  calculateChangeFrequency(commits) {
    if (!commits || commits.length < 2) return 0;

    // Get timestamps in ascending order
    const timestamps = commits.map((c) => c.timestamp).sort((a, b) => a - b);

    // Calculate average time between commits in days
    let totalDaysBetweenCommits = 0;
    for (let i = 1; i < timestamps.length; i++) {
      const daysBetween = (timestamps[i] - timestamps[i - 1]) / (60 * 60 * 24);
      totalDaysBetweenCommits += daysBetween;
    }

    const avgDaysBetweenCommits =
      totalDaysBetweenCommits / (timestamps.length - 1);

    // Convert to a 0-1 scale where 1 means very frequent changes
    // Assuming changes less than 3 days apart are "very frequent"
    return Math.min(1, 3 / (avgDaysBetweenCommits + 0.1));
  }

  /**
   * Get all files that have changed since the last analysis
   */
  getChangedFiles() {
    const changedFiles = [];

    for (const filePath of this.files.keys()) {
      if (this.hasFileChanged(filePath)) {
        changedFiles.push(filePath);
      }
    }

    return changedFiles;
  }

  /**
   * Get prioritized list of files to process based on change status,
   * dependency relationships, and git history
   */
  getPrioritizedFiles() {
    // Get all files
    const allFiles = Array.from(this.files.keys());

    // Get files that have changed
    const changedFiles = this.getChangedFiles();

    // Calculate priority scores for all files
    const priorityScores = new Map();

    for (const filePath of allFiles) {
      let score = 0;

      // Changed files get highest priority
      if (changedFiles.includes(filePath)) {
        score += 100;
      }

      // Files with high dependency counts get higher priority
      const dependencies = this.dependencies.get(filePath) || [];
      const reverseDependencies = this.reverseDependencies.get(filePath) || [];

      score += dependencies.length * 2; // Files it depends on
      score += reverseDependencies.length * 3; // Files depending on it

      // Files with recent refactoring get higher priority
      const gitInfo = this.gitHistory.get(filePath);
      if (gitInfo) {
        score += gitInfo.refactorProbability * 20;
        score += gitInfo.changeFrequency * 15;
      }

      priorityScores.set(filePath, score);
    }

    // Sort files by priority score (descending)
    return allFiles.sort(
      (a, b) => priorityScores.get(b) - priorityScores.get(a)
    );
  }

  /**
   * Get all files that are potentially affected by changes to a specific file
   * with detailed impact analysis
   */
  getAffectedFiles(filePath) {
    const affectedFiles = new Set([filePath]);
    const impactDetails = new Map();
    const queue = [filePath];

    // Add impact details for the original file
    impactDetails.set(filePath, {
      directDependencies: 0,
      reverseDependencies: 0,
      sharedVariables: [],
      impactScore: 1.0, // Max score for the file being changed
      impactPath: [filePath], // Path to show how this file is affected
    });

    // Breadth-first search to find all affected files
    while (queue.length > 0) {
      const currentFile = queue.shift();
      const currentImpact = impactDetails.get(currentFile);

      // Find all files that import this file (direct impact)
      const reverseDeps = this.reverseDependencies.get(currentFile) || [];

      for (const dependentFile of reverseDeps) {
        if (!affectedFiles.has(dependentFile)) {
          affectedFiles.add(dependentFile);
          queue.push(dependentFile);

          // Calculate impact details
          impactDetails.set(dependentFile, {
            directDependencies: 1,
            reverseDependencies: 0,
            sharedVariables: [],
            impactScore: currentImpact.impactScore * 0.9, // Slightly lower score for each level
            impactPath: [...currentImpact.impactPath, dependentFile],
          });
        }
      }

      // Check variables declared in this file to find usages in other files
      const fileInfo = this.files.get(currentFile);
      if (fileInfo) {
        for (const variable of fileInfo.variables.filter(
          (v) => v.declaration
        )) {
          const variableRefs = this.variables.get(variable.name) || [];

          for (const ref of variableRefs) {
            if (
              ref.filePath !== currentFile &&
              !affectedFiles.has(ref.filePath)
            ) {
              affectedFiles.add(ref.filePath);
              queue.push(ref.filePath);

              // Update impact details
              impactDetails.set(ref.filePath, {
                directDependencies: 0,
                reverseDependencies: 0,
                sharedVariables: [variable.name],
                impactScore: currentImpact.impactScore * 0.8, // Lower score for variable dependencies
                impactPath: [...currentImpact.impactPath, ref.filePath],
              });
            } else if (
              ref.filePath !== currentFile &&
              affectedFiles.has(ref.filePath)
            ) {
              // Update existing impact details with additional shared variables
              const existingImpact = impactDetails.get(ref.filePath);
              if (!existingImpact.sharedVariables.includes(variable.name)) {
                existingImpact.sharedVariables.push(variable.name);
                // Increase impact score slightly for each additional shared variable
                existingImpact.impactScore = Math.min(
                  0.95,
                  existingImpact.impactScore + 0.05
                );
              }
            }
          }
        }
      }
    }

    // Remove the original file from the results
    affectedFiles.delete(filePath);

    // Create an array with detailed impact information
    const result = Array.from(affectedFiles).map((file) => ({
      filePath: file,
      ...impactDetails.get(file),
    }));

    // Sort by impact score (highest first)
    return result.sort((a, b) => b.impactScore - a.impactScore);
  }

  /**
   * Find similar variable names to a given variable
   */
  findSimilarVariables(varName, threshold = 2) {
    const similarVars = [];

    for (const otherVarName of this.variables.keys()) {
      // Skip if it's the same variable
      if (otherVarName === varName) continue;

      // Calculate Levenshtein distance
      const distance = calculateLevenshteinDistance(varName, otherVarName);

      // Check for camelCase/snake_case variations
      const normalizedTarget = varName.toLowerCase().replace(/_/g, "");
      const normalizedName = otherVarName.toLowerCase().replace(/_/g, "");
      const isSimilarNormalized = normalizedTarget === normalizedName;

      // Check for prefix/suffix patterns
      const isPrefix =
        varName.startsWith(otherVarName) || otherVarName.startsWith(varName);
      const isSuffix =
        varName.endsWith(otherVarName) || otherVarName.endsWith(varName);

      // Check for plural/singular forms
      const isPlural =
        varName + "s" === otherVarName || otherVarName + "s" === varName;

      if (
        distance <= threshold ||
        isSimilarNormalized ||
        isPrefix ||
        isSuffix ||
        isPlural
      ) {
        similarVars.push({
          name: otherVarName,
          distance,
          references: this.variables.get(otherVarName) || [],
          similarity: this.calculateSimilarityScore(
            varName,
            otherVarName,
            distance
          ),
        });
      }
    }

    // Sort by similarity score (highest first)
    return similarVars.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate a similarity score between variable names
   */
  calculateSimilarityScore(varName1, varName2, distance) {
    // Start with Levenshtein distance-based similarity
    const maxLength = Math.max(varName1.length, varName2.length);
    let score = 1 - distance / maxLength;

    // Normalize case and underscores
    const normalized1 = varName1.toLowerCase().replace(/_/g, "");
    const normalized2 = varName2.toLowerCase().replace(/_/g, "");

    // Exact match after normalization is very high similarity
    if (normalized1 === normalized2) {
      score = Math.max(score, 0.9);
    }

    // Prefix/suffix relationships
    if (
      normalized1.startsWith(normalized2) ||
      normalized2.startsWith(normalized1)
    ) {
      score = Math.max(score, 0.8);
    }

    if (
      normalized1.endsWith(normalized2) ||
      normalized2.endsWith(normalized1)
    ) {
      score = Math.max(score, 0.7);
    }

    // Plural form
    if (
      normalized1 + "s" === normalized2 ||
      normalized2 + "s" === normalized1
    ) {
      score = Math.max(score, 0.85);
    }

    return score;
  }

  /**
   * Analyze a variable for potential issues with detailed explanation
   */
  async analyzeVariable(varName, filePath, issue, useAI = true) {
    // Create a cache key for this analysis
    const cacheKey = `${varName}:${filePath}:${JSON.stringify(issue)}`;

    // Check if we have a cached result
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey);
    }

    // Get all references to this variable
    const references = this.variables.get(varName) || [];

    // Find similar variables
    const similarVars = this.findSimilarVariables(varName);

    // Get git history for this file
    const gitInfo = this.gitHistory.get(filePath) || {
      commits: [],
      refactorProbability: 0,
      changeFrequency: 0,
    };

    // Prepare the analysis result
    const analysis = {
      varName,
      filePath,
      references,
      similarVariables: similarVars,
      gitHistory: gitInfo,
      analysisType: "UNKNOWN",
      confidence: 0.5,
      explanation: "",
      reasoning: [], // Steps that led to the conclusion
      recommendedAction: "UNKNOWN",
      possibleActions: [], // Multiple suggested actions with confidence scores
      aiAnalysis: null,
    };

    // Perform enhanced heuristic analysis
    this.performHeuristicAnalysis(analysis);

    // Use AI for deeper analysis if enabled
    if (useAI && config.USE_AI_FOR_UNUSED_VARS) {
      try {
        // Import the AI analyzer dynamically to avoid circular dependencies
        const variableAnalyzer = await import("./variable-analyzer.js");

        // Read file content
        const fileContent = fs.readFileSync(filePath, "utf8");

        // Get AI analysis
        const aiAnalysis = await variableAnalyzer.analyzeVariableUsage(
          fileContent,
          varName,
          issue,
          filePath,
          references,
          similarVars,
          gitInfo
        );

        // Incorporate AI analysis
        analysis.aiAnalysis = aiAnalysis;

        // If AI confidence is high, use its analysis
        if (aiAnalysis.confidence > 0.7) {
          analysis.analysisType = aiAnalysis.analysisType;
          analysis.confidence = aiAnalysis.confidence;
          analysis.explanation = aiAnalysis.explanation;
          analysis.reasoning = aiAnalysis.reasoning || analysis.reasoning;
          analysis.recommendedAction = aiAnalysis.recommendedAction;
          analysis.possibleActions =
            aiAnalysis.possibleActions || analysis.possibleActions;
        }
      } catch (error) {
        console.error(
          chalk.yellow(`Error during AI analysis: ${error.message}`)
        );
        // Continue with heuristic analysis
      }
    }

    // Cache the result
    this.analysisCache.set(cacheKey, analysis);

    // Record this analysis decision
    this.recordDecision(analysis);

    return analysis;
  }

  /**
   * Perform enhanced heuristic analysis on a variable without using AI
   */
  performHeuristicAnalysis(analysis) {
    const { varName, references, similarVariables, gitHistory } = analysis;

    // Start reasoning steps
    analysis.reasoning = [];

    // Check if there are any references to this variable
    if (references.length <= 1) {
      // Only the declaration exists, no usages
      analysis.reasoning.push(
        "The variable is declared but has no usages in the codebase"
      );
      analysis.analysisType = "GENUINE_UNUSED";
      analysis.confidence = 0.8;
      analysis.explanation =
        "No usages found for this variable in the entire project";
      analysis.recommendedAction = "PREFIX";

      // Add possible actions
      analysis.possibleActions = [
        {
          action: "PREFIX",
          description: `Add underscore: _${varName}`,
          confidence: 0.9,
        },
        {
          action: "REMOVE",
          description: "Remove the unused variable declaration",
          confidence: 0.7,
        },
      ];
    } else if (
      similarVariables.length > 0 &&
      similarVariables[0].similarity > 0.8
    ) {
      // Very similar variable exists, likely a typo
      const similarVar = similarVariables[0];
      analysis.reasoning.push(
        `Found very similar variable '${
          similarVar.name
        }' (similarity ${similarVar.similarity.toFixed(2)})`
      );
      analysis.reasoning.push(
        `The similar variable has ${similarVar.references.length} references across the codebase`
      );

      if (gitHistory.refactorProbability > 0.5) {
        analysis.reasoning.push(
          "The file was recently refactored, increasing likelihood of a renaming typo"
        );
      }

      analysis.analysisType = "TYPO";
      analysis.confidence = similarVar.similarity;
      analysis.explanation = `Very similar to '${
        similarVar.name
      }' (similarity ${similarVar.similarity.toFixed(2)})`;
      analysis.recommendedAction = "RENAME";

      // Add possible actions
      analysis.possibleActions = [
        {
          action: "RENAME",
          description: `Rename to '${similarVar.name}'`,
          confidence: similarVar.similarity,
        },
        {
          action: "PREFIX",
          description: `Add underscore: _${varName}`,
          confidence: 0.4,
        },
        {
          action: "KEEP",
          description: "Keep as separate variable",
          confidence: 0.3,
        },
      ];
    } else if (gitHistory.refactorProbability > 0.6) {
      // High probability of recent refactoring
      analysis.reasoning.push(
        `This file has a high refactoring probability (${gitHistory.refactorProbability.toFixed(
          2
        )})`
      );
      analysis.reasoning.push(
        "The refactoring history suggests this may be leftover code"
      );

      if (references.length === 1) {
        analysis.reasoning.push(
          "The variable is only declared, not used anywhere else"
        );
      } else {
        analysis.reasoning.push(
          `The variable has ${references.length} references, but may still be orphaned`
        );
      }

      analysis.analysisType = "REFACTOR_LEFTOVER";
      analysis.confidence = gitHistory.refactorProbability;
      analysis.explanation =
        "This file was recently refactored, variable may be a leftover";
      analysis.recommendedAction = "REMOVE";

      // Add possible actions
      analysis.possibleActions = [
        {
          action: "REMOVE",
          description: "Remove leftover code",
          confidence: gitHistory.refactorProbability,
        },
        {
          action: "PREFIX",
          description: `Add underscore: _${varName}`,
          confidence: 0.5,
        },
        {
          action: "KEEP",
          description: "Keep for potential future use",
          confidence: 0.3,
        },
      ];
    } else {
      // Further heuristics for edge cases
      if (varName.startsWith("_")) {
        analysis.reasoning.push(
          "Variable already starts with underscore, suggesting intentional unused variable"
        );
        analysis.analysisType = "INTENTIONAL_UNUSED";
        analysis.confidence = 0.75;
        analysis.explanation =
          "Variable is already prefixed with underscore, suggesting it's deliberately unused";
        analysis.recommendedAction = "KEEP";

        // Add possible actions
        analysis.possibleActions = [
          {
            action: "KEEP",
            description: "Keep as is (already has underscore)",
            confidence: 0.9,
          },
          {
            action: "REMOVE",
            description: "Remove if truly unneeded",
            confidence: 0.4,
          },
        ];
      } else {
        // Default case with nuanced confidence based on available data
        let confidenceScore = 0.6; // Base confidence

        if (references.length === 1) confidenceScore += 0.1;
        if (similarVariables.length === 0) confidenceScore += 0.1;

        analysis.reasoning.push(
          `Variable has ${references.length} references in codebase`
        );
        analysis.reasoning.push(
          `No clear refactoring pattern or similar variables detected`
        );

        analysis.analysisType = "GENUINE_UNUSED";
        analysis.confidence = confidenceScore;
        analysis.explanation =
          "No clear pattern detected, likely a genuinely unused variable";
        analysis.recommendedAction = "PREFIX";

        // Add possible actions
        analysis.possibleActions = [
          {
            action: "PREFIX",
            description: `Add underscore: _${varName}`,
            confidence: 0.8,
          },
          {
            action: "REMOVE",
            description: "Remove if not needed",
            confidence: 0.6,
          },
        ];
      }
    }
  }

  /**
   * Record a fix that was applied
   */
  recordFix(filePath, issue, fixType, details) {
    const fix = {
      id: `fix-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date(),
      filePath,
      issue,
      fixType,
      details,
      // Track additional metadata
      fileInfo: {
        dependencies: this.dependencies.get(filePath)?.length || 0,
        reverseDepCount: this.reverseDependencies.get(filePath)?.length || 0,
        hasGitHistory: this.gitHistory.has(filePath),
        refactorProbability:
          this.gitHistory.get(filePath)?.refactorProbability || 0,
      },
    };

    this.fixHistory.push(fix);

    // If configured, save fix history periodically
    if (config.SAVE_FIX_HISTORY && this.fixHistory.length % 10 === 0) {
      this.saveFixHistory();
    }

    // Track usage for monetization
    this.trackUsage("fix", {
      filePath,
      ruleId: issue.ruleId,
      fixType,
    });

    return fix.id;
  }

  /**
   * Record a rollback operation
   */
  recordRollback(fix) {
    const rollback = {
      timestamp: new Date(),
      originalFix: fix,
      reason: "Manual rollback",
      filePath: fix.filePath,
    };

    // Add to rollback history
    this.rollbackHistory = this.rollbackHistory || [];
    this.rollbackHistory.push(rollback);

    // Save rollback history
    this.saveRollbackHistory();

    // Track usage for monetization
    this.trackUsage("rollback", {
      filePath: fix.filePath,
      fixType: fix.fixType,
    });
  }

  /**
   * Save fix history to a file
   */
  saveFixHistory() {
    try {
      const historyDir = path.join(config.OUTPUT_DIR, "history");
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }

      const historyFile = path.join(historyDir, "fix-history.json");
      fs.writeFileSync(historyFile, JSON.stringify(this.fixHistory, null, 2));
    } catch (error) {
      console.error(chalk.yellow(`Error saving fix history: ${error.message}`));
    }
  }

  /**
   * Save rollback history to a file
   */
  saveRollbackHistory() {
    try {
      const historyDir = path.join(config.OUTPUT_DIR, "history");
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }

      const historyFile = path.join(historyDir, "rollback-history.json");
      fs.writeFileSync(
        historyFile,
        JSON.stringify(this.rollbackHistory || [], null, 2)
      );
    } catch (error) {
      console.error(
        chalk.yellow(`Error saving rollback history: ${error.message}`)
      );
    }
  }

  /**
   * Record an analysis decision for learning
   */
  recordDecision(analysis) {
    // Add to decision history
    this.decisionHistory.push({
      timestamp: new Date(),
      varName: analysis.varName,
      filePath: analysis.filePath,
      analysisType: analysis.analysisType,
      confidence: analysis.confidence,
      recommendedAction: analysis.recommendedAction,
      similarVariablesCount: analysis.similarVariables.length,
      referencesCount: analysis.references.length,
      gitRefactorProbability: analysis.gitHistory.refactorProbability,
    });

    // Limit history size
    if (this.decisionHistory.length > 1000) {
      this.decisionHistory = this.decisionHistory.slice(-1000);
    }

    // Save periodically
    if (this.decisionHistory.length % 50 === 0) {
      this.saveDecisionHistory();
    }

    // Track usage for monetization
    this.trackUsage("analysis", {
      filePath: analysis.filePath,
      analysisType: analysis.analysisType,
      confidence: analysis.confidence,
    });
  }

  /**
   * Save decision history to a file
   */
  saveDecisionHistory() {
    try {
      const historyDir = path.join(config.OUTPUT_DIR, "history");
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }

      const historyFile = path.join(historyDir, "decision-history.json");
      fs.writeFileSync(
        historyFile,
        JSON.stringify(this.decisionHistory, null, 2)
      );
    } catch (error) {
      console.error(
        chalk.yellow(`Error saving decision history: ${error.message}`)
      );
    }
  }

  /**
   * Load decision history from a file
   */
  async loadDecisionHistory() {
    try {
      const historyFile = path.join(
        config.OUTPUT_DIR,
        "history",
        "decision-history.json"
      );
      if (fs.existsSync(historyFile)) {
        const data = fs.readFileSync(historyFile, "utf8");
        this.decisionHistory = JSON.parse(data);
        if (config.VERBOSE) {
          console.log(
            chalk.gray(
              `Loaded ${this.decisionHistory.length} historical decisions`
            )
          );
        }
      }
    } catch (error) {
      console.error(
        chalk.yellow(`Error loading decision history: ${error.message}`)
      );
    }
  }

  /**
   * Load rollback history from a file
   */
  async loadRollbackHistory() {
    try {
      const historyFile = path.join(
        config.OUTPUT_DIR,
        "history",
        "rollback-history.json"
      );
      if (fs.existsSync(historyFile)) {
        const data = fs.readFileSync(historyFile, "utf8");
        this.rollbackHistory = JSON.parse(data);
        if (config.VERBOSE) {
          console.log(
            chalk.gray(`Loaded ${this.rollbackHistory.length} rollback records`)
          );
        }
      }
    } catch (error) {
      console.error(
        chalk.yellow(`Error loading rollback history: ${error.message}`)
      );
    }
  }

  /**
   * Create and manage team profiles
   */
  async loadTeamProfiles() {
    try {
      const profilesDir = path.join(config.OUTPUT_DIR, "team-profiles");
      if (fs.existsSync(profilesDir)) {
        const files = fs.readdirSync(profilesDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const profilePath = path.join(profilesDir, file);
            const profileData = JSON.parse(
              fs.readFileSync(profilePath, "utf8")
            );
            this.teamProfiles.set(profileData.id, profileData);
          }
        }

        if (config.VERBOSE) {
          console.log(
            chalk.gray(`Loaded ${this.teamProfiles.size} team profiles`)
          );
        }
      }
    } catch (error) {
      console.error(
        chalk.yellow(`Error loading team profiles: ${error.message}`)
      );
    }
  }

  /**
   * Create a team profile
   */
  createTeamProfile(profileData) {
    try {
      // Validate required fields
      const requiredFields = ["id", "name", "rules"];
      for (const field of requiredFields) {
        if (!profileData[field]) {
          throw new Error(`Team profile is missing required field: ${field}`);
        }
      }

      // Add timestamp
      profileData.created = profileData.created || new Date();
      profileData.updated = new Date();

      // Save to team profiles map
      this.teamProfiles.set(profileData.id, profileData);

      // Save to disk
      const profilesDir = path.join(config.OUTPUT_DIR, "team-profiles");
      if (!fs.existsSync(profilesDir)) {
        fs.mkdirSync(profilesDir, { recursive: true });
      }

      const profilePath = path.join(profilesDir, `${profileData.id}.json`);
      fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));

      console.log(
        chalk.green(
          `Created team profile: ${profileData.name} (${profileData.id})`
        )
      );

      // Track usage
      this.trackUsage("create_team_profile", { profileId: profileData.id });

      return true;
    } catch (error) {
      console.error(chalk.red(`Error creating team profile: ${error.message}`));
      return false;
    }
  }

  /**
   * Get a team profile by ID
   */
  getTeamProfile(profileId) {
    return this.teamProfiles.get(profileId);
  }

  /**
   * Apply a team profile to the current session
   */
  applyTeamProfile(profileId) {
    const profile = this.getTeamProfile(profileId);

    if (!profile) {
      console.error(chalk.red(`Team profile not found: ${profileId}`));
      return false;
    }

    console.log(
      chalk.blue(`Applying team profile: ${profile.name} (${profile.id})`)
    );

    // Apply team rules to current config
    if (profile.rules) {
      Object.assign(
        config.ERROR_CATEGORIES,
        profile.rules.errorCategories || {}
      );

      // Apply additional config overrides from the profile
      if (profile.rules.configOverrides) {
        Object.keys(profile.rules.configOverrides).forEach((key) => {
          config[key] = profile.rules.configOverrides[key];
        });
      }
    }

    // Track current team profile
    config.CURRENT_TEAM_PROFILE = profileId;

    console.log(chalk.green(`Applied team profile: ${profile.name}`));

    // Track usage
    this.trackUsage("apply_team_profile", { profileId });

    return true;
  }

  /**
   * Track usage for monetization and licensing
   */
  trackUsage(actionType, details = {}) {
    if (
      !config.PREMIUM_FEATURES &&
      actionType !== "fix" &&
      actionType !== "analysis"
    ) {
      // Skip detailed tracking for non-premium users except basic actions
      return;
    }

    // Create usage record
    const usageRecord = {
      timestamp: new Date(),
      actionType,
      details,
      userId: config.USER_ID,
      teamId: config.TEAM_ID,
      licenseKey: config.LICENSE_KEY,
    };

    // Add to usage history
    this.usageHistory = this.usageHistory || [];
    this.usageHistory.push(usageRecord);

    // If usage history gets too large, trim it
    if (this.usageHistory.length > 1000) {
      this.usageHistory = this.usageHistory.slice(-1000);
    }

    // Save periodically
    if (this.usageHistory.length % 10 === 0) {
      this.saveUsageHistory();
    }

    // Check for feature limitations based on plan
    if (config.PREMIUM_FEATURES && config.PLAN_LIMITS) {
      const planLimits = config.PLAN_LIMITS;

      // Check monthly usage limits
      if (planLimits.monthlyFixes && actionType === "fix") {
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        const monthlyFixCount = this.usageHistory.filter((record) => {
          const recordDate = new Date(record.timestamp);
          return (
            recordDate.getMonth() === currentMonth &&
            recordDate.getFullYear() === currentYear &&
            record.actionType === "fix"
          );
        }).length;

        if (monthlyFixCount > planLimits.monthlyFixes) {
          console.warn(
            chalk.yellow(
              `Monthly fix limit reached (${monthlyFixCount}/${planLimits.monthlyFixes}). ` +
                `Some premium features will be limited. Consider upgrading your plan.`
            )
          );

          // Set a flag that can be checked elsewhere in the code
          config.MONTHLY_LIMIT_REACHED = true;
        }
      }
    }
  }

  /**
   * Save usage history to a file
   */
  saveUsageHistory() {
    if (!config.PREMIUM_FEATURES) {
      return;
    }

    try {
      const historyDir = path.join(config.OUTPUT_DIR, "history");
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }

      const historyFile = path.join(historyDir, "usage-history.json");
      fs.writeFileSync(
        historyFile,
        JSON.stringify(this.usageHistory || [], null, 2)
      );
    } catch (error) {
      console.error(
        chalk.yellow(`Error saving usage history: ${error.message}`)
      );
    }
  }

  /**
   * Load usage history from a file
   */
  async loadUsageHistory() {
    if (!config.PREMIUM_FEATURES) {
      return;
    }

    try {
      const historyFile = path.join(
        config.OUTPUT_DIR,
        "history",
        "usage-history.json"
      );
      if (fs.existsSync(historyFile)) {
        const data = fs.readFileSync(historyFile, "utf8");
        this.usageHistory = JSON.parse(data);
      }
    } catch (error) {
      console.error(
        chalk.yellow(`Error loading usage history: ${error.message}`)
      );
    }
  }

  /**
   * Check license validity and features
   */
  checkLicense() {
    if (!config.LICENSE_KEY) {
      // No license key, run in free mode
      config.PREMIUM_FEATURES = false;
      config.TEAM_FEATURES = false;
      return {
        valid: true,
        plan: "free",
        features: ["basic_linting", "simple_patterns"],
      };
    }

    try {
      // In a real implementation, this would validate with a license server
      // For now, we'll use a simple check
      if (config.LICENSE_KEY.startsWith("pro-")) {
        config.PREMIUM_FEATURES = true;
        config.TEAM_FEATURES = false;
        return {
          valid: true,
          plan: "pro",
          features: [
            "basic_linting",
            "simple_patterns",
            "ai_analysis",
            "cross_file",
          ],
        };
      } else if (config.LICENSE_KEY.startsWith("team-")) {
        config.PREMIUM_FEATURES = true;
        config.TEAM_FEATURES = true;
        return {
          valid: true,
          plan: "team",
          features: [
            "basic_linting",
            "simple_patterns",
            "ai_analysis",
            "cross_file",
            "team_profiles",
            "usage_analytics",
          ],
        };
      } else if (config.LICENSE_KEY.startsWith("enterprise-")) {
        config.PREMIUM_FEATURES = true;
        config.TEAM_FEATURES = true;
        return {
          valid: true,
          plan: "enterprise",
          features: [
            "basic_linting",
            "simple_patterns",
            "ai_analysis",
            "cross_file",
            "team_profiles",
            "usage_analytics",
            "custom_languages",
            "priority_support",
          ],
        };
      } else {
        // Invalid license
        config.PREMIUM_FEATURES = false;
        config.TEAM_FEATURES = false;
        return {
          valid: false,
          plan: "invalid",
          features: ["basic_linting", "simple_patterns"],
        };
      }
    } catch (error) {
      console.error(chalk.red(`Error checking license: ${error.message}`));
      config.PREMIUM_FEATURES = false;
      config.TEAM_FEATURES = false;
      return {
        valid: false,
        error: error.message,
        plan: "error",
        features: ["basic_linting", "simple_patterns"],
      };
    }
  }

  /**
   * Create a checkpoint that can be reverted to later
   */
  createCheckpoint(name) {
    try {
      const checkpointData = {
        name,
        timestamp: new Date(),
        fileFingerprints: Array.from(this.fileFingerprints.entries()),
        fixHistoryLength: this.fixHistory.length,
      };

      // Create checkpoint directory
      const checkpointDir = path.join(config.CHECKPOINT_DIR, name);
      if (!fs.existsSync(checkpointDir)) {
        fs.mkdirSync(checkpointDir, { recursive: true });
      }

      // Save checkpoint metadata
      fs.writeFileSync(
        path.join(checkpointDir, "checkpoint.json"),
        JSON.stringify(checkpointData, null, 2)
      );

      // Save file backups
      for (const filePath of this.files.keys()) {
        if (fs.existsSync(filePath)) {
          const backupPath = path.join(checkpointDir, path.basename(filePath));
          fs.copyFileSync(filePath, backupPath);
        }
      }

      // Store checkpoint in memory
      this.checkpoints.set(name, checkpointData);

      console.log(chalk.green(`Created checkpoint: ${name}`));

      // Track usage
      this.trackUsage("create_checkpoint", { checkpointName: name });

      return true;
    } catch (error) {
      console.error(chalk.red(`Error creating checkpoint: ${error.message}`));
      return false;
    }
  }

  /**
   * Revert to a previously created checkpoint
   */
  revertToCheckpoint(name) {
    try {
      const checkpointDir = path.join(config.CHECKPOINT_DIR, name);

      // Verify checkpoint exists
      if (!fs.existsSync(checkpointDir)) {
        console.error(chalk.red(`Checkpoint not found: ${name}`));
        return false;
      }

      // Load checkpoint data
      const checkpointFile = path.join(checkpointDir, "checkpoint.json");
      if (!fs.existsSync(checkpointFile)) {
        console.error(
          chalk.red(`Checkpoint data not found: ${checkpointFile}`)
        );
        return false;
      }

      const checkpointData = JSON.parse(
        fs.readFileSync(checkpointFile, "utf8")
      );

      // Restore files from checkpoint
      for (const filePath of this.files.keys()) {
        const backupPath = path.join(checkpointDir, path.basename(filePath));
        if (fs.existsSync(backupPath)) {
          fs.copyFileSync(backupPath, filePath);
        }
      }

      // Restore fingerprints
      this.fileFingerprints = new Map(checkpointData.fileFingerprints);

      // Truncate fix history to checkpoint point
      if (this.fixHistory.length > checkpointData.fixHistoryLength) {
        // Record rollbacks for all the fixes being reverted
        const revertedFixes = this.fixHistory.slice(
          checkpointData.fixHistoryLength
        );

        for (const fix of revertedFixes) {
          this.recordRollback({
            ...fix,
            reason: `Reverted to checkpoint: ${name}`,
          });
        }

        // Truncate the history
        this.fixHistory = this.fixHistory.slice(
          0,
          checkpointData.fixHistoryLength
        );
        this.saveFixHistory();
      }

      console.log(chalk.green(`Reverted to checkpoint: ${name}`));

      // Track usage
      this.trackUsage("revert_checkpoint", { checkpointName: name });

      return true;
    } catch (error) {
      console.error(
        chalk.red(`Error reverting to checkpoint: ${error.message}`)
      );
      return false;
    }
  }

  /**
   * List all available checkpoints
   */
  listCheckpoints() {
    try {
      if (!fs.existsSync(config.CHECKPOINT_DIR)) {
        return [];
      }

      const checkpoints = fs
        .readdirSync(config.CHECKPOINT_DIR)
        .filter((name) => {
          const checkpointFile = path.join(
            config.CHECKPOINT_DIR,
            name,
            "checkpoint.json"
          );
          return fs.existsSync(checkpointFile);
        })
        .map((name) => {
          try {
            const checkpointFile = path.join(
              config.CHECKPOINT_DIR,
              name,
              "checkpoint.json"
            );
            const data = JSON.parse(fs.readFileSync(checkpointFile, "utf8"));
            return {
              name,
              timestamp: new Date(data.timestamp),
              fileCount:
                fs.readdirSync(path.join(config.CHECKPOINT_DIR, name)).length -
                1, // -1 for the checkpoint.json file
            };
          } catch (e) {
            return { name, error: e.message };
          }
        })
        .sort((a, b) => {
          // Sort by timestamp descending (newest first)
          if (a.timestamp && b.timestamp) {
            return b.timestamp - a.timestamp;
          }
          return 0;
        });

      return checkpoints;
    } catch (error) {
      console.error(chalk.red(`Error listing checkpoints: ${error.message}`));
      return [];
    }
  }

  /**
   * Add support for a new language
   */
  addLanguageSupport(extension) {
    if (!extension.startsWith(".")) {
      extension = "." + extension;
    }

    // Remove the dot for internal tracking
    const lang = extension.slice(1).toLowerCase();
    this.languageSupport.add(lang);

    console.log(chalk.green(`Added support for ${extension} files`));

    // Track usage
    this.trackUsage("add_language", { language: lang });

    // Re-initialize if already initialized
    if (this.initialized) {
      console.log(
        chalk.blue(
          "Re-initializing project context with new language support..."
        )
      );
      this.initialized = false;
      this.initialize();
    }
  }

  /**
   * Get statistics about fixes and analysis
   */
  getStats() {
    // Calculate decision statistics
    const decisionStats = {
      totalDecisions: this.decisionHistory.length,
      byType: {},
      byAction: {},
      averageConfidence: 0,
    };

    if (this.decisionHistory.length > 0) {
      // Calculate type breakdown
      decisionStats.byType = this.decisionHistory.reduce((acc, decision) => {
        acc[decision.analysisType] = (acc[decision.analysisType] || 0) + 1;
        return acc;
      }, {});

      // Calculate action breakdown
      decisionStats.byAction = this.decisionHistory.reduce((acc, decision) => {
        acc[decision.recommendedAction] =
          (acc[decision.recommendedAction] || 0) + 1;
        return acc;
      }, {});

      // Calculate average confidence
      decisionStats.averageConfidence =
        this.decisionHistory.reduce(
          (sum, decision) => sum + decision.confidence,
          0
        ) / this.decisionHistory.length;
    }

    // Calculate usage statistics
    const usageStats = {
      totalActions: this.usageHistory.length,
      byType: {},
      userCount: new Set(
        this.usageHistory.map((record) => record.userId).filter(Boolean)
      ).size,
      fixCount: this.usageHistory.filter(
        (record) => record.actionType === "fix"
      ).length,
      analysisCount: this.usageHistory.filter(
        (record) => record.actionType === "analysis"
      ).length,
    };

    if (this.usageHistory.length > 0) {
      usageStats.byType = this.usageHistory.reduce((acc, record) => {
        acc[record.actionType] = (acc[record.actionType] || 0) + 1;
        return acc;
      }, {});
    }

    // Calculate parallel processing statistics
    const parallelStats = {
      workerCount: this.determineOptimalWorkerCount(),
      totalWorkerTimeMs: this.processingStats.totalTimeMs,
      speedupFactor:
        this.processingStats.parallelEfficiency > 0
          ? 1 / this.processingStats.parallelEfficiency
          : 0,
      averageFileTimeMs: this.processingStats.averageFileTimeMs,
    };

    return {
      totalFiles: this.files.size,
      totalVariables: this.variables.size,
      totalFixes: this.fixHistory.length,
      fixesByType: this.fixHistory.reduce((acc, fix) => {
        acc[fix.fixType] = (acc[fix.fixType] || 0) + 1;
        return acc;
      }, {}),
      filesWithGitHistory: this.gitHistory.size,
      cacheSize: this.analysisCache.size,
      processingStats: this.processingStats,
      decisionStats,
      usageStats,
      parallelStats,
      languageSupport: Array.from(this.languageSupport),
      teamProfiles: this.teamProfiles.size,
      rollbacks: this.rollbackHistory?.length || 0,
      checkpoints: this.checkpoints.size,
    };
  }

  /**
   * Shutdown and cleanup resources
   */
  async shutdown() {
    // Terminate all workers
    for (const [id, worker] of this.workers.entries()) {
      worker.terminate();
      this.workers.delete(id);
    }

    // Save any pending data
    this.saveFixHistory();
    this.saveDecisionHistory();
    this.saveRollbackHistory();
    this.saveUsageHistory();

    console.log(chalk.blue("Project context resources cleaned up"));
  }
}

/**
 * Singleton instance of the ProjectContext
 */
let projectContextInstance = null;

/**
 * Get the project context instance, creating it if it doesn't exist
 */
export async function getProjectContext(rootDir = config.TARGET_DIR) {
  if (!projectContextInstance) {
    projectContextInstance = new ProjectContext(rootDir);
    await projectContextInstance.initialize();
  }

  return projectContextInstance;
}

/**
 * Explicitly initialize project context (useful for startup)
 */
export async function initializeProjectContext(rootDir = config.TARGET_DIR) {
  const context = await getProjectContext(rootDir);
  return context;
}

/**
 * Clean up resources when shutting down
 */
export async function shutdownProjectContext() {
  if (projectContextInstance) {
    await projectContextInstance.shutdown();
    projectContextInstance = null;
  }
}
