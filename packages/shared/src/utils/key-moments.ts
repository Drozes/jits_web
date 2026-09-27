/**
 * Pure helpers that turn a merged video analysis (`get_video_analysis`) into
 * the Film Room's key moments: the timeline on the match page and the seek
 * bar markers, chips and caption in the player. No Supabase access here.
 */

/** One entry of `video_analyses.positions` (every field optional on the wire). */
export interface AnalysisPosition {
  position?: string | null;
  description?: string | null;
  timestamp_s?: number | null;
  duration_s?: number | null;
}

/** One entry of `video_analyses.scoring_moments`. */
export interface AnalysisScoringMoment {
  type?: string | null;
  description?: string | null;
  timestamp_s?: number | null;
  athlete_id?: string | null;
}

export type KeyMomentKind = "engage" | "score" | "finish";

export interface KeyMoment {
  /** Seconds into the video. */
  t: number;
  /** Short title, sentence case ("Single leg takedown"). */
  label: string;
  kind: KeyMomentKind;
  /** The analysis sentence behind it, when there is one. */
  description: string | null;
}

/** The match facts that place the finish on the timeline. */
export interface KeyMomentMatchFacts {
  result?: string | null;
  submission_name?: string | null;
  finish_time_seconds?: number | null;
}

/** A scoring moment this close to the recorded finish IS the finish. */
const FINISH_MATCH_WINDOW_S = 5;
/** A caption stays up this long after its moment. */
const CAPTION_HOLD_S = 10;

function validTime(t: unknown, durationS?: number | null): t is number {
  if (typeof t !== "number" || !Number.isFinite(t) || t < 0) return false;
  if (durationS != null && durationS > 0 && t > durationS + 1) return false;
  return true;
}

/** "guard_pass_attempt" -> "Guard pass attempt"; blank -> null. */
export function humanizeAnalysisLabel(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Build the key moments for one video, oldest first:
 *
 *   - the first recorded position becomes "Engage";
 *   - every scoring moment becomes a "score" moment;
 *   - a submission result adds the finish at `finish_time_seconds`, unless a
 *     scoring moment already sits within 5 s of it, in which case that moment
 *     is promoted to the finish (labelled with the submission name).
 *
 * Moments with a missing, negative or past-the-end time are dropped; exact
 * duplicates (same second, same label) collapse to one.
 */
export function buildKeyMoments(
  input: {
    positions?: AnalysisPosition[] | null;
    scoring_moments?: AnalysisScoringMoment[] | null;
  } | null,
  match: KeyMomentMatchFacts | null,
  durationS?: number | null,
): KeyMoment[] {
  const moments: KeyMoment[] = [];

  const firstPosition = (input?.positions ?? [])
    .filter((p) => validTime(p?.timestamp_s, durationS))
    .sort((a, b) => (a.timestamp_s as number) - (b.timestamp_s as number))[0];
  if (firstPosition) {
    moments.push({
      t: firstPosition.timestamp_s as number,
      label: "Engage",
      kind: "engage",
      description: firstPosition.description?.trim() || null,
    });
  }

  for (const s of input?.scoring_moments ?? []) {
    if (!s || !validTime(s.timestamp_s, durationS)) continue;
    moments.push({
      t: s.timestamp_s,
      label: humanizeAnalysisLabel(s.type) ?? "Score",
      kind: "score",
      description: s.description?.trim() || null,
    });
  }

  const finishAt = match?.finish_time_seconds;
  if (match?.result === "submission" && validTime(finishAt, durationS)) {
    const label = match.submission_name?.trim() || "Finish";
    let nearest: KeyMoment | null = null;
    for (const m of moments) {
      if (m.kind !== "score") continue;
      const gap = Math.abs(m.t - finishAt);
      if (gap <= FINISH_MATCH_WINDOW_S && (!nearest || gap < Math.abs(nearest.t - finishAt))) {
        nearest = m;
      }
    }
    if (nearest) {
      nearest.kind = "finish";
      nearest.label = label;
    } else {
      moments.push({ t: finishAt, label, kind: "finish", description: null });
    }
  }

  moments.sort((a, b) => a.t - b.t);
  const seen = new Set<string>();
  return moments.filter((m) => {
    const key = `${Math.round(m.t)}:${m.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The caption for playback time `t`: the latest key moment at or before `t`
 * while it is less than 10 s old, else the position the analysis says the
 * athletes are in, else null.
 */
export function captionAt(
  moments: KeyMoment[],
  positions: AnalysisPosition[] | null | undefined,
  t: number,
): { t: number; text: string } | null {
  let moment: KeyMoment | null = null;
  for (const m of moments) {
    if (m.t <= t + 0.25) moment = m;
    else break;
  }
  if (moment && t - moment.t < CAPTION_HOLD_S) {
    return {
      t: moment.t,
      text: moment.description ? `${moment.label}: ${moment.description}` : moment.label,
    };
  }
  let position: AnalysisPosition | null = null;
  for (const p of [...(positions ?? [])].sort(
    (a, b) => (a?.timestamp_s ?? 0) - (b?.timestamp_s ?? 0),
  )) {
    if (validTime(p?.timestamp_s) && p.timestamp_s <= t) position = p;
  }
  const label = humanizeAnalysisLabel(position?.position);
  if (!position || !label) return null;
  return { t: position.timestamp_s as number, text: label };
}

/** "06:17" style clock (minutes zero-padded, no hours); 0 for bad input. */
export function formatClock(seconds: number | null | undefined): string {
  const total =
    seconds != null && Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
