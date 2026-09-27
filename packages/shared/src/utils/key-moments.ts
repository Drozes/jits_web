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

/** The match facts that decide which analysed moment is the finish. */
export interface KeyMomentMatchFacts {
  result?: string | null;
  submission_name?: string | null;
}

/** A technique tag, as far as finding the finish needs it. */
export interface AnalysisTechniqueTag {
  technique_name?: string | null;
  submission_type_name?: string | null;
  category?: string | null;
  timestamp_start?: number | null;
}

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

function norm(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Loose match against the recorded submission ("rear naked choke" ~ "Rear-naked choke"). */
function namesSubmission(text: string | null | undefined, submission: string): boolean {
  const t = norm(text);
  return !!t && !!submission && (t.includes(submission) || submission.includes(t));
}

/**
 * Build the key moments for one video, oldest first:
 *
 *   - the first recorded position becomes "Engage";
 *   - every scoring moment becomes a "score" moment;
 *   - for a submission result, ONE analysed moment is marked the finish.
 *
 * CLOCKS. Every time here is VIDEO time (seconds into the recording), the
 * analysis's own clock. `matches.finish_time_seconds` is MATCH clock time
 * and drifts from video time by the recording's start offset and any pauses,
 * so it is deliberately never used to place anything on this timeline.
 * Instead the finish is the latest scoring moment or technique tag that
 * names the recorded submission (or is typed a submission); failing that,
 * the last scoring moment; with no scoring moments, there is no finish.
 *
 * Moments with a missing, negative or past-the-end time are dropped; exact
 * duplicates (same second, same label) collapse to one.
 */
export function buildKeyMoments(
  input: {
    positions?: AnalysisPosition[] | null;
    scoring_moments?: AnalysisScoringMoment[] | null;
    technique_tags?: AnalysisTechniqueTag[] | null;
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

  const scores: { moment: KeyMoment; raw: AnalysisScoringMoment }[] = [];
  for (const s of input?.scoring_moments ?? []) {
    if (!s || !validTime(s.timestamp_s, durationS)) continue;
    const moment: KeyMoment = {
      t: s.timestamp_s,
      label: humanizeAnalysisLabel(s.type) ?? "Score",
      kind: "score",
      description: s.description?.trim() || null,
    };
    moments.push(moment);
    scores.push({ moment, raw: s });
  }

  if (match?.result === "submission") {
    const name = match.submission_name?.trim() || null;
    const sub = norm(name);
    const isFinishText = (text: string | null | undefined) =>
      norm(text).includes("submission") || (sub ? namesSubmission(text, sub) : false);

    let best: { t: number; moment: KeyMoment | null } | null = null;
    for (const { moment, raw } of scores) {
      if ((isFinishText(raw.type) || isFinishText(raw.description)) && (!best || moment.t >= best.t)) {
        best = { t: moment.t, moment };
      }
    }
    for (const tag of input?.technique_tags ?? []) {
      if (!tag || !validTime(tag.timestamp_start, durationS)) continue;
      const hit =
        tag.category === "submission" ||
        (sub ? namesSubmission(tag.technique_name, sub) || namesSubmission(tag.submission_type_name, sub) : false);
      if (hit && (!best || tag.timestamp_start > best.t)) best = { t: tag.timestamp_start, moment: null };
    }
    if (!best && scores.length > 0) {
      const last = scores.reduce((a, b) => (b.moment.t >= a.moment.t ? b : a));
      best = { t: last.moment.t, moment: last.moment };
    }
    if (best?.moment) {
      best.moment.kind = "finish";
      if (name) best.moment.label = name;
    } else if (best) {
      moments.push({ t: best.t, label: name ?? "Finish", kind: "finish", description: null });
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

/**
 * Carry a playback position from one angle of a match to the other.
 *
 * ASSUMPTION (documented, unverified on real footage): `match_videos.
 * sync_offset_ms` is how much later a recording started than the match's
 * reference (primary) angle, so reference time = video time + offset. The
 * same instant on the target is then `t + (fromOffset - toOffset) / 1000`.
 * Only when BOTH offsets are known is the result `synced`; otherwise `t`
 * carries over unchanged and the caller should say it is approximate
 * (the two phones started recording at different moments).
 */
export function translateAngleTime(
  t: number,
  fromOffsetMs: number | null | undefined,
  toOffsetMs: number | null | undefined,
): { t: number; synced: boolean } {
  const safeT = Number.isFinite(t) && t > 0 ? t : 0;
  if (
    typeof fromOffsetMs !== "number" ||
    typeof toOffsetMs !== "number" ||
    !Number.isFinite(fromOffsetMs) ||
    !Number.isFinite(toOffsetMs)
  ) {
    return { t: safeT, synced: false };
  }
  return { t: Math.max(0, safeT + (fromOffsetMs - toOffsetMs) / 1000), synced: true };
}
