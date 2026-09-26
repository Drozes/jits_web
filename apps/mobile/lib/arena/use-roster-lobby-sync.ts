/**
 * Keeps the Arena roster in step with the lobby (jits-hlm1.4).
 *
 * The roster (`get_arena_data`) is a snapshot: it lists who had the looking
 * flag set when it was read. "Online now" is that roster intersected with
 * `lobby:online`, so presence can only ever REMOVE people. An athlete who went
 * live after the viewer opened the Arena was in the lobby but never on the
 * list, so they never appeared. Here, a lobby id the roster does not know
 * triggers a quiet re-read.
 *
 * Presence is noisy, so the re-read is fenced in:
 *   - delayed and coalesced (a burst of joins costs one read),
 *   - at most one read in flight, and a minimum gap between reads,
 *   - an id is tried once. Every lobby id missing when ANY read starts (this
 *     one, pull-to-refresh, match exit, the rematch pin's own re-read) counts
 *     as tried, so an athlete the roster will never list (not looking, past
 *     `ARENA_ROSTER_LIMIT`) costs one read, not a loop. The tried set resets
 *     when a read comes back with a different roster, and an id is forgotten
 *     once it leaves the lobby, so a later return is tried again.
 * The viewer going live also re-reads once, through the same fence.
 *
 * A read this hook started that FAILS did not answer anything, so the ids it
 * marked are tried again after the minimum gap, up to
 * `ROSTER_SYNC_MAX_FAILED_RETRIES` failures in a row (then they wait for the
 * roster to change, the athlete to leave and return, or a pull).
 *
 * While the Arena is not focused (a pushed profile, another tab) nothing is
 * read; the bookkeeping carries on and the focus return runs the normal check.
 */
import * as React from "react";

/**
 * Fixed delay from the FIRST lobby change that makes a read due. Later changes
 * inside it do not restart it; they coalesce into the same read.
 */
export const ROSTER_SYNC_DEBOUNCE_MS = 1_000;
/** Minimum gap between the starts of two roster reads. */
export const ROSTER_SYNC_MIN_INTERVAL_MS = 3_000;
/** Failed reads in a row after which missing ids stop being retried. */
export const ROSTER_SYNC_MAX_FAILED_RETRIES = 3;

export interface RosterLobbySyncInput {
  /** Ids on the roster as last read. */
  rosterIds: string[];
  lobbyIds: Set<string>;
  /** The viewer; in the lobby while live, never on their own roster. */
  selfId: string | null;
  isLive: boolean;
  /** First read not back yet: that read covers everything. */
  isLoading: boolean;
  /** Any roster read in flight. */
  isFetching: boolean;
  /** Whether the most recent completed read succeeded. */
  lastReadOk: boolean;
  /** False while the Arena is not focused: schedule nothing. */
  enabled: boolean;
  /** A background re-read, no spinner. */
  refresh: () => void;
}

export function useRosterLobbySync({
  rosterIds,
  lobbyIds,
  selfId,
  isLive,
  isLoading,
  isFetching,
  lastReadOk,
  enabled,
  refresh,
}: RosterLobbySyncInput): void {
  const tried = React.useRef(new Set<string>());
  const liveOwed = React.useRef(false);
  const wasLive = React.useRef(isLive);
  const wasFetching = React.useRef(false);
  const lastStart = React.useRef(Number.NEGATIVE_INFINITY);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rosterKeyRef = React.useRef<string | null>(null);
  /** Our timer fired a read that has not started yet. */
  const firedOwn = React.useRef(false);
  /** The read in flight is ours: what it marked, and whether it owed "live". */
  const ownRead = React.useRef<{ ids: string[]; live: boolean } | null>(null);
  const failedInARow = React.useRef(0);

  const rosterKey = React.useMemo(
    () => [...rosterIds].sort().join(","),
    [rosterIds],
  );

  const missing = React.useCallback((): string[] => {
    const onRoster = new Set(rosterIds);
    const out: string[] = [];
    for (const id of lobbyIds) {
      if (id !== selfId && !onRoster.has(id)) out.push(id);
    }
    return out;
  }, [rosterIds, lobbyIds, selfId]);

  // Read by the timer when it fires, so it acts on the world as it is then.
  const due = React.useRef<() => boolean>(() => false);
  due.current = () =>
    liveOwed.current || missing().some((id) => !tried.current.has(id));

  const refreshRef = React.useRef(refresh);
  refreshRef.current = refresh;

  React.useEffect(() => {
    const cancel = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };

    // Forget ids that left the lobby: if they come back, try again.
    for (const id of tried.current) {
      if (!lobbyIds.has(id)) tried.current.delete(id);
    }

    if (isLive && !wasLive.current) liveOwed.current = true;
    wasLive.current = isLive;

    // A read that came back with a different roster answers the old question
    // and may have changed what "missing" means, so everything is fair again.
    if (!isFetching && !isLoading && rosterKeyRef.current !== rosterKey) {
      if (rosterKeyRef.current !== null) tried.current.clear();
      rosterKeyRef.current = rosterKey;
    }

    if (isFetching) {
      // A read is starting: whatever is missing right now is what it asks
      // about, whoever started it.
      if (!wasFetching.current) {
        wasFetching.current = true;
        lastStart.current = Date.now();
        const marked = missing().filter((id) => !tried.current.has(id));
        for (const id of marked) tried.current.add(id);
        ownRead.current = firedOwn.current
          ? { ids: marked, live: liveOwed.current }
          : null;
        firedOwn.current = false;
        liveOwed.current = false;
      }
      cancel();
      return;
    }
    if (wasFetching.current) {
      // A read just ended.
      wasFetching.current = false;
      const own = ownRead.current;
      ownRead.current = null;
      if (lastReadOk) {
        failedInARow.current = 0;
      } else if (own && failedInARow.current < ROSTER_SYNC_MAX_FAILED_RETRIES) {
        failedInARow.current += 1;
        for (const id of own.ids) tried.current.delete(id);
        if (own.live) liveOwed.current = true;
      }
    }

    if (!enabled || isLoading || !due.current()) {
      cancel();
      return;
    }
    if (timer.current) return;

    const wait = Math.max(
      ROSTER_SYNC_DEBOUNCE_MS,
      lastStart.current + ROSTER_SYNC_MIN_INTERVAL_MS - Date.now(),
    );
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!due.current()) return;
      lastStart.current = Date.now();
      firedOwn.current = true;
      refreshRef.current();
    }, wait);
  }, [
    rosterKey,
    lobbyIds,
    isLive,
    isLoading,
    isFetching,
    lastReadOk,
    enabled,
    missing,
  ]);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}
