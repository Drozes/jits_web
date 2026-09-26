/**
 * Metro log oracle. Each scenario remembers the log's byte size when it
 * starts, and at the end scans only what was appended since, so failures are
 * attributed to the scenario that caused them.
 */
import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";

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
