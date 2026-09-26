import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { redactJson } from "../lib/redact";

export type TraceKind =
  | "rpc" // a mutation/query the bot made, with its Result
  | "broadcast_sent"
  | "broadcast_recv"
  | "channel_status"
  | "pg_change" // a postgres_changes payload the bot received
  | "presence"
  | "spy" // every broadcast on a match topic, seen by the observer socket
  | "step" // bot entered/left a wizard step
  | "note";

export interface TraceEntry {
  ts: string;
  t: number;
  actor: string;
  kind: TraceKind;
  name: string;
  topic?: string;
  step?: string;
  payload?: unknown;
  result?: unknown;
  ok?: boolean;
}

/**
 * Bot trace: every RPC and every broadcast sent/received, as JSONL (redacted)
 * plus an in-memory copy the protocol oracle reads at the end of a scenario.
 */
export class Trace {
  readonly entries: TraceEntry[] = [];
  private readonly t0 = Date.now();

  constructor(private readonly file: string | null) {
    if (file) mkdirSync(dirname(file), { recursive: true });
  }

  add(e: Omit<TraceEntry, "ts" | "t">): TraceEntry {
    const entry: TraceEntry = { ts: new Date().toISOString(), t: Date.now() - this.t0, ...e };
    this.entries.push(entry);
    if (this.file) appendFileSync(this.file, redactJson(entry) + "\n");
    return entry;
  }

  note(actor: string, name: string, payload?: unknown): void {
    this.add({ actor, kind: "note", name, payload });
  }

  /** Wrap a Result-returning call so it is always traced. */
  async rpc<T>(actor: string, name: string, args: unknown, fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      const ok =
        result && typeof result === "object" && "ok" in (result as object)
          ? Boolean((result as unknown as { ok: boolean }).ok)
          : result !== null && result !== undefined;
      this.add({ actor, kind: "rpc", name, payload: args, result, ok });
      return result;
    } catch (e) {
      this.add({ actor, kind: "rpc", name, payload: args, result: e, ok: false });
      throw e;
    }
  }

  filter(pred: (e: TraceEntry) => boolean): TraceEntry[] {
    return this.entries.filter(pred);
  }
}
