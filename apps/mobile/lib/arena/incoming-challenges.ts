/**
 * Pure helpers for the incoming challenges the Arena knows about.
 *
 * The prompt shows ONE challenge (the first keeps the surface), but the chip
 * and the tab badge need to know how many fresh challenges are waiting
 * (spec 5, F9: "! 3 WANT TO ROLL"), so the challenge hook keeps every fresh
 * pending incoming challenge it has seen instead of dropping the ones that
 * arrive behind the first. These helpers are the rules for that set, kept
 * apart from the hook so they can be tested without realtime plumbing.
 */
import { ARENA_CHALLENGE_FRESH_MS } from "@jits/shared/constants";

/** A pending challenge to me that the client has seen (INSERT or a read). */
export interface KnownIncoming {
  challengeId: string;
  challengerId: string;
  /** The row's `created_at` (server time); null when it could not be read. */
  createdAt: string | null;
  /** The row's `expires_at`; null when it could not be read. */
  expiresAt: string | null;
  /** Client epoch ms when this client first learned of it (read pruning). */
  seenAt: number;
}

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : at;
}

// ---------------------------------------------------------------------------
// Server clock
// ---------------------------------------------------------------------------

/**
 * How far this device's clock runs AHEAD of the server's, in ms (negative when
 * it runs behind). The live window is measured from the row's `created_at`,
 * which is server time, but every timer and comparison here runs on
 * `Date.now()`. A phone ten minutes fast would otherwise dismiss every prompt
 * the moment it surfaced.
 *
 * Learned from rows that are brand new when the client sees them: a realtime
 * INSERT ("delivery") and the row my own `createChallenge` returns
 * ("roundtrip"). Each sample is `clientAt - created_at`, which is the true
 * offset PLUS however long the row took to reach the client. That latency is
 * unbounded (a socket flushed on resume from iOS suspension, replication lag,
 * a row written with a backdated `created_at`), and it only ever makes a
 * sample LARGER. So the estimate is robust rather than "newest wins":
 *  - it is the MINIMUM of the samples from the last `CLOCK_SAMPLE_WINDOW_MS`
 *    (at most `CLOCK_MAX_SAMPLES`): one late sample cannot raise it while a
 *    prompter one is in the window, and a clock corrected backwards shows up
 *    as soon as one smaller sample arrives;
 *  - once an estimate is established, a delivery sample more than
 *    `CLOCK_LATE_SAMPLE_BOUND_MS` above it is held back until a second one
 *    agrees (a roundtrip sample, whose latency is one request, is always
 *    taken): a single late INSERT after a quiet spell, when the window has
 *    emptied, must not push every live window back by its lateness. A clock
 *    corrected forwards is followed once the older, smaller samples age out
 *    and a second sample confirms it.
 * The FIRST sample of the session is taken as it comes: nothing else is known,
 * and a phone that really is fast must not have its first prompt lapse on
 * arrival. The hook also drops delivery samples while the app is not active
 * or has only just resumed, when a flushed socket makes them late.
 */
let serverClockOffsetMs = 0;

/** Where a clock sample came from; see `serverClockOffsetMs`. */
export type ClockSampleSource = "delivery" | "roundtrip";

interface ClockSample {
  offsetMs: number;
  /** Client epoch ms the sample was taken. */
  at: number;
  source: ClockSampleSource;
}

/** How long a clock sample stays in the estimate. */
export const CLOCK_SAMPLE_WINDOW_MS = 10 * 60_000;
/** Most samples kept. */
export const CLOCK_MAX_SAMPLES = 16;
/** A lone delivery sample this far above the estimate needs confirming. */
export const CLOCK_LATE_SAMPLE_BOUND_MS = 30_000;

/**
 * How long after the app returns to the foreground a realtime delivery is
 * still distrusted as a clock sample: frames the socket buffered while iOS had
 * the app suspended are flushed then, late by the length of the suspension.
 */
export const CLOCK_RESUME_SETTLE_MS = 5_000;

let clockSamples: ClockSample[] = [];
/** A sample has set the estimate (the default 0 is only an assumption). */
let clockEstablished = false;

/**
 * Record that a row whose server `created_at` is `serverIso` was just written,
 * as seen at client time `clientAt`. Ignored when the timestamp is unusable.
 */
export function noteServerTime(
  serverIso: string | null | undefined,
  clientAt: number = Date.now(),
  source: ClockSampleSource = "delivery",
): void {
  const server = parse(serverIso);
  if (server === null) return;
  clockSamples = [
    // A sample from the "future" means the device clock was moved back; it
    // says nothing about the clock now, so it ages out with the rest.
    ...clockSamples.filter(
      (s) => clientAt - s.at <= CLOCK_SAMPLE_WINDOW_MS && s.at <= clientAt,
    ),
    { offsetMs: clientAt - server, at: clientAt, source },
  ].slice(-CLOCK_MAX_SAMPLES);

  if (!clockEstablished) {
    clockEstablished = true;
    serverClockOffsetMs = Math.min(...clockSamples.map((s) => s.offsetMs));
    return;
  }
  const bound = serverClockOffsetMs + CLOCK_LATE_SAMPLE_BOUND_MS;
  const plausible = clockSamples.filter(
    (s) => s.source === "roundtrip" || s.offsetMs <= bound,
  );
  const late = clockSamples.filter(
    (s) => s.source !== "roundtrip" && s.offsetMs > bound,
  );
  const pool = plausible.length > 0 ? plausible : late.length >= 2 ? late : [];
  if (pool.length === 0) return;
  serverClockOffsetMs = Math.min(...pool.map((s) => s.offsetMs));
}

