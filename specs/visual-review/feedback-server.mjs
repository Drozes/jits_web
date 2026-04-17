#!/usr/bin/env node
// Bridge server for conversational design feedback.
// Proxies between screen-inventory.html (browser) and Claude CLI.
//
// Usage:
//   node specs/visual-review/feedback-server.mjs [--port 3847]
//
// Endpoints:
//   GET  /                -> serves screen-inventory.html
//   GET  /<file>          -> serves static files from specs/visual-review/
//   GET  /api/status      -> { busy, activePin, serverVersion }
//   POST /api/chat        -> SSE stream of Claude responses
//   GET  /api/diff        -> { diff, files[] }
//   POST /api/accept      -> { ok, commitSha }
//   POST /api/reject      -> { ok, reverted[] }

import http from "node:http";
import { spawn, execSync } from "node:child_process";
import { readFileSync, existsSync, statSync, unlinkSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");
const SERVER_VERSION = "1.0.0";

const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const PORT = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3847;

// ─── State ───────────────────────────────────────────────────────────────────

let activeProcess = null;
let activePin = null;
let snapshotTaken = false;
let preDirtyFiles = new Set();
let preUntrackedFiles = new Set();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
}

function getDirtyFiles() {
  const out = git("diff --name-only");
  return new Set(out ? out.split("\n") : []);
}

function getUntrackedFiles() {
  const out = git("ls-files --others --exclude-standard");
  return new Set(out ? out.split("\n") : []);
}

function createSnapshot() {
  preDirtyFiles = getDirtyFiles();
  preUntrackedFiles = getUntrackedFiles();
  snapshotTaken = true;
}

function getClaudeChangedFiles() {
  if (!snapshotTaken) return { changed: [], created: [] };
  const nowDirty = getDirtyFiles();
  const nowUntracked = getUntrackedFiles();
  const changed = [...nowDirty].filter((f) => !preDirtyFiles.has(f));
  const created = [...nowUntracked].filter((f) => !preUntrackedFiles.has(f));
  return { changed, created };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// ─── Route Handlers ──────────────────────────────────────────────────────────

function handleStatus(req, res) {
  json(res, 200, {
    busy: activeProcess !== null,
    activePin: activePin,
    serverVersion: SERVER_VERSION,
  });
}

function handleChat(req, res) {
  if (activeProcess) {
    json(res, 409, { error: "busy", activePin });
    return;
  }

  readBody(req).then((body) => {
    const { pinId, sessionId, message, context } = body;
    if (!message || !message.trim()) {
      json(res, 400, { error: "Empty message" });
      return;
    }

    activePin = pinId;
    createSnapshot();

    const isFirstTurn = !sessionId;
    const sid = sessionId || randomUUID();
    let prompt;

    if (isFirstTurn) {
      const parts = [
        `You are reviewing a design feedback pin from the JITS Web screen inventory.`,
        ``,
        `Screen: ${context?.screenTitle || "(unknown)"}`,
        `Route: ${context?.screenRoute || "(unknown)"}`,
      ];
      if (context?.componentPath) {
        parts.push(`Target component: ${context.componentPath}`);
      } else {
        parts.push(`No component path specified. Locate the component for "${context?.screenTitle}" at route ${context?.screenRoute || "(unknown)"}.`);
      }
      if (context?.xPct != null) {
        parts.push(`Pin location on wireframe: ${(context.xPct * 100).toFixed(1)}%, ${(context.yPct * 100).toFixed(1)}%`);
      }
      parts.push(``, `Follow CLAUDE.md conventions. After making changes, briefly summarize what you changed and why.`);
      parts.push(``, `Feedback: ${message}`);
      prompt = parts.join("\n");
    } else {
      prompt = message;
    }

    const claudeArgs = [
      "-p", prompt,
      "--output-format", "stream-json",
      "--verbose",
      "--permission-mode", "acceptEdits",
    ];

    if (isFirstTurn) {
      claudeArgs.push("--session-id", sid);
    } else {
      claudeArgs.push("--resume", sid);
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const sendSSE = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendSSE("status", { sessionId: sid, state: "started" });

    const proc = spawn("claude", claudeArgs, {
      cwd: PROJECT_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeProcess = proc;

    let fullText = "";
    let stderrBuf = "";

    proc.stdout.on("data", (chunk) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);

          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text") {
                fullText += block.text;
                sendSSE("chunk", { type: "text", text: block.text });
              } else if (block.type === "tool_use") {
                sendSSE("chunk", {
                  type: "tool_use",
                  tool: block.name,
                  input: block.input,
                });
              }
            }
          } else if (event.type === "result") {
            if (event.result && event.result !== fullText) {
              fullText = event.result;
            }
            // Grab diff after Claude finishes
            try {
              const diff = git("diff");
              const { changed, created } = getClaudeChangedFiles();
              if (diff || created.length > 0) {
                sendSSE("diff", { diff, files: [...changed, ...created] });
              }
            } catch { /* no diff available */ }

            sendSSE("done", {
              sessionId: sid,
              cost: event.total_cost_usd,
              duration_ms: event.duration_ms,
              result: fullText,
            });
          }
        } catch {
          // non-JSON line, ignore
        }
      }
    });

    proc.stderr.on("data", (chunk) => {
      stderrBuf += chunk.toString();
    });

    proc.on("close", (code) => {
      activeProcess = null;
      activePin = null;
      if (code !== 0 && !res.writableEnded) {
        sendSSE("error", { message: stderrBuf || `Claude exited with code ${code}` });
      }
      if (!res.writableEnded) res.end();
    });

    proc.on("error", (err) => {
      activeProcess = null;
      activePin = null;
      sendSSE("error", { message: err.message });
      if (!res.writableEnded) res.end();
    });

    // Handle client disconnect
    req.on("close", () => {
      if (activeProcess === proc) {
        proc.kill("SIGTERM");
        activeProcess = null;
        activePin = null;
      }
    });
  }).catch((err) => {
    json(res, 400, { error: "Invalid request body: " + err.message });
  });
}

