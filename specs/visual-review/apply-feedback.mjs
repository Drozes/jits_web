#!/usr/bin/env node
// Apply screen-inventory feedback pins as Claude Code edits.
//
// Usage:
//   node specs/visual-review/apply-feedback.mjs                     # start server + open browser
//   node specs/visual-review/apply-feedback.mjs --port 4000         # custom port
//   node specs/visual-review/apply-feedback.mjs <feedback.json>     # legacy CLI mode
//
// Legacy CLI options:
//   --dry-run       Print prompts without invoking claude
//   --pin <id>      Only process a single pin by id
//   --yes           Skip per-pin confirmation
//   --batch         Send all pins in one prompt instead of one-per-pin
//   --claude <cmd>  Override claude binary (default: "claude")
//
// The input JSON is produced by the "Export JSON" button in
// specs/visual-review/screen-inventory.html.

import { readFileSync, existsSync } from "node:fs";
import { spawnSync, spawn as spawnAsync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 20).join("\n"));
  process.exit(0);
}

// ─── Launcher mode (no JSON file argument) ───────────────────────────────────
const hasJsonArg = args.some((a) => !a.startsWith("--") && !["--port", "--pin", "--claude"].includes(args[args.indexOf(a) - 1]) && existsSync(resolve(a)));

if (!hasJsonArg) {
  const portIdx = args.indexOf("--port");
  const port = portIdx !== -1 ? args[portIdx + 1] : "3847";
  const serverPath = join(__dirname, "feedback-server.mjs");

  console.log(`\n  Starting feedback server on port ${port}...`);
  const server = spawnAsync("node", [serverPath, "--port", port], {
    stdio: "inherit",
    cwd: join(__dirname, "../.."),
  });

  server.on("error", (err) => {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  });

  // Give server a moment to start, then open browser
  setTimeout(() => {
    const url = `http://localhost:${port}/screen-inventory.html`;
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    spawnAsync(opener, [url], { stdio: "ignore" });
    console.log(`  Opened ${url}\n`);
  }, 800);

  process.on("SIGINT", () => { server.kill(); process.exit(0); });
  process.on("SIGTERM", () => { server.kill(); process.exit(0); });

  // Keep process alive
  // eslint-disable-next-line no-constant-condition
  await new Promise(() => {});
}

// ─── Legacy CLI mode ─────────────────────────────────────────────────────────

const flags = {
  dryRun: args.includes("--dry-run"),
  yes: args.includes("--yes"),
  batch: args.includes("--batch"),
};
const pinId = args.includes("--pin") ? args[args.indexOf("--pin") + 1] : null;
const claudeCmd = args.includes("--claude") ? args[args.indexOf("--claude") + 1] : "claude";
const jsonPath = resolve(args.find((a) => !a.startsWith("--") && !["--pin", "--claude"].includes(args[args.indexOf(a) - 1])));

if (!existsSync(jsonPath)) {
  console.error(`File not found: ${jsonPath}`);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(jsonPath, "utf8"));
if (!payload.pins || !Array.isArray(payload.pins)) {
  console.error("Invalid feedback file: expected { pins: [...] }");
  process.exit(1);
}

let pins = payload.pins.filter((p) => (p.text || "").trim().length > 0 || (p.messages || []).some(m => m.role === 'user'));
if (pinId) pins = pins.filter((p) => p.id === pinId);

if (!pins.length) {
  console.log("No pins with text to process.");
  process.exit(0);
}

console.log(`Loaded ${pins.length} pin(s) from ${jsonPath}`);
console.log(`Source: ${payload.source || "unknown"} · Exported: ${payload.exportedAt || "unknown"}\n`);

function buildPinPrompt(pin) {
  const loc = `${(pin.xPct * 100).toFixed(1)}%, ${(pin.yPct * 100).toFixed(1)}%`;
  const feedbackText = pin.messages?.find(m => m.role === 'user')?.text || pin.text || '';
  const target = pin.componentPath
    ? `Target component: ${pin.componentPath}`
    : `No component path provided. Locate the component rendering the screen "${pin.screenTitle}" at route ${pin.screenRoute || "(unknown)"} and edit it.`;
  return [
    `You are processing a design feedback pin from the JITS Web screen inventory.`,
    ``,
    `Screen: ${pin.screenTitle}`,
    `Route: ${pin.screenRoute || "(unknown)"}`,
    `Pin location on wireframe (relative to screen card): ${loc}`,
    target,
    ``,
    `Feedback:`,
    feedbackText,
    ``,
    `Apply the requested change. Follow project conventions in CLAUDE.md. If the feedback is ambiguous, ask one clarifying question instead of guessing.`,
  ].join("\n");
}

function buildBatchPrompt(pins) {
  const header = [
    `You are processing ${pins.length} design feedback pins from the JITS Web screen inventory.`,
    `Apply each one. Follow project conventions in CLAUDE.md. If any pin is ambiguous, list it with a clarifying question rather than guessing.`,
    ``,
    `---`,
  ].join("\n");
  const body = pins
    .map((pin, i) => {
      const loc = `${(pin.xPct * 100).toFixed(1)}%, ${(pin.yPct * 100).toFixed(1)}%`;
      const feedbackText = pin.messages?.find(m => m.role === 'user')?.text || pin.text || '';
      return [
        ``,
        `## Pin ${i + 1} --- ${pin.screenTitle}`,
        `Route: ${pin.screenRoute || "(unknown)"}`,
        `Location: ${loc}`,
        `Component: ${pin.componentPath || "(unspecified --- please locate)"}`,
        ``,
        `Feedback: ${feedbackText}`,
        ``,
        `---`,
      ].join("\n");
    })
    .join("");
  return header + body;
}

async function confirm(question) {
  if (flags.yes) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(`${question} [y/N] `, (a) => { rl.close(); r(a.trim().toLowerCase() === "y"); }));
}

function runClaude(prompt) {
  if (flags.dryRun) {
    console.log("--- PROMPT ---");
    console.log(prompt);
    console.log("--- END PROMPT ---\n");
    return;
  }
  const result = spawnSync(claudeCmd, ["-p", prompt], { stdio: "inherit" });
  if (result.error) {
    console.error(`Failed to invoke ${claudeCmd}: ${result.error.message}`);
    process.exit(1);
  }
}

if (flags.batch) {
  const prompt = buildBatchPrompt(pins);
  const ok = await confirm(`Send all ${pins.length} pins in one batch prompt?`);
  if (ok) runClaude(prompt);
  process.exit(0);
}

for (const pin of pins) {
  const feedbackText = pin.messages?.find(m => m.role === 'user')?.text || pin.text || '';
  console.log(`\n[${pin.id}] ${pin.screenTitle} --- ${feedbackText.slice(0, 80)}${feedbackText.length > 80 ? '...' : ''}`);
  const ok = await confirm("Process this pin?");
  if (!ok) { console.log("Skipped."); continue; }
  runClaude(buildPinPrompt(pin));
}
