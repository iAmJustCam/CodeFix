import assert from "assert";
import fs from "fs";
import path from "path";
import {
  createCheckpoint,
  revertToCheckpoint,
} from "../../../rollback-utils.js";
import { config } from "../../../state.js";

describe("Rollback Utils", () => {
  let tempDir;
  let testFile;

  before(() => {
    // Create a temporary directory for testing
    tempDir = path.join(process.cwd(), "tests", "temp");
    config.CHECKPOINT_DIR = path.join(tempDir, "checkpoints");

    // Create the test directories if they don't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    if (!fs.existsSync(config.CHECKPOINT_DIR)) {
      fs.mkdirSync(config.CHECKPOINT_DIR, { recursive: true });
    }

    // Create a test file
    testFile = path.join(tempDir, "rollback-test.ts");
    fs.writeFileSync(testFile, "const originalContent = true;");
  });

  it("should create and revert checkpoints", async () => {
    // Setup: create file with original content
    fs.writeFileSync(testFile, "const originalContent = true;");

    // Create a checkpoint
    await createCheckpoint("test-checkpoint");

    // Modify the file
    fs.writeFileSync(testFile, "const modifiedContent = true;");

    // Verify file was modified
    let content = fs.readFileSync(testFile, "utf8");
    assert.strictEqual(content, "const modifiedContent = true;");

    // Revert to checkpoint
    await revertToCheckpoint("test-checkpoint");

    // Verify file was restored
    content = fs.readFileSync(testFile, "utf8");
    assert.strictEqual(content, "const originalContent = true;");
  });

  after(() => {
    // Clean up
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error("Failed to clean up test directory:", e);
    }
  });
});
