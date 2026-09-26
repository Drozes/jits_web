/**
 * Local realtime server log oracle (jits-fa9x). The realtime server enforces a
 * per-channel presence rate limit; when a client trips it the server closes
 * that client's channel, and the app never rejoins it. That looks like a
 * product bug in the scenario that trips it, so every scenario captures the
 * realtime container's error lines since it started and surfaces any
 * `ClientPresenceRateLimitReached` line in result.json.
 *
 * LOCAL container only: the name comes from `cfg.realtimeContainer`, which
 * `assertSafe` already restricted to ^supabase_realtime_.
 */
import { HarnessError, run } from "../lib/util";

/** Lines kept in realtime.log (the equivalent of `grep -iE 'RateLimit|error'`). */
export const REALTIME_LOG_FILTER = /RateLimit|error/i;
export const PRESENCE_RATE_LIMIT = /ClientPresenceRateLimitReached/;

const JWT = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const SUPABASE_KEY = /\bsb_(publishable|secret)_[A-Za-z0-9_-]+/g;
/** `password=...`, `jwt_secret: "..."`, `api_key=...` and the like. */
const SECRET_ASSIGNMENT = /(jwt_secret|password|api_key|secret)\W*[:=]\W*\S+/gi;
/** The `user:pass@` part of a URL (e.g. a postgres:// DSN). */
const URL_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;

export interface RealtimeLogScan {
  /** Filtered lines, tokens masked. */
  lines: string[];
  /** The subset that reports a presence rate limit. */
  presenceRateLimited: string[];
}

/** Mask anything token- or credential-shaped a server log line might echo. */
export function maskTokens(line: string): string {
  return line
    .replace(JWT, "<jwt>")
    .replace(SUPABASE_KEY, "<sb-key>")
    .replace(URL_USERINFO, "$1<redacted>@")
    .replace(SECRET_ASSIGNMENT, "$1=<redacted>");
}

export function scanRealtimeLog(text: string): RealtimeLogScan {
  const lines = text
    .split("\n")
    .filter((l) => REALTIME_LOG_FILTER.test(l))
    .map((l) => maskTokens(l).slice(0, 600));
  return { lines, presenceRateLimited: lines.filter((l) => PRESENCE_RATE_LIMIT.test(l)) };
}

/**
 * `docker logs --since <iso> <container>`, stdout and stderr combined (the
 * server writes its log to both). Throws a HarnessError when docker fails.
 */
export async function readRealtimeLog(container: string, sinceIso: string): Promise<string> {
  if (!/^supabase_realtime_[A-Za-z0-9_-]+$/.test(container)) {
    throw new HarnessError(`refusing to read logs of non-local container "${container}"`);
  }
  const { stdout, stderr } = await run("docker", ["logs", "--since", sinceIso, container], { timeoutMs: 20_000 });
  return `${stdout}\n${stderr}`;
}
