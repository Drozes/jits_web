import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getMatchVideoStatus, type MatchVideoStatus } from "@jits/shared/api/match-video-status";
import { serverInstantToDevice } from "@jits/shared/hooks/use-match-video-status";
import type { CardPhase } from "./card-status";

/** Only matches this recent can still be moving (the film window is 24 h after the build or the end). */
export const PHASE_WINDOW_MS = 48 * 60 * 60 * 1000;
/** At most this many cards read their status (the newest). */
export const PHASE_MAX_MATCHES = 6;
/** While any of them is still moving, re-read this often. */
export const PHASE_POLL_MS = 30_000;

const SETTLED = new Set(["ready", "no_film"]);

interface Entry {
  status: MatchVideoStatus;
  offset: number;
}

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
export function cardPhaseOf(status: MatchVideoStatus, offset: number, now: number): CardPhase {
  const deadline = serverInstantToDevice(status.wait_deadline_at, offset);
  return {
    phase: status.phase,
    reason: status.phase_reason,
    waitRemainingMs: status.phase === "waiting_for_angle" && deadline != null ? deadline - now : null,
  };
}

/**
 * The Film Room badge's server phase for the newest matches (deck section 9
 * priority: Waiting {mm:ss} > Building > Uploading > New > Breakdown ready >
 * No film). One `get_match_video_status` per recent match, re-read on a slow
 * poll while any is still moving and when `reloadToken` changes; a 1 s tick
 * only while one is counting down. Older matches keep the library's own
 * derivation (they are settled).
 */
export function useFilmRoomPhases(
  items: { match_id: string; completed_at: string | null }[],
  reloadToken: unknown = null,
): Record<string, CardPhase> {
  const ids = recentMatchIds(items, Date.now()).join(",");
  const [entries, setEntries] = React.useState<Record<string, Entry>>({});
  const [poll, setPoll] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    void Promise.all(
      ids.split(",").map(async (id) => {
        const res = await getMatchVideoStatus(supabase, id);
        if (!res.ok) return null;
        const server = res.data.server_now ? Date.parse(res.data.server_now) : NaN;
        return [id, { status: res.data, offset: Number.isFinite(server) ? server - Date.now() : 0 }] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setEntries((prev) => {
        const next: Record<string, Entry> = {};
        for (const id of ids.split(",")) if (prev[id]) next[id] = prev[id];
        for (const p of pairs) if (p) next[p[0]] = p[1];
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ids, poll, reloadToken]);

  const moving = Object.values(entries).some((e) => !SETTLED.has(e.status.phase));
  const counting = Object.values(entries).some((e) => e.status.phase === "waiting_for_angle" && e.status.wait_deadline_at);

  React.useEffect(() => {
    if (!moving) return;
    const t = setInterval(() => setPoll((n) => n + 1), PHASE_POLL_MS);
    return () => clearInterval(t);
  }, [moving]);

  React.useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [counting]);

  return React.useMemo(() => {
    const out: Record<string, CardPhase> = {};
    for (const [id, e] of Object.entries(entries)) out[id] = cardPhaseOf(e.status, e.offset, counting ? now : Date.now());
    return out;
  }, [entries, now, counting]);
}
