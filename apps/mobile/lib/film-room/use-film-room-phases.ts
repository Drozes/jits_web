import * as React from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { getMatchVideoStatus, type MatchVideoStatus } from "@jits/shared/api/match-video-status";
import { serverInstantToDevice } from "@jits/shared/hooks/use-match-video-status";
import { useIsScreenFocused } from "@/lib/video/use-upload-announcements";
import type { CardPhase } from "./card-status";

/** Only matches this recent can still be moving (the film window is 24 h after the build or the end). */
export const PHASE_WINDOW_MS = 48 * 60 * 60 * 1000;
/** At most this many cards read their status (the newest). */
export const PHASE_MAX_MATCHES = 6;
/** The first re-read of a moving match; doubles while nothing changes, capped. */
export const PHASE_POLL_BASE_MS = 30_000;
export const PHASE_POLL_MAX_MS = 5 * 60_000;

const SETTLED = new Set(["ready", "no_film"]);

interface Entry {
  status: MatchVideoStatus;
  /** Server clock minus device clock. */
  offset: number;
  fetchedAt: number;
  /** Re-reads in a row that changed nothing (drives the backoff). */
  quiet: number;
}

/** 30 s, 60 s, 120 s, ... capped at 5 min. */
export function phaseBackoffMs(quiet: number): number {
  return Math.min(PHASE_POLL_BASE_MS * 2 ** Math.max(0, quiet), PHASE_POLL_MAX_MS);
}

/** Still worth re-reading: not settled, and not stuck past its film window. */
export function isMoving(status: MatchVideoStatus, offset: number, now: number): boolean {
  if (SETTLED.has(status.phase)) return false;
  const windowEnd = serverInstantToDevice(status.film_window_until, offset);
  return windowEnd == null || now < windowEnd;
}

/** What a card's badge can change on: the rest of the document is not news here. */
function fingerprint(s: MatchVideoStatus): string {
  return [s.phase, s.phase_reason, s.wait_deadline_at, ...s.reels.map((r) => `${r.athlete_id}:${r.state}`)].join("|");
}

// ---- one cache for every surface (the Film Room screen and the Profile preview) ----

const cache = new Map<string, Entry>();
/**
 * Consecutive failed reads per id (round 2 B1): the next attempt waits
 * `phaseBackoffMs(count - 1)` after the last one, and after
 * `PHASE_MAX_FAILURES` the id is not re-read until the next focus, pull or
 * library re-read. A failure is never retried at once.
 */
const failures = new Map<string, { count: number; lastAttemptAt: number }>();
export const PHASE_MAX_FAILURES = 5;
const inflight = new Map<string, Promise<void>>();
const interests = new Map<number, string[]>();
const listeners = new Set<() => void>();
let version = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

function emit(): void {
  version += 1;
  for (const l of listeners) l();
}

function wanted(): string[] {
  return [...new Set([...interests.values()].flat())];
}

function fetchOne(id: string): Promise<void> {
  const running = inflight.get(id);
  if (running) return running;
  const p = (async () => {
    const res = await getMatchVideoStatus(supabase, id).catch(() => ({ ok: false as const }));
    if (!res.ok) {
      const f = failures.get(id);
      failures.set(id, { count: (f?.count ?? 0) + 1, lastAttemptAt: Date.now() });
    } else {
      failures.delete(id);
      const now = Date.now();
      const server = res.data.server_now ? Date.parse(res.data.server_now) : NaN;
      const prev = cache.get(id);
      const same = prev != null && fingerprint(prev.status) === fingerprint(res.data);
      cache.set(id, {
        status: res.data,
        offset: Number.isFinite(server) ? server - now : 0,
        fetchedAt: now,
        quiet: same ? prev.quiet + 1 : 0,
      });
      emit();
    }
  })().finally(() => {
    inflight.delete(id);
    reschedule();
  });
  inflight.set(id, p);
  return p;
}

function dueAt(id: string): number | null {
  const f = failures.get(id);
  if (f) return f.count >= PHASE_MAX_FAILURES ? null : f.lastAttemptAt + phaseBackoffMs(f.count - 1);
  const e = cache.get(id);
  if (!e) return 0;
  return isMoving(e.status, e.offset, Date.now()) ? e.fetchedAt + phaseBackoffMs(e.quiet) : null;
}

/** One timer for every active surface, at the earliest due moving match. */
function reschedule(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const ids = wanted();
  if (ids.length === 0) return;
  const dues = ids.map(dueAt).filter((d): d is number => d != null);
  if (dues.length === 0) return;
  const next = Math.min(...dues);
  timer = setTimeout(() => {
    timer = null;
    const now = Date.now();
    const due = wanted().filter((id) => {
      const d = dueAt(id);
      return d != null && d <= now;
    });
    if (due.length === 0) reschedule();
    for (const id of due) void fetchOne(id);
  }, Math.max(0, next - Date.now()));
}

