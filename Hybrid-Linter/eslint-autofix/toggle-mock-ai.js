// toggle-mock-ai.js
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env");

// Read current .env file
let envContent = "";
try {
  envContent = fs.readFileSync(envPath, "utf8");
} catch (e) {
  // File doesn't exist, create a new one
}

// Parse current setting
const currentSetting = envContent.match(/USE_MOCK_AI_FOR_TESTING=(true|false)/);
const isCurrentlyMock = currentSetting ? currentSetting[1] === "true" : false;

// Toggle the setting
const newSetting = !isCurrentlyMock;

// Update or add the setting
if (currentSetting) {
  envContent = envContent.replace(
    /USE_MOCK_AI_FOR_TESTING=(true|false)/,
    `USE_MOCK_AI_FOR_TESTING=${newSetting}`
  );
} else {
  envContent += `\nUSE_MOCK_AI_FOR_TESTING=${newSetting}`;
}

// Write back to .env file
fs.writeFileSync(envPath, envContent);

console.log(
  `AI testing mode set to: ${
    newSetting ? "MOCK (no API calls)" : "REAL (uses API calls)"
  }`
);
