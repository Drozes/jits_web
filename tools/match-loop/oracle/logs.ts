/**
 * Metro log oracle. Each scenario remembers the log's byte size when it
 * starts, and at the end scans only what was appended since, so failures are
 * attributed to the scenario that caused them.
 */
import { existsSync, openSync, readSync, closeSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export interface LogFinding {
  pattern: string;
  line: string;
}

/** Lines that fail a scenario. */
export const FATAL_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "ERROR", re: /^\s*ERROR\b/ },
  { name: "ErrorBoundary", re: /\[ErrorBoundary\]/ },
  { name: "unhandled-promise", re: /Possible Unhandled Promise/ },
  { name: "subscribe-multiple-times", re: /tried to subscribe multiple times/ },
  { name: "postgres-changes-after-subscribe", re: /cannot add `postgres_changes`/ },
  { name: "match-flow-fetch-failed", re: /\[match-flow\] fetch failed/ },
  { name: "arena-failed", re: /\[arena\].*failed/ },
];

export class MetroLog {
  constructor(readonly path: string | null) {}

  get available(): boolean {
    return !!this.path && existsSync(this.path);
  }

  offset(): number {
    if (!this.available) return 0;
    return statSync(this.path!).size;
  }

  slice(from: number): string {
    if (!this.available) return "";
    const size = statSync(this.path!).size;
    if (size <= from) return "";
    const fd = openSync(this.path!, "r");
    try {
      const buf = Buffer.alloc(size - from);
      readSync(fd, buf, 0, buf.length, from);
      return buf.toString("utf8");
    } finally {
      closeSync(fd);
    }
  }

  static scan(text: string): LogFinding[] {
    const out: LogFinding[] = [];
    for (const line of text.split("\n")) {
      for (const p of FATAL_PATTERNS) {
        if (p.re.test(line)) {
          out.push({ pattern: p.name, line: line.slice(0, 400) });
          break;
        }
      }
    }
    return out;
  }
}

/**
 * The app folder the Metro behind the log serves, from Expo's `Starting
 * project at <dir>` line (the last one, should a restart append), or null
 * when the log names none (pure, for tests).
 */
export function metroProjectRoot(text: string): string | null {
  const all = [...text.matchAll(/^Starting project at (.+?)\s*$/gm)];
  return all.length ? all[all.length - 1][1] : null;
}

const realOr = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};

/**
 * Why the Metro the simulator bundles from does not serve this checkout's
 * app, or null when it does or the log cannot tell (pure but for the
 * realpath, for tests). The harness reads the app under test from its own
 * tree (the timekeeper slices, `scenarios/timekeeper/integration.ts`; the
 * copy deck; the app's `.env` in `assertSafe`), so a harness in one
 * worktree driving another worktree's Metro would judge one tree by
 * another's code.
 */
export function metroTreeProblem(projectDir: string | null, repoRoot: string, real: (p: string) => string = realOr): string | null {
  if (!projectDir) return null;
  const want = real(join(repoRoot, "apps/mobile"));
  const got = real(projectDir);
  if (got === want) return null;
  return `the Metro behind the Metro log serves ${got}, not this checkout's app (${want}): run the harness from the worktree that Metro serves, or start Metro from this one`;
}

/** The project root a Metro log file names (`metroProjectRoot`), or null when there is no log or no such line. */
export function readMetroProjectRoot(path: string | null): string | null {
  const log = new MetroLog(path);
  return log.available ? metroProjectRoot(log.slice(0)) : null;
}
