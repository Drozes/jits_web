#!/usr/bin/env node
// Canvas drift detector for the "ELO RATED Native Screens" design canvas.
//
// Report mode (default):
//   node design/native-screens/drift.mjs [--since <sha>] [--to <ref>] [--json]
//   Lists the "Current app" boards whose source files changed between --since (default:
//   the commit in last-sync.json) and --to (default: HEAD).
//   A changed screen file that no board claims ("unmapped") also counts as drift.
//   Exit codes: 0 no drift, 2 drift found (boards or unmapped screens), 1 error.
//
// Tag mode (run by .husky/post-commit in the background):
//   node design/native-screens/drift.mjs --tag [--commit <sha>]
//   Looks only at one commit (default HEAD; the hook passes the new commit's sha because
//   HEAD may move before a background run starts). If it touches any board, upserts ONE
//   open bead labeled "canvas-drift" (creates it, or appends a note naming the commit, the
//   boards, and any unmapped screen files). Never throws, never exits non-zero, and skips
//   silently when bd is not installed.
//   CANVAS_DRIFT_DRY_RUN=1 prints the bd commands it would run instead of running them.
//
// No dependencies: node built-ins and git only, so it runs in a fresh clone.

import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const MAP_PATH = join(HERE, "board-map.json");
const LAST_SYNC_PATH = join(HERE, "last-sync.json");
const BEAD_LABEL = "canvas-drift";
const BEAD_TITLE = "Canvas drift: native screens need sync";

// ---------------------------------------------------------------------------
// Glob matching. Hand-rolled on purpose instead of path.matchesGlob: expo-router
// paths contain "(group)" and "[param]" segments, which a real glob engine reads
// as syntax. Here only "**", "*" and "?" are special; everything else is literal.
//   "dir/**"   any file below dir        "**/x"  x at any depth
//   "*"        any run of chars except /  "?"     one char except /
// ---------------------------------------------------------------------------
const globCache = new Map();
function globToRegExp(glob) {
  if (globCache.has(glob)) return globCache.get(glob);
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slashAfter = glob[i + 2] === "/";
        const atSegmentStart = i === 0 || glob[i - 1] === "/";
        if (atSegmentStart && slashAfter) {
          re += "(?:.*/)?"; // "**/" matches zero or more whole directories
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  const out = new RegExp("^" + re + "$");
  globCache.set(glob, out);
  return out;
}
const matchesAny = (file, globs) => globs.some((g) => globToRegExp(g).test(file));

// ---------------------------------------------------------------------------
// git helpers
// ---------------------------------------------------------------------------
// core.quotePath=false keeps non-ASCII paths literal; path listings also use -z.
function git(args, { allowFail = false } = {}) {
  const r = spawnSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    if (allowFail) return null;
    const msg = (r.stderr || (r.error && r.error.message) || "").trim();
    throw new Error(`git ${args.join(" ")} failed: ${msg}`);
  }
  return r.stdout;
}
const lines = (s) => (s || "").split("\n").map((l) => l.trim()).filter(Boolean);
const zlist = (s) => (s || "").split("\0").filter(Boolean);
const literal = (files) => files.map((f) => `:(literal)${f}`);

// The subset of `files` that exist in the tree of `ref`.
function existingAt(ref, files) {
  if (!files.length) return [];
  return zlist(git(["ls-tree", "-r", "-z", "--name-only", ref, "--", ...literal(files)]));
}

function resolveCommit(ref) {
  const sha = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { allowFail: true });
  if (!sha) {
    throw new Error(
      `cannot resolve "${ref}" to a commit in this checkout` +
        " (a shallow clone may be missing it: run `git fetch --unshallow`)",
    );
  }
  return sha.trim();
}

