/**
 * Process-level cleanup for an interrupted run (Ctrl-C, SIGTERM from the
 * orchestrator). Registered child processes (log streams, in-flight idb /
 * psql / docker calls) are killed, and registered hooks run first, such as
 * E8's "unpause the realtime container", so an interrupted outage test can
 * never leave the local stack paused.
 */
import type { ChildProcess } from "node:child_process";

const children = new Set<ChildProcess>();
const hooks = new Map<string, () => void | Promise<void>>();
let installed = false;

export function trackChild(child: ChildProcess): ChildProcess {
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

/** Register a cleanup hook; returns its unregister. */
export function onInterrupt(name: string, fn: () => void | Promise<void>): () => void {
  hooks.set(name, fn);
  return () => {
    if (hooks.get(name) === fn) hooks.delete(name);
  };
}

export async function runCleanup(): Promise<void> {
  for (const [name, fn] of [...hooks]) {
    try {
      await fn();
    } catch (e) {
      process.stderr.write(`cleanup hook ${name} failed: ${e instanceof Error ? e.message : e}\n`);
    }
  }
  hooks.clear();
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  children.clear();
}

export function installSignalHandlers(): void {
  if (installed) return;
  installed = true;
  let cleaning = false;
  const handler = (sig: NodeJS.Signals) => {
    // A second Ctrl-C while cleanup runs must not kill the process before
    // the realtime container is unpaused: swallow it.
    if (cleaning) {
      process.stderr.write(`${sig} again: still cleaning up, please wait...\n`);
      return;
    }
    cleaning = true;
    process.stderr.write(`\n${sig}: cleaning up (unpausing realtime, killing children)...\n`);
    void runCleanup().finally(() => process.exit(sig === "SIGINT" ? 130 : 143));
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
