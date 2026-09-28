#!/usr/bin/env node
// Bump the OTA criticality counter (apps/mobile/update-critical-index.json).
//
// Run ONLY before publishing a critical OTA (`npm run ota:critical`), then
// commit the bumped file before `eas update` so every later publish keeps the
// higher index. app.config.js exposes it as extra.updateCriticalIndex; a
// running app treats a downloaded update whose index is strictly greater than
// its own as critical (blocking restart prompt).
"use strict";

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "update-critical-index.json");

function fail(message) {
  console.error(`[ota:critical] ${message}`);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(FILE, "utf8");
} catch (err) {
  fail(`Cannot read ${FILE}: ${err.message}`);
}

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  fail(`${FILE} is not valid JSON: ${err.message}`);
}

const current = data && data.criticalIndex;
if (!Number.isSafeInteger(current) || current < 0) {
  fail(
    `${FILE} must contain {"criticalIndex": <non-negative integer>}, got ${JSON.stringify(current)}`,
  );
}

const next = current + 1;
fs.writeFileSync(FILE, `${JSON.stringify({ ...data, criticalIndex: next }, null, 2)}\n`);
console.log(`updateCriticalIndex: ${current} -> ${next}`);