// ---------------------------------------------------------------------------
// Core: changed files -> affected boards
// ---------------------------------------------------------------------------
function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function analyze(map, changedFiles) {
  const ignore = map.ignore || [];
  const files = changedFiles.filter((f) => !matchesAny(f, ignore));
  const globalHits = files.filter((f) => matchesAny(f, map.global || []));
  const boards = [];
  const mapped = new Set(globalHits);
  for (const [file, info] of Object.entries(map.boards)) {
    const hits = files.filter((f) => matchesAny(f, info.sources));
    hits.forEach((f) => mapped.add(f));
    if (hits.length || globalHits.length) {
      boards.push({ file, title: info.title, files: hits, via_global: globalHits.length > 0 });
    }
  }
  // Changed screen code that no board claims: a new screen, or a gap in board-map.json.
  // "undrawn" lists known screens with no board (admin subpages, redirects), so they stay quiet.
  const undrawn = new Set(map.undrawn || []);
  const unmapped = files.filter(
    (f) => !mapped.has(f) && !undrawn.has(f) && /^apps\/mobile\/(app|components)\//.test(f),
  );
  return { files, globalHits, boards, unmapped };
}

function changedBetween(since, to) {
  return zlist(git(["diff", "--name-only", "-z", "--no-renames", since, to]));
}

// Files changed by one commit: vs its first parent, or vs the empty tree for a root commit.
// For a merge this is everything the merge brought into the current branch.
function changedInCommit(sha) {
  const parent = git(["rev-parse", "--verify", "--quiet", `${sha}^1`], { allowFail: true });
  if (parent) return zlist(git(["diff", "--name-only", "-z", "--no-renames", parent.trim(), sha]));
  return zlist(git(["diff-tree", "--root", "-r", "-z", "--no-commit-id", "--name-only", sha]));
}

// ---------------------------------------------------------------------------
// Report mode
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { json: false, tag: false, since: null, to: "HEAD", commit: "HEAD", help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--json") a.json = true;
    else if (k === "--tag") a.tag = true;
    else if (k === "--help" || k === "-h") a.help = true;
    else if (k === "--since" || k === "--to" || k === "--commit") {
      const v = argv[++i];
      if (!v) throw new Error(`${k} needs a value`);
      a[k.slice(2)] = v;
    } else throw new Error(`unknown argument: ${k}`);
  }
  return a;
}

function report(args) {
  const map = loadJson(MAP_PATH);
  let sinceRef = args.since;
  if (!sinceRef) {
    if (!existsSync(LAST_SYNC_PATH)) throw new Error("no --since given and last-sync.json is missing");
    sinceRef = loadJson(LAST_SYNC_PATH).commit;
  }
  const since = resolveCommit(sinceRef);
  const to = resolveCommit(args.to);
  const { files, globalHits, boards, unmapped: unmappedAll } = analyze(map, changedBetween(since, to));
  // Only files that still exist at --to: a deleted unclaimed file needs no board.
  const unmapped = existingAt(to, unmappedAll);
  const hitFiles = [...new Set([...globalHits, ...boards.flatMap((b) => b.files), ...unmapped])];
  const commits = hitFiles.length
    ? lines(git(["log", "--format=%H%x09%h%x09%s", `${since}..${to}`, "--", ...literal(hitFiles)]))
        .map((l) => {
          const [sha, short, ...rest] = l.split("\t");
          return { sha, short, subject: rest.join("\t") };
        })
    : [];
  // A changed screen that no board claims is drift too: it needs a board or a map fix.
  const drift = boards.length > 0 || unmapped.length > 0;
  const unmappedOnly = boards.length === 0 && unmapped.length > 0;
  const total = Object.keys(map.boards).length;

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          canvas: map.canvas,
          since,
          to,
          to_ref: args.to,
          drift,
          unmapped_only: unmappedOnly,
          boards_total: total,
          changed_files: files.length,
          global_hits: globalHits,
          boards,
          unmapped,
          commits,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    const head = `Canvas drift ${since.slice(0, 7)}..${to.slice(0, 7)} (${args.to})`;
    if (!drift) {
      console.log(`${head}: no drift (${files.length} changed files, none affect the ${total} boards).`);
    } else if (unmappedOnly) {
      console.log(`${head}: no board affected, but changed screen files have no board (drift).`);
    } else {
      console.log(`${head}: ${boards.length} of ${total} boards affected.`);
      console.log(`Canvas: ${map.canvas}\n`);
      if (globalHits.length) {
        console.log("GLOBAL changes (every board is affected):");
        globalHits.forEach((f) => console.log(`    ${f}`));
        console.log("");
      }
      for (const b of boards) {
        console.log(`${b.file}  (${b.title})`);
        if (b.files.length) b.files.forEach((f) => console.log(`    ${f}`));
        else console.log("    (global changes only)");
      }
      if (commits.length) {
        console.log("\nCommits:");
        commits.forEach((c) => console.log(`    ${c.short} ${c.subject}`));
      }
    }
    if (unmapped.length) {
      console.log("\nUNMAPPED: changed screen files no board claims (a new screen, or a gap in board-map.json):");
      unmapped.forEach((f) => console.log(`    ${f}`));
    }
  }
  return drift ? 2 : 0;
}

