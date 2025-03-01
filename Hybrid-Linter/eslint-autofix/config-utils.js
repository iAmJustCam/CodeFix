// config-utils.js
import chalk from "chalk";
import { execSync } from "child_process";
import fs from "fs";
import ora from "ora";
import path from "path";
import { config } from "./state.js";

export function validateEnvironment() {
  // Check for required dependencies and configurations
  if (!config.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY not found. Please add it to your .env file."
    );
  }

  try {
    // Verify ESLint is installed
    execSync("npx eslint --version", { stdio: "ignore" });

    // Verify TypeScript files exist
    const testResult = execSync(
      `find "${config.TARGET_DIR}" -name "*.ts" -o -name "*.tsx" | head -n 1`,
      { encoding: "utf-8" }
    );

    if (!testResult.trim()) {
      throw new Error(`No TypeScript files found in ${config.TARGET_DIR}`);
    }

    // Verify ESLint config exists
    let hasESLintConfig = false;
    const configFiles = [
      ".eslintrc.js",
      ".eslintrc.json",
      ".eslintrc.yml",
      ".eslintrc",
      "eslint.config.js",
      "eslint.config.mjs",
      "eslint.config.cjs",
    ];

    for (const file of configFiles) {
      if (fs.existsSync(path.join(config.TARGET_DIR, file))) {
        hasESLintConfig = true;
        break;
      }
    }

    if (!hasESLintConfig) {
      console.warn(
        chalk.yellow(
          "⚠️ No ESLint configuration found. Using default settings."
        )
      );
    }
  } catch (error) {
    throw new Error(`Dependency check failed: ${error.message}`);
  }
}

export function ensureESLintConfig() {
  const spinner = ora({
    text: chalk.blue("Checking ESLint configuration..."),
    color: "blue",
  }).start();

  // Check for existing ESLint config files
  const configFiles = [
    ".eslintrc.js",
    ".eslintrc.json",
    ".eslintrc.yml",
    ".eslintrc",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
  ];

  let hasConfig = false;
  let isNewConfigFormat = false;
  let configFile = "";

  for (const file of configFiles) {
    if (fs.existsSync(path.join(config.TARGET_DIR, file))) {
      hasConfig = true;
      configFile = file;
      isNewConfigFormat = file.startsWith("eslint.config");
      break;
    }
  }

  // Get ESLint version to determine which format to use
  let eslintVersion = "8.0.0"; // Default assumption
  try {
    const versionOutput = execSync("npx eslint --version", {
      encoding: "utf-8",
    });
    const versionMatch = versionOutput.match(/v(\d+\.\d+\.\d+)/);
    if (versionMatch && versionMatch[1]) {
      eslintVersion = versionMatch[1];
    }
  } catch (e) {
    // Ignore errors and use default version
  }

  const majorVersion = parseInt(eslintVersion.split(".")[0], 10);
  const useNewFormat = majorVersion >= 9;

  if (!hasConfig) {
    spinner.warn(
      chalk.yellow(
        `No ESLint configuration found. Creating a basic one for ESLint v${eslintVersion}...`
      )
    );

    if (useNewFormat) {
      // Create a new format config (eslint.config.js) for v9+
      const configContent = `
// eslint.config.js
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';

export default [
  {
    plugins: {
      '@typescript-eslint': typescript,
      'react': reactPlugin
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      'react/prop-types': 'off'
    }
  }
];`;

      fs.writeFileSync(
        path.join(config.TARGET_DIR, "eslint.config.js"),
        configContent
      );
    } else {
      // Create an old format config (.eslintrc.json) for v8 and below
      const eslintConfig = {
        parser: "@typescript-eslint/parser",
        parserOptions: {
          ecmaVersion: 2020,
          sourceType: "module",
          ecmaFeatures: {
            jsx: true,
          },
        },
        settings: {
          react: {
            version: "detect",
          },
        },
        extends: [
          "eslint:recommended",
          "plugin:@typescript-eslint/recommended",
          "plugin:react/recommended",
        ],
        rules: {
          "no-unused-vars": "off",
          "@typescript-eslint/no-unused-vars": [
            "warn",
            {
              argsIgnorePattern: "^_",
              varsIgnorePattern: "^_",
            },
          ],
          "react/prop-types": "off",
        },
      };

      fs.writeFileSync(
        path.join(config.TARGET_DIR, ".eslintrc.json"),
        JSON.stringify(eslintConfig, null, 2)
      );
    }

    // Check if necessary packages are installed in the target directory
    spinner.text = chalk.blue("Checking for required ESLint packages...");

    try {
      // Try to resolve required packages
      const packageJsonPath = path.join(config.TARGET_DIR, "package.json");
      let packageJson = {};

      if (fs.existsSync(packageJsonPath)) {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      }

      const devDependencies = packageJson.devDependencies || {};
      const dependencies = packageJson.dependencies || {};

      const requiredPackages = [
        "eslint",
        "@typescript-eslint/eslint-plugin",
        "@typescript-eslint/parser",
        "eslint-plugin-react",
      ];

      const missingPackages = requiredPackages.filter(
        (pkg) => !devDependencies[pkg] && !dependencies[pkg]
      );

      if (missingPackages.length > 0) {
        spinner.warn(
          chalk.yellow(
            `Missing required ESLint packages. Using locally installed ones for this run.`
          )
        );
      } else {
        spinner.succeed(
          chalk.green(
            `ESLint configuration created successfully using ${
              useNewFormat ? "new" : "legacy"
            } format`
          )
        );
      }
    } catch (error) {
      spinner.warn(chalk.yellow(`Error checking packages: ${error.message}`));
    }
  } else {
    // Check if we need to migrate from old format to new format
    if (useNewFormat && !isNewConfigFormat) {
      spinner.warn(
        chalk.yellow(
          `Found ${configFile} but ESLint v${eslintVersion} prefers eslint.config.js format. Consider migrating.`
        )
      );
      spinner.succeed(chalk.green("Using existing ESLint configuration"));
    } else {
      spinner.succeed(
        chalk.green(`Found existing ESLint configuration (${configFile})`)
      );
    }
  }
}