function handleDiff(req, res) {
  try {
    const { changed, created } = getClaudeChangedFiles();
    if (changed.length === 0 && created.length === 0) {
      json(res, 200, { diff: "", files: [] });
      return;
    }
    const diff = git("diff");
    json(res, 200, { diff, files: [...changed, ...created] });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
}

function handleAccept(req, res) {
  readBody(req).then((body) => {
    const { message } = body;
    try {
      const { changed, created } = getClaudeChangedFiles();
      const allFiles = [...changed, ...created];
      if (allFiles.length === 0) {
        json(res, 400, { error: "No changes to accept" });
        return;
      }

      for (const f of allFiles) {
        git(`add "${f}"`);
      }

      const commitMsg = message || "feedback: accepted design change";
      git(`commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
      const sha = git("rev-parse --short HEAD");

      // Reset snapshot to current state
      createSnapshot();

      json(res, 200, { ok: true, commitSha: sha });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  }).catch((err) => {
    json(res, 400, { error: "Invalid request body: " + err.message });
  });
}

function handleReject(req, res) {
  try {
    const { changed, created } = getClaudeChangedFiles();

    if (changed.length === 0 && created.length === 0) {
      json(res, 200, { ok: true, reverted: [] });
      return;
    }

    const reverted = [];

    if (changed.length > 0) {
      git(`checkout HEAD -- ${changed.map((f) => `"${f}"`).join(" ")}`);
      reverted.push(...changed);
    }

    for (const f of created) {
      const fullPath = join(PROJECT_ROOT, f);
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
        reverted.push(f);
      }
    }

    // Reset snapshot
    createSnapshot();

    json(res, 200, { ok: true, reverted });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
}

function handleCancel(req, res) {
  if (!activeProcess) {
    json(res, 400, { error: "No active process" });
    return;
  }
  activeProcess.kill("SIGTERM");
  activeProcess = null;
  activePin = null;
  json(res, 200, { ok: true });
}

function serveStatic(req, res) {
  let filePath = req.url === "/" ? "/screen-inventory.html" : req.url;
  filePath = filePath.split("?")[0];
  const fullPath = join(__dirname, filePath);

  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = extname(fullPath);
  const mime = MIME[ext] || "application/octet-stream";
  const content = readFileSync(fullPath);
  res.writeHead(200, {
    "Content-Type": mime,
    "Access-Control-Allow-Origin": "*",
  });
  res.end(content);
}

// ─── Router ──────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split("?")[0];

  if (url === "/api/status" && req.method === "GET") return handleStatus(req, res);
  if (url === "/api/chat" && req.method === "POST") return handleChat(req, res);
  if (url === "/api/diff" && req.method === "GET") return handleDiff(req, res);
  if (url === "/api/accept" && req.method === "POST") return handleAccept(req, res);
  if (url === "/api/reject" && req.method === "POST") return handleReject(req, res);
  if (url === "/api/cancel" && req.method === "POST") return handleCancel(req, res);

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  Feedback server running at http://localhost:${PORT}/`);
  console.log(`  Project root: ${PROJECT_ROOT}`);
  console.log(`  Press Ctrl+C to stop\n`);
});

process.on("SIGINT", () => {
  if (activeProcess) activeProcess.kill("SIGTERM");
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (activeProcess) activeProcess.kill("SIGTERM");
  server.close();
  process.exit(0);
});
