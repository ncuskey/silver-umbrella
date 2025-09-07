#!/usr/bin/env node

import fs from "node:fs";

/**
 * License check script for Hunspell dictionary files
 * Ensures that the required LICENSES.md file is present
 * before building the application.
 */

const LICENSES_PATH = "public/dicts/LICENSES.md";

if (!fs.existsSync(LICENSES_PATH)) {
  console.error("ERROR: Missing public/dicts/LICENSES.md");
  console.error("This file is required to comply with SCOWL and Hunspell licensing requirements.");
  console.error("Please ensure the licenses file is present before building.");
  process.exit(1);
}

console.log("✓ LICENSES.md present");

// Optional: Check if the file has content
const content = fs.readFileSync(LICENSES_PATH, "utf8");
if (content.trim().length === 0) {
  console.error("ERROR: LICENSES.md file is empty");
  process.exit(1);
}

console.log("✓ LICENSES.md has content");
console.log("License compliance check passed");
