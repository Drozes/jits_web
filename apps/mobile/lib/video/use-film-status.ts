import * as React from "react";
import { AccessibilityInfo, AppState, type AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { useMatchVideoStatus } from "@jits/shared/hooks/use-match-video-status";
import type { MatchVideoStatus } from "@jits/shared/api/match-video-status";
import type { DomainError } from "@jits/shared/api/errors";
import { localAngleJob } from "./angle-status";
import { useMatchUpload, type MatchUploadEntry } from "./match-upload-store";
import { useDiscardedHere } from "./discard-markers";
import { isBackgroundUploadSupported } from "./upload-capabilities";
import { useIsScreenFocused } from "./use-upload-announcements";
import { deriveFilmStatus, type FilmStatusView } from "./film-status";
import { countdownA11y, rowAnnouncement } from "./video-status-copy";

/** Re-read on every return to the foreground (AppState "active"; iOS "inactive" is not a return). */
export function subscribeAppForeground(onForeground: () => void): () => void {
  let last: AppStateStatus = AppState.currentState;
  const sub = AppState.addEventListener("change", (next) => {
    // A return from the background or from iOS "inactive" (notification
    // shade, app switcher): a re-read is cheap and the realtime may have lagged.
    if (next === "active" && last !== "active") onForeground();
    last = next;
  }) as { remove?: () => void } | undefined;
  return () => sub?.remove?.();
}

export interface FilmStatusResult {
  /** The derived view every surface renders, null until the first read (or when it failed). */
  view: FilmStatusView | null;
  status: MatchVideoStatus | null;
  error: DomainError | null;
  loading: boolean;
  /** This phone's upload entry for the match. */
  localUpload: MatchUploadEntry | null;
  refetch: () => void;
}

/** A 1 s clock, only while `active` (the countdown); idle otherwise. */
function useTicker(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/**
 * The match's film status for one screen (jits-n2im.25): the shared status
 * hook (`get_match_video_status` + `match_media_events` realtime, debounced,
 * foreground re-read, server-clock countdowns) merged with THIS phone's
 * upload job for the viewer's own angle, derived once into the
 * `FilmStatusView` every surface renders.
 */
export function useFilmStatus(
  matchId: string | null | undefined,
  viewerId: string | null | undefined,
  /** Playable angles from the playback query (video id -> duration s), when the screen has them. */
  playable: ReadonlyMap<string, number | null> | null = null,
): FilmStatusResult {
  const { status, error, loading, clockOffsetMs, refetch } = useMatchVideoStatus(
    supabase,
    viewerId && matchId ? matchId : null,
    { subscribeForeground: subscribeAppForeground },
  );
  const entry = useMatchUpload(matchId ?? "");
  const discardedHere = useDiscardedHere(viewerId, matchId);
  const local = React.useMemo(() => localAngleJob(entry), [entry]);
  const ticking = status?.phase === "waiting_for_angle" && !!status.wait_deadline_at;
  const tick = useTicker(ticking);
  // Idle: a stable clock per read, so the view memo holds across re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const idleNow = React.useMemo(() => Date.now(), [status, local]);
  const now = ticking ? tick : idleNow;

  // This phone's job moving (landed, failed, retried) is news the server
  // will echo; re-read so "Your angle" hands over without a gap.
  const entryStatus = entry?.status ?? null;
  React.useEffect(() => {
    if (entryStatus) refetch();
  }, [entryStatus, refetch]);

  const view = React.useMemo(
    () =>
      status && viewerId
        ? deriveFilmStatus({
            status,
            viewerId,
            local,
            nowMs: now,
            clockOffsetMs,
            backgroundUpload: isBackgroundUploadSupported(),
            playable,
            discardedHere,
          })
        : null,
    [status, viewerId, local, now, clockOffsetMs, playable, discardedHere],
  );

  return { view, status, error, loading, localUpload: entry, refetch };
}

/** Countdown thresholds that are announced (deck 10.3), in seconds. */
const COUNTDOWN_MARKS = [300, 60, 0];

/**
 * Screen-reader announcements for the Film status (deck 10.1): only when the
 * PHASE changes or a ROW's state changes, never on a percent or countdown
 * tick (the countdown only at 5 min, 1 min and 0), never on mount, and only
 * from the focused screen (the verdict stays mounted under match detail).
 */
export function useFilmStatusAnnouncements(view: FilmStatusView | null): void {
  const focused = useIsScreenFocused();
  const lastPhase = React.useRef<string | null>(null);
  const lastRows = React.useRef<Map<string, { tag: string; helper: string | null }> | null>(null);
  const lastMark = React.useRef<number | null>(null);

  // Keyed on the line, not the phase key: a key change with the same words
  // (the grace window passing) is not news.
  const phaseKey = view?.line ?? null;
  const rowKey = view ? view.rows.map((r) => `${r.key}=${r.tag}|${r.isMine ? (r.helper ?? "") : ""}`).join("|") : "";
  // Seconds left while waiting; 0 once the deadline passed and the server
  // has not moved yet ("Any second now"); null otherwise.
  const remainingS =
    view?.phase !== "waiting_for_angle" ? null : view.countdown ? Math.ceil(view.countdown.remainingMs / 1000) : 0;

  React.useEffect(() => {
    if (!view) return;
    const prevPhase = lastPhase.current;
    const prevRows = lastRows.current;
    lastPhase.current = view.line;
    lastRows.current = new Map(view.rows.map((r) => [r.key, { tag: r.tag, helper: r.helper }]));
    if (!focused || prevPhase == null || prevRows == null) return;
    const said: string[] = [];
    if (prevPhase !== view.line) said.push(view.line);
    for (const r of view.rows) {
      const before = prevRows.get(r.key);
      if (before == null) continue;
      if (before.tag !== r.tag) said.push(rowAnnouncement(r.label, r.tag));
      // Deck 10.4: a Try again that fails at once keeps the tag and changes
      // the helper ("Still can't upload. Check your connection."): say it.
      else if (r.isMine && r.helper && before.helper !== r.helper) said.push(r.helper);
    }
    if (said.length > 0) AccessibilityInfo.announceForAccessibility(said.join(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey, rowKey, focused]);

  React.useEffect(() => {
    const prev = lastMark.current;
    lastMark.current = remainingS;
    if (!focused || prev == null || remainingS == null) return;
    // Crossing a mark (5:00, 1:00, 0:00), announced once as it is crossed.
    const crossed = COUNTDOWN_MARKS.find((m) => prev > m && remainingS <= m);
    if (crossed == null) return;
    AccessibilityInfo.announceForAccessibility(view?.countdown ? view.countdown.a11y : countdownA11y(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingS, focused]);
}
