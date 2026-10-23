/**
 * The `myTimekeepingMatch` slot of the open-match store (timekeeper mode
 * A20, spec 9.1): the match the signed-in athlete is TIMEKEEPING. The
 * athlete slot (`getMyActiveMatch`, `active-match-store.ts`) never returns
 * it, since a timekeeper is never a participant.
 *
 * Independent of the athlete slot: its own value, its own newest-read-wins
 * rule (the same as the athlete slot's), its own readers. It feeds Home's
 * timekeeper card, the header's `TIMEKEEPING` chip and the Arena's go-live
 * lock, never `useMatchToConfirm` or the CONFIRM chip (a timekeeper has no
 * result to confirm).
 *
 * Reads are triggered by `active-match-store.ts` and nothing else: every
 * `refreshMyActiveMatch` (the owner's mount, match exit, foreground and
 * realtime triggers, Home's focus) also refreshes this slot, and the owner
 * re-reads on the realtime row of the match held here (the `matches` SELECT
 * policy admits the seated timekeeper). Kept in its own module, which takes
 * the client from its caller, so a reader (the header chip, Home, the Arena)
 * depends on neither the athlete slot's module nor the app client.
 *
 * Without timekeeper mode the RPC answers null, and on a backend without it
 * the read fails and the slot stays empty: nothing shows.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { getMyTimekeepingMatch, type MyTimekeepingMatch } from "@jits/shared/api/timekeeper";

/** The app's Supabase client, passed in by the caller (this module reads no env). */
type Client = Parameters<typeof getMyTimekeepingMatch>[0];

interface Snapshot {
  /** Whose timekeeping match this is; a read for another athlete never shows. */
  athleteId: string | null;
  match: MyTimekeepingMatch | null;
}

const EMPTY: Snapshot = Object.freeze({ athleteId: null, match: null });

let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();
/** Bumped per issued read (and per clear). */
let seq = 0;
/** The seq of the last read (or clear) that wrote: an older read never overwrites it. */
let lastAppliedSeq = 0;
/** The athlete the newest read was issued for. */
let latestAthleteId: string | null = null;

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

function write(next: Snapshot): void {
  if (next.athleteId === snapshot.athleteId && JSON.stringify(next.match) === JSON.stringify(snapshot.match)) return;
  snapshot = next;
  for (const l of listeners) l();
}

/**
 * Re-read the match `athleteId` timekeeps; null clears (sign-out). Called by
 * `refreshMyActiveMatch`, which already collapses same-tick requests. A
 * failed read keeps what is on screen; never navigates, never toasts.
 */
export function refreshMyTimekeepingMatch(client: Client, athleteId: string | null): void {
  const id = ++seq;
  latestAthleteId = athleteId;
  if (!athleteId) {
    lastAppliedSeq = id;
    write(EMPTY);
    return;
  }
  // The RPC reads the caller; the id only keys the result to the athlete it
  // was asked for. Started in a promise so no failure, even a synchronous
  // one, can reach the athlete slot's refresh that called this.
  void Promise.resolve()
    .then(() => getMyTimekeepingMatch(client))
    .then(
      (res) => {
        if (!res.ok || id <= lastAppliedSeq || athleteId !== latestAthleteId) return;
        lastAppliedSeq = id;
        write({ athleteId, match: res.data });
      },
      () => {},
    );
}

/**
 * The match `athleteId` is timekeeping: seated and `pending`, `in_progress`
 * within the resume window, or `completed` with the 30-minute edit window
 * open (A24). Null when none, or not read yet.
 *
 * A `completed` match leaves the moment its edit window closes on this
 * device's clock, even though the slot still holds it: nothing on the
 * `matches` row changes then, so no read or realtime event would drop it
 * before the next refresh. Every reader therefore agrees with Home's card
 * (`isTimekeepingMatchOffered`), and Home's invite card can come back.
 */
export function useMyTimekeepingMatch(athleteId: string | null | undefined): MyTimekeepingMatch | null {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const match = athleteId && snap.athleteId === athleteId ? snap.match : null;
  useRerenderAt(match ? editWindowClosesAt(match) : null);
  return match && isTimekeepingMatchOffered(match, Date.now()) ? match : null;
}

/**
 * Whether the slot's match still has something to offer at `now`: always
 * while seated, running or waiting on the result; once `completed`, only
 * while the server says its edit window is open and it has not closed on
 * this clock (A24, TK-H8). Home's card and every slot reader share it.
 */
export function isTimekeepingMatchOffered(match: MyTimekeepingMatch, now: number): boolean {
  if (match.status !== "completed") return true;
  const closes = editWindowClosesAt(match);
  return closes !== null && closes > now;
}

/** When a recorded match's open edit window closes (epoch ms), or null. */
function editWindowClosesAt(match: MyTimekeepingMatch): number | null {
  if (match.status !== "completed" || !match.editOpen || !match.editClosesAt) return null;
  const closes = Date.parse(match.editClosesAt);
  return Number.isFinite(closes) ? closes : null;
}

/**
 * Re-renders the reader once `at` (epoch ms) has passed. Re-armed after each
 * firing (`tick`), so a timer that fires a little early waits out the rest.
 */
function useRerenderAt(at: number | null): void {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (at === null) return;
    const ms = at - Date.now();
    if (ms <= 0) return;
    const id = setTimeout(() => setTick((n) => n + 1), ms);
    return () => clearTimeout(id);
  }, [at, tick]);
}

/**
 * On duty: the match is `pending` (seated) or `in_progress`. Only then does
 * the header show `TIMEKEEPING` and the Arena lock going live; a completed
 * match in its edit window is the Home card's alone (PM20).
 */
export function isTimekeepingActive(match: MyTimekeepingMatch | null): match is MyTimekeepingMatch {
  return match !== null && (match.status === "pending" || match.status === "in_progress");
}

/** Test-only: drop all module state between suites. */
export function __resetTimekeepingMatchStoreForTests(): void {
  snapshot = EMPTY;
  seq = 0;
  lastAppliedSeq = 0;
  latestAthleteId = null;
  listeners.clear();
}
