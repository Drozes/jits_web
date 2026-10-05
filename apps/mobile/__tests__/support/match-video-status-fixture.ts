import { parseMatchVideoStatus, type MatchVideoStatus } from "@jits/shared/api/match-video-status";

/** Sample data of the canvas set: me = M. Reyes, opponent = D. Okafor, timekeeper = J. Cruz. */
export const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const OPP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const TK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const MATCH_ID = "11111111-1111-4111-8111-111111111111";
/** Server now in every fixture. */
export const NOW = Date.parse("2026-10-05T20:30:00Z");

export const V_ME = "d1d1d1d1-0000-4000-8000-000000000001";
export const V_OPP = "d1d1d1d1-0000-4000-8000-000000000002";
export const V_TK = "d1d1d1d1-0000-4000-8000-000000000003";

type AngleOver = Record<string, unknown>;

export function angle(who: "me" | "opp" | "tk", state: string, over: AngleOver = {}) {
  const id = who === "me" ? ME : who === "opp" ? OPP : TK;
  const name = who === "me" ? "M. Reyes" : who === "opp" ? "D. Okafor" : "J. Cruz";
  const vid = who === "me" ? V_ME : who === "opp" ? V_OPP : V_TK;
  const hasRow = !["not_recording", "waiting_for_phone"].includes(state);
  return {
    recorder_athlete_id: id,
    recorder_name_short: name,
    role: who === "tk" ? "timekeeper" : "competitor",
    intends_to_record: state !== "not_recording",
    video_id: hasRow ? vid : null,
    state,
    progress_pct: null,
    duration_s: state === "ready" ? 271 : null,
    is_primary: false,
    used: null,
    ...over,
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

export function statusFixture(over: Record<string, unknown> = {}): MatchVideoStatus {
  const s = parseMatchVideoStatus({
    match_id: MATCH_ID,
    match_status: "completed",
    match_ended_at: iso(NOW - 20 * 60_000),
    server_now: iso(NOW),
    phase: "collecting",
    phase_reason: "awaiting_first_angle",
    wait_deadline_at: null,
    wait_extended: null,
    dispatched_at: null,
    dispatch_reason: null,
    late_angle_until: null,
    film_window_until: iso(NOW + 23 * 3_600_000),
    no_video_grace_until: iso(NOW - 5 * 60_000),
    angles_expected: 2,
    angles_pending: 2,
    angles_ready: 0,
    angles_used: null,
    angles_used_count: null,
    angles: [angle("me", "uploading", { progress_pct: 42 }), angle("opp", "uploading", { progress_pct: 18 })],
    reels: [
      { athlete_id: ME, state: "not_started" },
      { athlete_id: OPP, state: "not_started" },
    ],
    event_seq: 5,
    ...over,
  });
  if (!s) throw new Error("bad fixture");
  return s;
}

/** The fusion fields a dispatched multi-angle build carries. */
export function fusion(over: Record<string, unknown> = {}) {
  return {
    wait_extended: false,
    dispatched_at: iso(NOW - 60_000),
    dispatch_reason: "all_settled",
    angles_used: [V_ME, V_OPP],
    angles_used_count: 2,
    ...over,
  };
}

export { iso };
