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
 *   - for a submission result, ONE analysed moment is marked the finish
 *     (relabelled with the submission name only when it names it).
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

    // `named`: the moment itself names the submission, so it may take the
    // recorded name; the last-scoring-moment fallback keeps its own label.
    let best: { t: number; moment: KeyMoment | null; named: boolean } | null = null;
    for (const { moment, raw } of scores) {
      if ((isFinishText(raw.type) || isFinishText(raw.description)) && (!best || moment.t >= best.t)) {
        best = { t: moment.t, moment, named: true };
      }
    }
    for (const tag of input?.technique_tags ?? []) {
      if (!tag || !validTime(tag.timestamp_start, durationS)) continue;
      const hit =
        tag.category === "submission" ||
        (sub ? namesSubmission(tag.technique_name, sub) || namesSubmission(tag.submission_type_name, sub) : false);
      if (hit && (!best || tag.timestamp_start > best.t)) best = { t: tag.timestamp_start, moment: null, named: true };
    }
    if (!best && scores.length > 0) {
      const last = scores.reduce((a, b) => (b.moment.t >= a.moment.t ? b : a));
      best = { t: last.moment.t, moment: last.moment, named: false };
    }
    if (best?.moment) {
      best.moment.kind = "finish";
      if (name && best.named) best.moment.label = name;
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

/**
 * AI analysis labels (move, position and technique names from the model) are
 * internal for now (owner decision 2026-10-06, jits-xfvd.18): only platform
 * admins (`admin`, and `founder`, which implies admin) see them. Everyone
 * else gets key moments as timestamps. Unknown or missing role: hidden.
 */
export function canSeeAnalysisLabels(platformRole: string | null | undefined): boolean {
  return platformRole === "admin" || platformRole === "founder";
}

/**
 * What a key moment row says for this viewer. Admins (`showLabels`) see
 * every label. Everyone else sees only a finish labelled with the
 * user-RECORDED submission (`recordedSubmission`, the match's
 * `submission_name`): `buildKeyMoments` gives the finish that name only when
 * the analysis named it, so a finish that fell back to an AI scoring moment
 * keeps its AI label and stays hidden. Else null (time only).
 * Display-time only, so `buildKeyMoments`' dedupe and finish logic never
 * depends on who is looking.
 */
export function keyMomentDisplayLabel(
  moment: KeyMoment,
  showLabels: boolean,
  recordedSubmission?: string | null,
): string | null {
  if (showLabels) return moment.label;
  const recorded = recordedSubmission?.trim();
  if (moment.kind === "finish" && recorded && moment.label === recorded) return moment.label;
  return null;
}

/**
 * Key moments with one entry per second (by rounded time), for a view that
 * shows times only: `buildKeyMoments` keeps two moments in the same second
 * when their labels differ. Each entry takes the earliest time in its
 * second; a finish wins (its kind and label) when any moment there is one.
 */
export function keyMomentsBySecond(moments: KeyMoment[]): KeyMoment[] {
  const out: KeyMoment[] = [];
  const at = new Map<number, number>();
  for (const m of [...moments].sort((a, b) => a.t - b.t)) {
    const key = Math.round(m.t);
    const i = at.get(key);
    if (i == null) {
      at.set(key, out.length);
      out.push({ ...m });
      continue;
    }
    const kept = out[i];
    if (m.kind === "finish" && kept.kind !== "finish") {
      out[i] = { ...m, t: kept.t };
    }
  }
  return out;
}

/** Where the playhead sits among the key moments (the player's stepper). */
export interface KeyMomentStep {
  /** The moment the stepper shows: the latest at or before the playhead, else the first. */
  shown: KeyMoment;
  /** Its index in the per-second list (0-based). */
  index: number;
  /** How many distinct seconds there are to step through. */
  count: number;
  /** True when the playhead has reached `shown` (false before the first moment). */
  reached: boolean;
  /** The moment before `shown`, or null at the start. */
  prev: KeyMoment | null;
  /** The next moment after the playhead, or null at the end. */
  next: KeyMoment | null;
}

/**
 * The stepper state for playback time `t`. It steps over DISTINCT seconds
 * (`keyMomentsBySecond`), so two moments in one second are one stop and
 * prev never lands on the same time twice. A quarter second of slack counts
 * a moment the player just seeked to as reached. Before the first moment the
 * stepper shows the first one's time and "next" jumps to it. Null with no
 * moments.
 */
export function keyMomentStepAt(moments: KeyMoment[], t: number): KeyMomentStep | null {
  const stops = keyMomentsBySecond(moments);
  if (stops.length === 0) return null;
  const pos = Number.isFinite(t) ? t : 0;
  const count = stops.length;
  let index = -1;
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].t <= pos + 0.25) index = i;
    else break;
  }
  if (index < 0) {
    return { shown: stops[0], index: 0, count, reached: false, prev: null, next: stops[0] };
  }
  return {
    shown: stops[index],
    index,
    count,
    reached: true,
    prev: index > 0 ? stops[index - 1] : null,
    next: index < stops.length - 1 ? stops[index + 1] : null,
  };
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
 * BACKEND CONTRACT (jr_be wave A, migration 20261005100000; INTEGRATION.md
 * 10.1): `sync_offset_ms(V) = start(V) - start(primary)` in milliseconds,
 * positive when V started later. The elected primary is stored as 0 (with a
 * NULL source and confidence) and an unsynced angle as NULL, so
 * `reference_time = video_time + sync_offset_ms / 1000` and the same instant
 * on the target is `t + (fromOffset - toOffset) / 1000`. The slicer writes
 * the offsets (`set_match_video_sync`); `get_match_details` returns them per
 * video with `sync_source` and `sync_confidence` (10.5).
 *
 * `synced` only says both offsets are numbers. Whether the result is EXACT
 * also depends on how the offsets were found: an audio match is within about
 * a frame, a clock offset (the recorders' start times) can be off by
 * seconds. Callers decide that with `angleSyncExact`. The result is never
 * rounded: carry it in fractional seconds.
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

/** The sync fields of a match video (`get_match_details`). */
export interface AngleSyncFields {
  is_primary?: boolean | null;
  sync_offset_ms?: number | null;
  sync_source?: string | null;
}

/**
 * Whether an angle's offset is trustworthy to the frame: the primary (the
 * reference, offset 0) or an audio-matched angle. A clock or manual offset,
 * or none, is approximate.
 */
export function angleSyncExact(v: AngleSyncFields | null | undefined): boolean {
  if (!v || typeof v.sync_offset_ms !== "number" || !Number.isFinite(v.sync_offset_ms)) return false;
  if (v.is_primary === true) return true;
  // The contract stores the primary as (0, NULL, NULL); trust that shape too.
  if (v.sync_offset_ms === 0 && v.sync_source == null) return true;
  return typeof v.sync_source === "string" && v.sync_source.trim().toLowerCase() === "audio";
}