/** An active (focused, foreground) surface wants these ids; returns the release. */
export function watchMatchPhases(ids: string[]): () => void {
  const token = ++seq;
  interests.set(token, ids);
  for (const id of ids) {
    // A focus is a fresh start for an id that gave up after its failures.
    const f = failures.get(id);
    if (f && f.count >= PHASE_MAX_FAILURES) failures.delete(id);
    if (!cache.has(id) && !failures.has(id)) void fetchOne(id);
  }
  reschedule();
  return () => {
    interests.delete(token);
    reschedule();
  };
}

/** Re-read these ids now and restart their backoff (pull to refresh, a library re-read). */
export function refreshMatchPhases(ids: string[]): void {
  for (const id of ids) {
    const e = cache.get(id);
    if (e) cache.set(id, { ...e, quiet: 0 });
    failures.delete(id);
    void fetchOne(id);
  }
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getVersion = () => version;

/** Test-only. */
export function __resetFilmRoomPhasesForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  cache.clear();
  failures.clear();
  inflight.clear();
  interests.clear();
  version = 0;
}

// ---- the hook ----

/** The ids worth a status read: completed in the last 48 h, newest first, capped. */
export function recentMatchIds(items: { match_id: string; completed_at: string | null }[], now: number): string[] {
  return items
    .filter((i) => {
      const t = i.completed_at ? Date.parse(i.completed_at) : NaN;
      return Number.isFinite(t) && now - t < PHASE_WINDOW_MS;
    })
    .slice(0, PHASE_MAX_MATCHES)
    .map((i) => i.match_id);
}

/** A card's phase from a status document at device time `now`. */
export function cardPhaseOf(status: MatchVideoStatus, offset: number, now: number, viewerId: string | null = null): CardPhase {
  const deadline = serverInstantToDevice(status.wait_deadline_at, offset);
  return {
    phase: status.phase,
    reason: status.phase_reason,
    waitRemainingMs: status.phase === "waiting_for_angle" && deadline != null ? deadline - now : null,
    ownReel: viewerId ? (status.reels.find((r) => r.athlete_id === viewerId)?.state ?? null) : null,
  };
}

/** Same badge, same object: a countdown tick re-renders only the counting card. */
export function samePhase(a: CardPhase, b: CardPhase): boolean {
  const secs = (p: CardPhase) => (p.waitRemainingMs == null ? null : Math.ceil(p.waitRemainingMs / 1000));
  return a.phase === b.phase && a.reason === b.reason && a.ownReel === b.ownReel && secs(a) === secs(b);
}

function useAppActive(): boolean {
  // An unknown state (no report yet) counts as active.
  const [active, setActive] = React.useState(() => {
    const now: unknown = AppState.currentState;
    return typeof now !== "string" || now === "active";
  });
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active")) as { remove?: () => void } | undefined;
    return () => sub?.remove?.();
  }, []);
  return active;
}

/**
 * The Film Room badge's server phase for the newest matches (deck section 9
 * priority, with the viewer's own reel: jits-n2im.25 review M1 / M3).
 *
 * One cache serves the Film Room screen and the Profile preview, so the two
 * never double the reads. Reads happen only while a surface is focused and
 * the app is in the foreground; only matches still moving are re-read, with
 * a backoff (30 s, 60 s, 120 s ... 5 min) that restarts when something
 * changes, and a match stuck past its film window is never re-read again. A
 * 1 s tick runs only while a card counts down, and every other card keeps
 * its phase object, so memoised posters skip the tick.
 */
export function useFilmRoomPhases(
  items: { match_id: string; completed_at: string | null }[],
  reloadToken: unknown = null,
  viewerId: string | null = null,
): Record<string, CardPhase> {
  const focused = useIsScreenFocused();
  const appActive = useAppActive();
  const active = focused && appActive;
  const ids = recentMatchIds(items, Date.now()).join(",");
  const ver = React.useSyncExternalStore(subscribe, getVersion, getVersion);

  React.useEffect(() => {
    if (!ids || !active) return;
    return watchMatchPhases(ids.split(","));
  }, [ids, active]);

  const firstReload = React.useRef(true);
  React.useEffect(() => {
    if (firstReload.current) {
      firstReload.current = false;
      return;
    }
    if (ids && active) refreshMatchPhases(ids.split(","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  const list = ids ? ids.split(",") : [];
  const counting = active && list.some((id) => cache.get(id)?.status.phase === "waiting_for_angle");
  const [tick, setTick] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [counting]);

  const prev = React.useRef(new Map<string, CardPhase>());
  return React.useMemo(() => {
    const now = Date.now();
    const out: Record<string, CardPhase> = {};
    const kept = new Map<string, CardPhase>();
    for (const id of list) {
      const e = cache.get(id);
      if (!e) continue;
      const next = cardPhaseOf(e.status, e.offset, now, viewerId);
      const old = prev.current.get(id);
      const phase = old && samePhase(old, next) ? old : next;
      out[id] = phase;
      kept.set(id, phase);
    }
    prev.current = kept;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, ver, tick, viewerId]);
}
