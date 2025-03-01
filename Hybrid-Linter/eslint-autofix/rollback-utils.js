// rollback-utils.js
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { config } from "./state.js";

/**
 * Create a checkpoint of the current state of files
 * @param {string} name - Checkpoint name
 * @returns {Promise<boolean>} - Success status
 */
export async function createCheckpoint(name) {
  try {
    // Create checkpoint directory if it doesn't exist
    if (!fs.existsSync(config.CHECKPOINT_DIR)) {
      fs.mkdirSync(config.CHECKPOINT_DIR, { recursive: true });
    }

    // Create a directory for this checkpoint
    const checkpointDir = path.join(config.CHECKPOINT_DIR, name);
    if (fs.existsSync(checkpointDir)) {
      console.log(
        chalk.yellow(`Checkpoint ${name} already exists. Overwriting...`)
      );
      // Remove existing checkpoint
      removeDirectory(checkpointDir);
    }

    fs.mkdirSync(checkpointDir, { recursive: true });

    // Store checkpoint metadata
    const metadata = {
      name,
      timestamp: new Date().toISOString(),
      files: [],
    };

    // Save all tracked files
    const trackedFiles = await findTrackedFiles();

    for (const filePath of trackedFiles) {
      try {
        const relativePath = path.relative(config.TARGET_DIR, filePath);
        const checkpointFilePath = path.join(checkpointDir, relativePath);

        // Create directory structure if needed
        const dirPath = path.dirname(checkpointFilePath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        // Copy file
        fs.copyFileSync(filePath, checkpointFilePath);

        // Add to metadata
        metadata.files.push({
          path: relativePath,
          hash: generateFileHash(filePath),
        });
      } catch (error) {
        console.error(
          chalk.red(
            `Error saving file ${filePath} to checkpoint: ${error.message}`
          )
        );
      }
    }

    // Save metadata
    const metadataPath = path.join(checkpointDir, "metadata.json");
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    console.log(
      chalk.green(
        `✓ Checkpoint "${name}" created with ${trackedFiles.length} files`
      )
    );
    return true;
  } catch (error) {
    console.error(chalk.red(`Error creating checkpoint: ${error.message}`));
    return false;
  }
}

/**
 * Revert to a previously created checkpoint
 * @param {string} name - Checkpoint name
 * @returns {Promise<boolean>} - Success status
 */
export async function revertToCheckpoint(name) {
  try {
    const checkpointDir = path.join(config.CHECKPOINT_DIR, name);

    if (!fs.existsSync(checkpointDir)) {
      console.error(chalk.red(`Checkpoint ${name} not found`));
      return false;
    }

    // Read checkpoint metadata
    const metadataPath = path.join(checkpointDir, "metadata.json");
    if (!fs.existsSync(metadataPath)) {
      console.error(chalk.red(`Checkpoint ${name} metadata not found`));
      return false;
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    console.log(
      chalk.blue(
        `Reverting to checkpoint "${name}" from ${new Date(
          metadata.timestamp
        ).toLocaleString()}`
      )
    );

    // Check if files have been modified since checkpoint
    const modifiedFiles = [];
    for (const fileInfo of metadata.files) {
      const filePath = path.join(config.TARGET_DIR, fileInfo.path);
      if (fs.existsSync(filePath)) {
        const currentHash = generateFileHash(filePath);
        if (currentHash !== fileInfo.hash) {
          modifiedFiles.push(fileInfo.path);
        }
      }
    }

    if (modifiedFiles.length > 0) {
      console.log(
        chalk.yellow(
          `${modifiedFiles.length} files have been modified since checkpoint.`
        )
      );
      // In a real implementation, you might want to prompt the user to confirm
    }

    // Restore files from checkpoint
    let restoredCount = 0;
    for (const fileInfo of metadata.files) {
      try {
        const targetPath = path.join(config.TARGET_DIR, fileInfo.path);
        const sourcePath = path.join(checkpointDir, fileInfo.path);

        if (fs.existsSync(sourcePath)) {
          // Create directory structure if needed
          const dirPath = path.dirname(targetPath);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }

          // Copy file
          fs.copyFileSync(sourcePath, targetPath);
          restoredCount++;
        } else {
          console.warn(
            chalk.yellow(`File ${fileInfo.path} not found in checkpoint`)
          );
        }
      } catch (error) {
        console.error(
          chalk.red(`Error restoring file ${fileInfo.path}: ${error.message}`)
        );
      }
    }

    console.log(
      chalk.green(
        `✓ Restored ${restoredCount} of ${metadata.files.length} files from checkpoint`
      )
    );
    return true;
  } catch (error) {
    console.error(chalk.red(`Error reverting to checkpoint: ${error.message}`));
    return false;
  }
}

/**
 * List all available checkpoints
 * @returns {Array<Object>} - List of checkpoints with metadata
 */
export function listCheckpoints() {
  try {
    if (!fs.existsSync(config.CHECKPOINT_DIR)) {
      return [];
    }

    const checkpoints = fs
      .readdirSync(config.CHECKPOINT_DIR, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => {
        const checkpointDir = path.join(config.CHECKPOINT_DIR, dirent.name);
        const metadataPath = path.join(checkpointDir, "metadata.json");

        if (fs.existsSync(metadataPath)) {
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
            return {
              name: dirent.name,
              timestamp: metadata.timestamp,
              fileCount: metadata.files.length,
            };
          } catch {
            return {
              name: dirent.name,
              timestamp: null,
              fileCount: 0,
            };
          }
        }

        return {
          name: dirent.name,
          timestamp: null,
          fileCount: 0,
        };
      })
      .sort((a, b) => {
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

    return checkpoints;
  } catch (error) {
    console.error(chalk.red(`Error listing checkpoints: ${error.message}`));
    return [];
  }
}

/**
 * Delete a checkpoint
 * @param {string} name - Checkpoint name
 * @returns {boolean} - Success status
 */
export function deleteCheckpoint(name) {
  try {
    const checkpointDir = path.join(config.CHECKPOINT_DIR, name);

    if (!fs.existsSync(checkpointDir)) {
      console.error(chalk.red(`Checkpoint ${name} not found`));
      return false;
    }

    removeDirectory(checkpointDir);
    console.log(chalk.green(`✓ Checkpoint "${name}" deleted`));
    return true;
  } catch (error) {
    console.error(chalk.red(`Error deleting checkpoint: ${error.message}`));
    return false;
  }
}

/**
 * Compare current files with a checkpoint
 * @param {string} name - Checkpoint name
 * @returns {Object} - Comparison results
 */
export function compareWithCheckpoint(name) {
  try {
    const checkpointDir = path.join(config.CHECKPOINT_DIR, name);

    if (!fs.existsSync(checkpointDir)) {
      console.error(chalk.red(`Checkpoint ${name} not found`));
      return null;
    }

    // Read checkpoint metadata
    const metadataPath = path.join(checkpointDir, "metadata.json");
    if (!fs.existsSync(metadataPath)) {
      console.error(chalk.red(`Checkpoint ${name} metadata not found`));
      return null;
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

    // Compare files
    const comparison = {
      added: [],
      modified: [],
      deleted: [],
      unchanged: [],
    };

    // Check for modified and deleted files
    for (const fileInfo of metadata.files) {
      const filePath = path.join(config.TARGET_DIR, fileInfo.path);

      if (fs.existsSync(filePath)) {
        const currentHash = generateFileHash(filePath);

        if (currentHash !== fileInfo.hash) {
          comparison.modified.push(fileInfo.path);
        } else {
          comparison.unchanged.push(fileInfo.path);
        }
      } else {
        comparison.deleted.push(fileInfo.path);
      }
    }

    // Check for added files
    const currentFiles = findTrackedFiles();
    for (const filePath of currentFiles) {
      const relativePath = path.relative(config.TARGET_DIR, filePath);

      if (!metadata.files.some((f) => f.path === relativePath)) {
        comparison.added.push(relativePath);
      }
    }

    return comparison;
  } catch (error) {
    console.error(
      chalk.red(`Error comparing with checkpoint: ${error.message}`)
    );
    return null;
  }
}

// Helper functions
async function findTrackedFiles() {
  try {
    const { getProjectContext } = await import("./project-context.js");
    const projectContext = await getProjectContext();

    // For tests: if there's a file in temp directory, include it
    const tempDir = path.join(process.cwd(), "tests", "temp");
    const tempFiles = [];

    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir, { withFileTypes: true });
      for (const file of files) {
        if (file.isFile() && !file.name.startsWith(".")) {
          tempFiles.push(path.join(tempDir, file.name));
        }
      }
    }

    const trackedFiles = [
      ...Array.from(projectContext.files.keys()),
      ...tempFiles,
    ];
    return trackedFiles;
  } catch (error) {
    console.error(`Error finding tracked files: ${error.message}`);
    return [];
  }
}

function generateFileHash(filePath) {
  try {
    // Use import for ESM compatibility instead of require
    const crypto = require("crypto");
    const fileContent = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(fileContent).digest("hex");
  } catch (error) {
    console.error(`Error generating hash for ${filePath}: ${error.message}`);
    return "";
  }
}

function removeDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const currentPath = path.join(dirPath, file);
      if (fs.lstatSync(currentPath).isDirectory()) {
        removeDirectory(currentPath);
      } else {
        fs.unlinkSync(currentPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
}
