/**
 * One match-loop run at a time on this machine. Every worktree's harness
 * drives the same simulator and the same local stack, and a second run
 * breaks the one in flight: it relaunches the app, unpauses the realtime
 * container under E8's outage, resets the fixtures under a live match and
 * (timekeeper tier) flips the shared flag. Seen 2026-10-21: a core run
 * started from another worktree relaunched the app while a timekeeper-tier
 * run was between Red's accept and Blue entering the match, and that
 * scenario failed for nothing the app or the harness did.
 *
 * The lock is a file at one path every worktree shares (outside any
 * checkout), holding the holder's pid and that process's start time. A lock
 * whose holder is no longer running (a run killed with SIGKILL, a reboot) is
 * stale and is taken over. A pid alone cannot tell: after a reboot or a pid
 * wrap it may name another process, possibly a root-owned one, so the
 * holder counts as alive only while the pid still has the start time it had
 * when it wrote the record (`holderAlive`).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { EnvError } from "./util";

export const RUN_LOCK_FILE = join(homedir(), ".cache", "elorated-match-loop", "run.lock");

/** The process a lock or a fixture restore record names. */
export interface ProcessRef {
  pid: number;
  /**
   * `ps -o lstart=` of that process when it wrote the record. Null when ps
   * could not be read; absent in a record an older harness wrote.
   */
  started?: string | null;
}

export interface RunLock extends ProcessRef {
  at: string;
  cwd: string;
  argv: string[];
}

/** What ps reports for a pid now. */
export interface ProcessIdentity {
  /** `ps -o lstart=`, for example `Wed 21 Oct 19:39:08 2026`. */
  started: string;
  /** `ps -o command=`, the full command line. */
  command: string;
}

/** Reads a pid's identity, or null when there is no such process. Injected in tests. */
export type ProcessProbe = (pid: number) => ProcessIdentity | null;

/** A harness command line (the runner, or its tests) names this folder. */
export const HARNESS_COMMAND_RE = /tools\/match-loop\//;

/**
 * The identity of `pid` from `ps` (two reads, so neither field's width can
 * bleed into the other), or null when ps knows no such process. ps reads
 * every user's processes, root's included, so EPERM never matters here.
 */
export const psProbe: ProcessProbe = (pid) => {
  const read = (field: "lstart=" | "command=") =>
    execFileSync("ps", ["-o", field, "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5_000 }).trim();
  try {
    const started = read("lstart=");
    const command = read("command=");
    return started ? { started, command } : null;
  } catch {
    return null; // ps exits 1 for a pid it does not know
  }
};

let selfStartedCache: string | null | undefined;

/** This process's start time (read once), recorded in every lock and restore record it writes. */
export function selfStarted(): string | null {
  if (selfStartedCache === undefined) selfStartedCache = psProbe(process.pid)?.started ?? null;
  return selfStartedCache;
}

/**
 * Whether the process that wrote a record is still running. Never this
 * process; pid 0 and 1 are never a harness run. The pid must still name the
 * SAME process: the start time it had when it wrote the record, or, for a
 * record without one (an older harness, or ps unreadable at the time), a
 * harness command line. A recycled pid (after a reboot or a wrap, a
 * root-owned process included) therefore reads as gone, and its stale lock or
 * restore record is taken over instead of refusing every run.
 */
export function holderAlive(ref: ProcessRef, probe: ProcessProbe = psProbe): boolean {
  if (!(ref.pid > 1) || ref.pid === process.pid) return false;
  const now = probe(ref.pid);
  if (!now) return false;
  return ref.started ? now.started === ref.started : HARNESS_COMMAND_RE.test(now.command);
}

/** The current lock, or null when there is none or it cannot be read. */
export function readRunLock(path = RUN_LOCK_FILE): RunLock | null {
  try {
    const v = JSON.parse(readFileSync(path, "utf8")) as Partial<RunLock>;
    return typeof v.pid === "number" ? (v as RunLock) : null;
  } catch {
    return null;
  }
}

/** Why this run may not start (another live run holds the lock), or null (pure, for tests). */
export function runLockRefusal(holder: RunLock | null, alive: (ref: ProcessRef) => boolean): string | null {
  if (!holder || holder.pid === process.pid || !alive(holder)) return null;
  return `another match-loop run (pid ${holder.pid}, started ${holder.at} in ${holder.cwd}: ${holder.argv.join(" ")}) is using the simulator and the local stack; one run at a time (wait for it, or remove ${RUN_LOCK_FILE} if that process is not a harness run)`;
}

/**
 * Take the lock or throw EnvError when another live run holds it. Returns
 * the release (removes the file only while this process still holds it).
 */
export function acquireRunLock(path = RUN_LOCK_FILE, alive: (ref: ProcessRef) => boolean = (ref) => holderAlive(ref)): () => void {
  mkdirSync(dirname(path), { recursive: true });
  const mine: RunLock = { pid: process.pid, started: selfStarted(), at: new Date().toISOString(), cwd: process.cwd(), argv: process.argv.slice(2) };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(path, JSON.stringify(mine, null, 2), { flag: "wx" });
      return () => {
        if (readRunLock(path)?.pid === process.pid) rmSync(path, { force: true });
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const refusal = runLockRefusal(readRunLock(path), alive);
      if (refusal) throw new EnvError(refusal);
      rmSync(path, { force: true }); // stale (or unreadable): take it over
    }
  }
  throw new EnvError(`could not take the match-loop run lock ${path} (another run took it at the same moment)`);
}