/** The current device-minus-server offset in ms; see `serverClockOffsetMs`. */
export function getServerClockOffsetMs(): number {
  return serverClockOffsetMs;
}

/**
 * Whether a clock sample has set the offset this session. Until one has (a
 * cold relaunch that restored my outgoing challenge from a read, which
 * carries no sample), the offset is only the assumed 0.
 */
export function isServerClockEstablished(): boolean {
  return clockEstablished;
}

/** Test-only: forget the learned offset. */
export function __resetServerClockForTests(): void {
  serverClockOffsetMs = 0;
  clockSamples = [];
  clockEstablished = false;
}

/**
 * When the challenge stops being a LIVE challenge: 10 minutes after it was
 * created (`ARENA_CHALLENGE_FRESH_MS`), or its `expires_at` if that is
 * sooner. Null when neither timestamp is known: such a challenge never lapses
 * on the client and is left to the realtime UPDATE and the next read.
 *
 * Returned in DEVICE time (the server deadline shifted by the learned clock
 * offset), so callers compare it with `Date.now()` and set timers from it
 * directly.
 */
export function freshDeadline(c: {
  createdAt?: string | null;
  expiresAt?: string | null;
}): number | null {
  const created = parse(c.createdAt);
  const expires = parse(c.expiresAt);
  const fresh = created === null ? null : created + ARENA_CHALLENGE_FRESH_MS;
  const deadline =
    fresh === null ? expires : expires === null ? fresh : Math.min(fresh, expires);
  return deadline === null ? null : deadline + serverClockOffsetMs;
}

/** Still inside its live window at `now`. */
export function isFreshIncoming(
  c: { createdAt?: string | null; expiresAt?: string | null },
  now: number,
): boolean {
  const deadline = freshDeadline(c);
  return deadline === null || now < deadline;
}

/** Milliseconds left in the live window, floored at 0; null when unknown. */
export function freshRemainingMs(
  c: { createdAt?: string | null; expiresAt?: string | null },
  now: number,
): number | null {
  const deadline = freshDeadline(c);
  return deadline === null ? null : Math.max(0, deadline - now);
}

/** The known set without the entries whose live window has passed. */
export function pruneLapsed(
  known: ReadonlyMap<string, KnownIncoming>,
  now: number,
): ReadonlyMap<string, KnownIncoming> {
  let next: Map<string, KnownIncoming> | null = null;
  for (const [id, c] of known) {
    if (isFreshIncoming(c, now)) continue;
    next ??= new Map(known);
    next.delete(id);
  }
  return next ?? known;
}

/** The earliest live-window deadline in the set (for the next prune). */
export function nextDeadline(known: ReadonlyMap<string, KnownIncoming>): number | null {
  let min: number | null = null;
  for (const c of known.values()) {
    const d = freshDeadline(c);
    if (d !== null && (min === null || d < min)) min = d;
  }
  return min;
}

/**
 * Merge a pending-challenge read into the known set.
 *
 * Every fresh challenge in the read is added (keeping the first `seenAt`).
 * An entry the read did NOT return is dropped only if it was known before the
 * read started: the read says it is no longer pending (its UPDATE was missed).
 * One learned while the read was in flight (a realtime INSERT) is kept, since
 * the read could not have seen it. `keepIds` (the challenge on the prompt) is
 * never dropped here; the prompt has its own clear paths.
 */
export function mergeIncomingRead(
  known: ReadonlyMap<string, KnownIncoming>,
  read: readonly Omit<KnownIncoming, "seenAt">[],
  readStartedAt: number,
  skip: (challengeId: string) => boolean,
  keepIds: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, KnownIncoming> {
  const next = new Map<string, KnownIncoming>();
  const inRead = new Set(read.map((c) => c.challengeId));
  for (const [id, c] of known) {
    if (inRead.has(id) || keepIds.has(id) || c.seenAt >= readStartedAt) {
      next.set(id, c);
    }
  }
  for (const c of read) {
    if (skip(c.challengeId) || next.has(c.challengeId)) continue;
    next.set(c.challengeId, { ...c, seenAt: readStartedAt });
  }
  return sameEntries(known, next) ? known : next;
}

function sameEntries(
  a: ReadonlyMap<string, KnownIncoming>,
  b: ReadonlyMap<string, KnownIncoming>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, c] of a) if (b.get(id) !== c) return false;
  return true;
}

/**
 * How many fresh challenges are waiting on me: the one on the prompt (always
 * counted while it is up) plus every other known one whose challenger is on
 * the mat right now. A challenger who left the lobby cannot drop into a
 * match, so their challenge is not an actionable "wants to roll".
 */
export function countWaitingIncoming(
  known: ReadonlyMap<string, KnownIncoming>,
  surfacedId: string | null,
  /** Null when presence is unknown: every challenger then counts. */
  lobbyIds: ReadonlySet<string> | null,
  now: number,
): number {
  let n = 0;
  for (const c of known.values()) {
    if (!isFreshIncoming(c, now)) continue;
    if (c.challengeId === surfacedId || !lobbyIds || lobbyIds.has(c.challengerId)) {
      n += 1;
    }
  }
  return n;
}
