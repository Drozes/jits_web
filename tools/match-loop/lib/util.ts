import { execFile } from "node:child_process";
import { redact } from "./redact";
import { trackChild } from "./cleanup";

/** Environment problem (DB down, sim not booted). Status `env_error`. */
export class EnvError extends Error {
  override name = "EnvError";
}

/** Bug in the harness itself (bad selector, idb crash). Status `harness_error`. */
export class HarnessError extends Error {
  override name = "HarnessError";
}

/**
 * A wait that timed out on the product: the app or the DB never reached the
 * expected state. Recorded as a failed oracle, so the scenario is `fail`.
 */
export class ExpectationTimeout extends Error {
  override name = "ExpectationTimeout";
  constructor(
    public readonly what: string,
    public readonly timeoutMs: number,
    public readonly lastSeen?: unknown,
  ) {
    super(`timed out after ${timeoutMs}ms waiting for ${what}`);
  }
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

/** execFile as a promise. Errors carry redacted stderr. */
export function run(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; input?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      {
        timeout: opts.timeoutMs ?? 60_000,
        maxBuffer: 64 * 1024 * 1024,
        env: opts.env ?? process.env,
      },
      (err, stdout, stderr) => {
        if (err) {
          const msg = redact(
            `${cmd} ${args.join(" ")} failed: ${err.message}\n${String(stderr).slice(0, 2000)}`,
          );
          reject(new HarnessError(msg));
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
    trackChild(child);
    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    }
  });
}

/**
 * Deliberate pacing (human-timing emulation), never used to wait for state.
 * State waits go through `pollUntil`.
 */
export function pace(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Random integer in [min, max]. */
export function jitter(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * Poll `probe` until it returns a non-undefined value or the timeout lapses.
 * Throws ExpectationTimeout with the last probed value for evidence.
 */
export async function pollUntil<T>(
  what: string,
  probe: () => Promise<T | undefined> | T | undefined,
  opts: { timeoutMs: number; intervalMs?: number; lastSeen?: () => unknown },
): Promise<T> {
  const start = Date.now();
  const interval = opts.intervalMs ?? 400;
  let last: unknown;
  for (;;) {
    try {
      const v = await probe();
      if (v !== undefined) return v;
    } catch (e) {
      if (e instanceof EnvError || e instanceof HarnessError) throw e;
      last = e instanceof Error ? e.message : e;
    }
    if (Date.now() - start >= opts.timeoutMs) {
      throw new ExpectationTimeout(what, opts.timeoutMs, opts.lastSeen ? opts.lastSeen() : last);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

export function isoStamp(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, "-");
}

/** Normalise an error string for fingerprinting: no ids, numbers or times. */
export function normaliseError(text: string): string {
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "<ts>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function log(...parts: unknown[]): void {
  const line = parts
    .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
    .join(" ");
  process.stdout.write(redact(`[${new Date().toISOString().slice(11, 23)}] ${line}\n`));
}
