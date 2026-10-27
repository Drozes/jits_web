/**
 * One upload throughput probe (dynamic capture bitrate phase 2, spec 16.3
 * E7, E8, 16.5): a single XHR POST of a fixed 4 MiB body to the jr_be
 * `net-probe` Edge Function (contract jr_be specs/024-net-probe), measured
 * from `xhr.upload.onprogress`. React Native has no fetch upload progress,
 * and chunked timed POSTs would add a round trip per chunk.
 *
 * - Caps: 10 s from `send()` (then `abort()`), and the body itself (4 MiB).
 * - Ramp: progress before 1 s is ignored (TCP slow start, TLS setup). The
 *   baseline is the first point at or after 1 s; the end is the last point
 *   or, on a 200, the answer time with the full body (the server holds every
 *   byte, which corrects progress counting bytes handed to the socket).
 * - Steady rate over a window of at least 1 s and 256 KiB; a 200 whose
 *   window is too short (a fast link) uses the whole request instead
 *   (under-reads, but anything that fast is above 8 Mbps either way).
 * - A probe suspended past the cap (iOS backgrounding) is discarded as failed.
 * - 404 means "not deployed": no request again in this process (E8).
 *   Everything else that is not a 200 is a failure, never retried here.
 *
 * Privacy (E14): the request carries only filler bytes and the auth
 * headers, never a location, a match id or anything about the athlete.
 * Never rejects; every timer and listener is cleared when it settles.
 */
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase/client";
import type { CaptureNetworkClass } from "./capture-bitrate";

export const NET_PROBE_FUNCTION = "net-probe";
export const NET_PROBE_MAX_BYTES = 4 * 1024 * 1024;
export const NET_PROBE_MAX_MS = 10_000;
export const NET_PROBE_RAMP_MS = 1_000;
export const NET_PROBE_MIN_WINDOW_MS = 1_000;
export const NET_PROBE_MIN_WINDOW_BYTES = 256 * 1024;
/**
 * A probe whose wall time since `send()` passed the cap by more than this
 * was suspended (iOS backgrounding freezes JS: progress events queue and the
 * 10 s timer fires late), so its rate would read as a slow link: discarded.
 */
export const NET_PROBE_OVERDUE_MS = 2_000;

export type NetProbeStatus = "ok" | "absent" | "failed" | "cancelled";

export interface NetProbeResult {
  status: NetProbeStatus;
  /** Non-null only when `status === "ok"`. */
  mbps: number | null;
  /** The steady window, or the fast-link fallback. */
  method: "steady" | "whole" | null;
  /** The last progress point (or the body size on a 200). */
  bytesSent: number;
  /** `send()` to the end (answer, abort or error). */
  elapsedMs: number;
  httpStatus: number | null;
  /** From the 200 body, telemetry only. */
  serverBytes: number | null;
  serverMs: number | null;
  /** Passed in: the class at the start. */
  network: CaptureNetworkClass;
  /** Epoch ms. */
  endedAt: number;
}

export interface ProbeSignal {
  readonly aborted: boolean;
  addEventListener(type: "abort", cb: () => void): void;
  removeEventListener(type: "abort", cb: () => void): void;
}

export interface NetProbeOptions {
  network: CaptureNetworkClass;
  /** Cancel: aborts the XHR; the promise resolves with status "cancelled". */
  signal: ProbeSignal;
  /** Injected for tests; defaults: global XMLHttpRequest, Date.now, the Supabase session token, env. */
  createXhr?: () => XMLHttpRequest;
  now?: () => number;
  getAccessToken?: () => Promise<string | null>;
  baseUrl?: string;
  anonKey?: string;
}

/** Set by a 404: the function is not deployed, so no request again in this process. */
let absent = false;

/** The filler body (ASCII, so its string length is its byte size). Built per probe, never kept. */
function probeBody(): string {
  return "0".repeat(NET_PROBE_MAX_BYTES);
}

async function sessionToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** True once a 404 was seen in this process (E8). */
export function isNetProbeAbsent(): boolean {
  return absent;
}

interface Point {
  /** Ms since `send()`. */
  t: number;
  bytes: number;
}

/** The rate from the progress points (and a 200's answer time), or null without a valid window. */
export function probeRate(
  points: readonly Point[],
  answerAtMs: number | null,
): { mbps: number; method: "steady" | "whole" } | null {
  const window = points.filter((p) => p.t >= NET_PROBE_RAMP_MS);
  if (answerAtMs !== null && answerAtMs >= NET_PROBE_RAMP_MS) window.push({ t: answerAtMs, bytes: NET_PROBE_MAX_BYTES });
  if (window.length >= 2) {
    const base = window[0];
    const end = window[window.length - 1];
    const ms = end.t - base.t;
    const bytes = end.bytes - base.bytes;
    if (ms >= NET_PROBE_MIN_WINDOW_MS && bytes >= NET_PROBE_MIN_WINDOW_BYTES) {
      const mbps = (bytes * 8) / (ms / 1000) / 1e6;
      if (Number.isFinite(mbps) && mbps > 0) return { mbps, method: "steady" };
    }
  }
  if (answerAtMs !== null && answerAtMs > 0) {
    const mbps = (NET_PROBE_MAX_BYTES * 8) / (answerAtMs / 1000) / 1e6;
    if (Number.isFinite(mbps) && mbps > 0) return { mbps, method: "whole" };
  }
  return null;
}