// ---------------------------------------------------------------------------
// Tag mode: upsert one open canvas-drift bead. Never throws.
// ---------------------------------------------------------------------------
const DRY = process.env.CANVAS_DRIFT_DRY_RUN === "1";

function bd(args) {
  if (DRY && (args[0] === "create" || args[0] === "note")) {
    console.log("[dry-run] bd " + args.map((x) => (/[\s"']/.test(x) ? JSON.stringify(x) : x)).join(" "));
    return args[0] === "create" ? "DRY-RUN-ID" : "";
  }
  const r = spawnSync("bd", args, { cwd: REPO, encoding: "utf8", timeout: BD_TIMEOUT_MS });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Two quick commits can run two taggers at once; one lock (shared by every worktree, since
// it lives in the common git dir) keeps them to one bead. The lock holds the owner's pid and
// is stale when that process is gone or the lock is older than LOCK_STALE_MS.
const BD_TIMEOUT_MS = 8000;
const LOCK_STALE_MS = 45000;

function lockIsStale(lock) {
  try {
    const age = Date.now() - statSync(lock).mtimeMs;
    if (age > LOCK_STALE_MS) return true;
    const pid = Number.parseInt(readFileSync(lock, "utf8").trim(), 10);
    if (!Number.isInteger(pid) || pid <= 0) return age > 2000; // being written, or garbage
    try {
      process.kill(pid, 0);
      return false; // owner alive
    } catch (e) {
      return e.code === "ESRCH";
    }
  } catch {
    return false; // vanished between checks: just retry
  }
}

function withLock(fn) {
  let common = (git(["rev-parse", "--path-format=absolute", "--git-common-dir"], { allowFail: true }) || "").trim();
  if (!common) {
    const rel = (git(["rev-parse", "--git-common-dir"], { allowFail: true }) || "").trim(); // git < 2.31
    common = rel ? resolve(REPO, rel) : "";
  }
  if (!common) return undefined; // no git dir: do nothing rather than risk duplicates
  const lock = join(common, "canvas-drift.lock");
  const deadline = Date.now() + LOCK_STALE_MS + 5000; // wait at least as long as the stale threshold
  while (Date.now() < deadline) {
    let fd;
    try {
      fd = openSync(lock, "wx");
    } catch (e) {
      if (e.code !== "EEXIST") return undefined;
      if (lockIsStale(lock)) {
        try {
          unlinkSync(lock);
        } catch {}
        continue;
      }
      sleepMs(500);
      continue;
    }
    try {
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return fn();
    } finally {
      try {
        unlinkSync(lock);
      } catch {}
    }
  }
  return undefined; // gave up quietly
}

function openDriftBeads() {
  const listed = bd(["list", "-l", BEAD_LABEL, "--status", "open,in_progress", "--json", "-n", "0"]);
  if (listed === null) return null; // bd failed: unknown, not "none"
  try {
    const arr = JSON.parse(listed || "[]");
    return Array.isArray(arr)
      ? arr.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)))
      : null;
  } catch {
    return null;
  }
}

function tag(commitRef) {
  // A rebase replays commits that were already tagged when first made (the hook also checks
  // for an in-progress rebase before starting this).
  if (/\brebase\b/.test(process.env.GIT_REFLOG_ACTION || "")) return;
  if (!DRY) {
    const v = spawnSync("bd", ["--version"], { cwd: REPO, encoding: "utf8", timeout: BD_TIMEOUT_MS });
    if (v.error || v.status !== 0) return; // bd not installed: skip silently
  }
  const map = loadJson(MAP_PATH);
  const sha = resolveCommit(commitRef);
  const { boards, globalHits, unmapped: unmappedAll } = analyze(map, changedInCommit(sha));
  const unmapped = existingAt(sha, unmappedAll);
  if (!boards.length && !unmapped.length) {
    if (DRY) console.log(`[dry-run] ${sha.slice(0, 7)} affects no boards; nothing to tag.`);
    return;
  }
  const short = sha.slice(0, 7);
  const subject = lines(git(["log", "-1", "--format=%s", sha]))[0] || "";
  let target = !boards.length
    ? "no board"
    : globalHits.length
      ? `ALL ${boards.length} boards (global: ${globalHits.join(", ")})`
      : boards.map((b) => b.file.replace(/\.dc\.html$/, "")).join(", ");
  if (unmapped.length) target += `; unmapped screen files: ${unmapped.join(", ")}`;
  const note = `${short} ${subject} -> ${target}`;

  withLock(() => {
    const existing = openDriftBeads();
    if (existing === null) return; // bd failed; never treat that as "no bead"
    if (existing.length) {
      const id = existing[0].id;
      const shown = bd(["show", id, "--json"]);
      if (shown === null) return;
      let notes = "";
      try {
        const d = JSON.parse(shown || "{}");
        notes = (Array.isArray(d) ? d[0] : d).notes || "";
      } catch {
        return;
      }
      if (notes.includes(short)) return; // already recorded (re-run on the same commit)
      bd(["note", id, note]);
      return;
    }
    const desc =
      "Shipped mobile code changed since the ELO RATED Native Screens canvas was last synced " +
      `(${map.canvas}). Each note below is one commit and the Current-app boards it touches. ` +
      "Nothing to do per commit: after the next mobile release (OTA or TestFlight) run /canvas-sync, " +
      "which redraws the affected boards, updates design/native-screens/last-sync.json and closes this bead. " +
      "Report anytime: node design/native-screens/drift.mjs";
    const id = (bd(["create", BEAD_TITLE, "-t", "chore", "-p", "3", "-l", BEAD_LABEL, "-d", desc, "--silent"]) || "").trim();
    if (!id) return;
    // Belt and braces: if another tagger (lock bypassed or bd lag) created one too, keep the oldest.
    const after = DRY ? [] : openDriftBeads();
    const keeper = after && after.length ? after[0].id : id;
    if (keeper !== id) {
      bd(["note", keeper, note]);
      bd(["close", id, "--reason", `Duplicate of ${keeper} (canvas-drift tagger race)`]);
    } else {
      bd(["note", id, note]);
    }
  });
}

// ---------------------------------------------------------------------------
function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`drift.mjs: ${e.message}`);
    return 1;
  }
  if (args.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 21).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    return 0;
  }
  if (args.tag) {
    try {
      tag(args.commit);
    } catch (e) {
      if (DRY) console.error(`[dry-run] tag error (ignored): ${e.message}`);
    }
    return 0;
  }
  try {
    return report(args);
  } catch (e) {
    console.error(`drift.mjs: ${e.message}`);
    return 1;
  }
}

process.exitCode = main();