function parseServer(text: unknown): { bytes: number | null; ms: number | null } {
  try {
    const parsed = typeof text === "string" ? (JSON.parse(text) as Record<string, unknown> | null) : null;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return { bytes: num(parsed?.bytes), ms: num(parsed?.ms) };
  } catch {
    return { bytes: null, ms: null };
  }
}

/** One probe. Never rejects. Resolves within NET_PROBE_MAX_MS plus the token read. */
export function runNetProbe(opts: NetProbeOptions): Promise<NetProbeResult> {
  const now = opts.now ?? Date.now;
  const empty = (status: NetProbeStatus): NetProbeResult => ({
    status,
    mbps: null,
    method: null,
    bytesSent: 0,
    elapsedMs: 0,
    httpStatus: null,
    serverBytes: null,
    serverMs: null,
    network: opts.network,
    endedAt: now(),
  });
  const run = async (): Promise<NetProbeResult> => {
    if (absent) return empty("absent");
    if (opts.signal.aborted) return empty("cancelled");
    let token: string | null;
    try {
      token = await (opts.getAccessToken ?? sessionToken)();
    } catch {
      token = null;
    }
    if (opts.signal.aborted) return empty("cancelled");
    if (absent) return empty("absent");
    if (!token) return empty("failed");
    return send(opts, token, now, empty);
  };
  return run().catch(() => empty("failed"));
}

function send(
  opts: NetProbeOptions,
  token: string,
  now: () => number,
  empty: (status: NetProbeStatus) => NetProbeResult,
): Promise<NetProbeResult> {
  return new Promise<NetProbeResult>((resolve) => {
    let xhr: XMLHttpRequest;
    try {
      xhr = opts.createXhr ? opts.createXhr() : new XMLHttpRequest();
    } catch {
      resolve(empty("failed"));
      return;
    }
    const points: Point[] = [];
    let t0 = now();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      opts.signal.removeEventListener("abort", onAbort);
      xhr.onload = null;
      xhr.onerror = null;
      xhr.ontimeout = null;
      xhr.onabort = null;
      if (xhr.upload) xhr.upload.onprogress = null;
    };
    const settle = (
      status: NetProbeStatus,
      extra: { httpStatus?: number | null; answerAtMs?: number | null; server?: { bytes: number | null; ms: number | null } } = {},
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      const elapsedMs = Math.max(0, (extra.answerAtMs ?? now() - t0) || 0);
      const last = points.length > 0 ? points[points.length - 1].bytes : 0;
      const answered = extra.answerAtMs != null;
      // Suspended past the cap (see NET_PROBE_OVERDUE_MS): no rate, failed.
      const overdue = now() - t0 > NET_PROBE_MAX_MS + NET_PROBE_OVERDUE_MS;
      const rate = status === "ok" && !overdue ? probeRate(points, extra.answerAtMs ?? null) : null;
      resolve({
        status: status === "ok" && !rate ? "failed" : status,
        mbps: rate?.mbps ?? null,
        method: rate?.method ?? null,
        bytesSent: answered ? NET_PROBE_MAX_BYTES : last,
        elapsedMs,
        httpStatus: extra.httpStatus ?? null,
        serverBytes: extra.server?.bytes ?? null,
        serverMs: extra.server?.ms ?? null,
        network: opts.network,
        endedAt: now(),
      });
    };
    const abortXhr = () => {
      try {
        xhr.abort();
      } catch {
        /* already done */
      }
    };
    function onAbort() {
      if (settled) return;
      // Settle first so the XHR's own abort event finds nothing to do.
      settle("cancelled");
      abortXhr();
    }

    try {
      xhr.open("POST", `${opts.baseUrl ?? env.supabaseUrl}/functions/v1/${NET_PROBE_FUNCTION}`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", opts.anonKey ?? env.supabaseAnonKey);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      // The module's own 10 s timer aborts; no native timeout.
      xhr.timeout = 0;
      if (xhr.upload) {
        xhr.upload.onprogress = (e: ProgressEvent) => {
          if (settled) return;
          const loaded = typeof e?.loaded === "number" && Number.isFinite(e.loaded) ? e.loaded : null;
          if (loaded !== null) points.push({ t: now() - t0, bytes: loaded });
        };
      }
      xhr.onload = () => {
        const status = xhr.status;
        if (status === 200) {
          settle("ok", { httpStatus: 200, answerAtMs: now() - t0, server: parseServer(xhr.responseText) });
        } else if (status === 404) {
          absent = true;
          settle("absent", { httpStatus: 404 });
        } else {
          settle("failed", { httpStatus: typeof status === "number" ? status : null });
        }
      };
      xhr.onerror = () => settle("failed");
      xhr.ontimeout = () => settle("failed");
      xhr.onabort = () => settle("failed");
      opts.signal.addEventListener("abort", onAbort);
      t0 = now();
      timer = setTimeout(() => {
        timer = null;
        if (settled) return;
        // The 10 s cap: a valid steady window still counts, else failed.
        settle("ok");
        abortXhr();
      }, NET_PROBE_MAX_MS);
      xhr.send(probeBody());
    } catch {
      settle("failed");
      abortXhr();
    }
  });
}

/** Test-only reset. */
export function __resetNetProbeForTests(): void {
  absent = false;
}
