import type {
  MatchVideoAngle,
  MatchVideoAngleState,
  MatchVideoPhase,
  MatchVideoStatus,
} from "@jits/shared/api/match-video-status";
import { formatVideoDuration } from "@jits/shared/utils";
import type { AngleTone, LocalAngleJob } from "./angle-status";
import { keepOpenCopy } from "./upload-copy";
import {
  ANGLE_LABEL,
  countdownA11y,
  countdownTag,
  formatCountdown,
  PHASE_COPY,
  PHASE_TAG,
  ROW_HELPER,
  ROW_TAG,
  TIMEKEEPER_PHASE_COPY,
} from "./video-status-copy";

/**
 * The ONE derived view of a match's film status (jits-n2im.25): the server
 * document (`get_match_video_status`) plus, for the viewer's own angle on
 * the phone that recorded it, this phone's local upload job. Every surface
 * (the match detail Film status plate, the verdict Film block, the Film Room
 * badge) renders from this, so no two surfaces can disagree (COPY-DECK v2.2
 * section 9).
 *
 * Merge rule (contradiction rule 1): the phase and every other person's
 * angle come only from the server. "Your angle" follows the local job while
 * one exists and the server does not already have the angle ready.
 *
 * Gate (deck README, M10): copy that claims a multi-angle highlight ("uses
 * every angle", "from 2 angles", "we'll add it", late-angle lines) appears
 * only when the server's fusion fields are live for the match
 * (`fusionLive`). With `multi_angle_highlights_enabled` off (prod) they are
 * NULL and the single-angle copy is used.
 */

export type FilmRowAction = "retry" | "discard" | null;
export type FilmRowGlyph = "upload" | "clock" | "pause" | "check" | "alert" | "minus";
export type FilmViewerRole = "competitor" | "timekeeper";

export interface FilmRow {
  key: string;
  videoId: string | null;
  isMine: boolean;
  /** "Your angle" / "D. Okafor's angle". */
  label: string;
  /** "Timekeeper" beside a timekeeper's angle (competitor view), else null. */
  roleTag: string | null;
  /** The server-elected primary among 2+ ready angles (deck 13). */
  best: boolean;
  tag: string;
  tone: AngleTone;
  glyph: FilmRowGlyph;
  helper: string | null;
  /** 0..100 while uploading with a known total. */
  percent: number | null;
  /** "4:31" on a ready angle. */
  duration: string | null;
  /**
   * The angle has playable bytes (deck rule 4, read as PLAYABLE, coordinator
   * 2026-10-05): ready or no-match, or an analysing / pipeline-failed angle
   * whose file the playback query can sign. Analysis never gates playback.
   */
  watchable: boolean;
  action: FilmRowAction;
}

export interface FilmCountdown {
  remainingMs: number;
  label: string;
  a11y: string;
}

export interface FilmStatusView {
  role: FilmViewerRole;
  phase: MatchVideoPhase;
  /** Stable key for a phase-level announcement (no countdown digits). */
  phaseKey: string;
  phaseTag: string;
  phaseTone: AngleTone;
  line: string;
  helper: string | null;
  countdown: FilmCountdown | null;
  rows: FilmRow[];
  /** Video ids of the playable angles: the only ones anything may play. */
  playableVideoIds: string[];
  bestVideoId: string | null;
  fusionLive: boolean;
}

export interface FilmStatusInput {
  status: MatchVideoStatus;
  viewerId: string;
  /** This phone's job for the match (the viewer's own angle), or null. */
  local: LocalAngleJob | null;
  /** Device clock. */
  nowMs: number;
  /** Server clock minus device clock (from `server_now`). */
  clockOffsetMs: number;
  /** "Keep ELO RATED open" vs "keeps uploading" (jits-n2im.1 / .9). */
  backgroundUpload?: boolean;
  /**
   * The angles the playback query can play (`angleWatchable` on the
   * `get_match_details` rows), video id -> duration in seconds. Without it
   * (the timekeeper, or before that read lands) only ready and no-match
   * angles count as playable: the status alone cannot tell an analysing
   * file from one still merging.
   */
  playable?: ReadonlyMap<string, number | null> | null;
  /** The viewer Discarded this match's recording on this phone (deck 2a, no clip). */
  discardedHere?: boolean;
}

const PENDING: ReadonlySet<MatchVideoAngleState> = new Set(["waiting_for_phone", "uploading", "upload_paused", "processing"]);
const IN_FLIGHT: ReadonlySet<MatchVideoAngleState> = new Set(["uploading", "processing", "ready"]);
/** The viewer's own angle is still on its way to the server. */
const COMING: ReadonlySet<MatchVideoAngleState> = new Set(["waiting_for_phone", "uploading", "upload_paused"]);

function iso(v: string | null): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * `{until}` / `{film_until}`: "9:42 PM", "tomorrow 9:42 PM", else
 * "Oct 7, 9:42 PM", in the device's local time. Deterministic (no Intl).
 */
export function formatLocalTime(instantMs: number, nowMs: number): string {
  const d = new Date(instantMs);
  const h = d.getHours();
  const time = `${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(new Date(nowMs))) / 86_400_000);
  if (diff <= 0) return time;
  if (diff === 1) return `tomorrow ${time}`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${time}`;
}

/** True when the server document carries the fusion slice's fields for this match. */
export function isFusionLive(s: MatchVideoStatus): boolean {
  return (
    s.wait_extended !== null ||
    s.dispatched_at !== null ||
    s.angles_used !== null ||
    s.angles_used_count !== null ||
    s.late_angle_until !== null
  );
}

/** The viewer's relation to the match, from the document. */
export function viewerRole(s: MatchVideoStatus, viewerId: string): FilmViewerRole {
  if (s.reels.some((r) => r.athlete_id === viewerId)) return "competitor";
  const own = s.angles.find((a) => a.recorder_athlete_id === viewerId);
  return own?.role === "timekeeper" ? "timekeeper" : "competitor";
}

/** This phone's job can still deliver the angle (a terminal failure cannot). */
const localActive = (l: LocalAngleJob | null) => l != null && !l.terminal;

interface Ctx {
  s: MatchVideoStatus;
  viewerId: string;
  role: FilmViewerRole;
  local: LocalAngleJob | null;
  fusion: boolean;
  serverNow: number;
  nowMs: number;
  keepOpen: string;
  visible: MatchVideoAngle[];
  playable: ReadonlyMap<string, number | null> | null;
  /** This phone recorded the viewer's angle and it will never upload (terminal failure, or Discarded). */
  mineDead: boolean;
  /** Under admin review: no highlight is promised (wave 2 hid the note). */
  disputed: boolean;
}

/** The angle has bytes the player can open (see `FilmRow.watchable`). */
function canPlay(a: MatchVideoAngle, c: Pick<Ctx, "playable">): boolean {
  if (!a.video_id) return false;
  if (a.state === "ready" || a.state === "no_match") return true;
  if (a.state !== "processing" && a.state !== "failed") return false;
  return c.playable?.has(a.video_id) ?? false;
}

function nameOf(a: MatchVideoAngle): string {
  return a.recorder_name_short?.trim() || "";
}

function labelOf(a: MatchVideoAngle, viewerId: string): string {
  if (a.recorder_athlete_id === viewerId) return ANGLE_LABEL.mine;
  const n = nameOf(a);
  return n ? ANGLE_LABEL.named(n) : ANGLE_LABEL.fallback;
}

/** Mid-sentence reference: "D. Okafor's angle" / "your angle". */
function refOf(a: MatchVideoAngle, viewerId: string): string {
  return a.recorder_athlete_id === viewerId ? ANGLE_LABEL.mineRef : labelOf(a, viewerId);
}

function toneGlyph(tone: AngleTone, paused = false): FilmRowGlyph {
  if (paused) return "pause";
  switch (tone) {
    case "progress":
      return "upload";
    case "waiting":
      return "clock";
    case "done":
      return "check";
    case "negative":
      return "alert";
    default:
      return "minus";
  }
}

type RowBody = Pick<FilmRow, "tag" | "tone" | "helper" | "percent" | "action"> & { paused?: boolean };

function body(tag: string, tone: AngleTone, helper: string | null = null, extra: Partial<RowBody> = {}): RowBody {
  return { tag, tone, helper, percent: null, action: null, ...extra };
}

/** Deck 2a: this phone's own job wins for "Your angle". */
function localRow(job: LocalAngleJob, keepOpen: string): RowBody {
  switch (job.status) {
    case "pending":
      return body(ROW_TAG.uploading, "progress", keepOpen);
    case "uploading": {
      const p = job.progress != null && Number.isFinite(job.progress) ? Math.round(Math.max(0, Math.min(1, job.progress)) * 100) : null;
      return body(ROW_TAG.uploading, "progress", keepOpen, { percent: p });
    }
    case "paused":
      return body(ROW_TAG.paused, "waiting", job.message ?? null, { action: "retry", paused: true });
    default:
      if (job.terminal) {
        return body(ROW_TAG.didntUpload, "info", job.message ?? ROW_HELPER.clipGone, { action: job.discardable ? "discard" : null });
      }
      return body(ROW_TAG.didntUpload, "negative", job.message ?? ROW_HELPER.uploadDidntFinish, { action: "retry" });
  }
}

/** Deck 2a (server states) and 2b: the viewer's own angle as the server sees it. */
function mineServerRow(a: MatchVideoAngle, c: Ctx): RowBody {
  switch (a.state) {
    case "waiting_for_phone":
      // Deck 2a on the phone that recorded, once its clip is gone (Discard):
      // never the other-device "open the phone that recorded" copy.
      if (c.mineDead) return body(ROW_TAG.notUploaded, "info", ROW_HELPER.clipGone);
      return body(ROW_TAG.waitingYourPhone, "waiting", ROW_HELPER.openToStart);
    case "uploading":
      return body(ROW_TAG.uploading, "progress", null, { percent: a.progress_pct });
    case "upload_paused":
      return body(ROW_TAG.paused, "waiting", ROW_HELPER.openToFinish, { paused: true });
    case "abandoned":
      return body(ROW_TAG.didntUpload, "info", ROW_HELPER.didntFinishThere);
    case "processing":
      // Bytes in, analysis running: it already plays (wave 2 "Analyzing").
      return canPlay(a, c) ? body(ROW_TAG.analyzing, "waiting") : body(ROW_TAG.processing, "waiting");
    case "ready":
      return body(ROW_TAG.ready, "done");
    case "no_match":
      return body(ROW_TAG.notUsed, "info", ROW_HELPER.noMatchMine);
    default: {
      // failed (pipeline): the file may still play; grey either way (0.6).
      const tag = canPlay(a, c) ? ROW_TAG.analysisFailed : ROW_TAG.notUsed;
      if (c.role === "timekeeper") return body(tag, "info", ROW_HELPER.timekeeperFailed);
      const other = c.visible.find((b) => b !== a && b.state === "ready");
      return body(tag, "info", other ? ROW_HELPER.mineFailedUsesOther(nameOf(other) || ANGLE_LABEL.fallback) : ROW_HELPER.mineFailedNothing);
    }
  }
}

/** Deck 2c / 2d (competitor viewer) and 2e (timekeeper viewer): someone else's angle. */
function otherRow(a: MatchVideoAngle, c: Ctx): RowBody {
  const tk = c.role === "timekeeper";
  const name = nameOf(a) || ANGLE_LABEL.fallback;
  // "After dispatch" only exists with the fusion gate (the build used a set
  // of angles); before it, the late-angle promises would be false.
  const after = c.fusion && c.s.dispatched_at != null && (c.s.phase === "building" || c.s.phase === "ready") && a.used !== true;
  const untilMs = iso(c.s.late_angle_until);
  const closed = after && untilMs != null && c.serverNow >= untilMs;
  const until = untilMs != null ? formatLocalTime(untilMs, c.nowMs) : null;
  const afterHelper = (processing: boolean): string | null => {
    if (!after || until == null) return null;
    if (tk) return ROW_HELPER.timekeeperAddUntil(until);
    return processing ? ROW_HELPER.addIfInBy(until) : ROW_HELPER.addUntil(until);
  };
  const pendingClosed = (): RowBody | null =>
    closed && !tk ? body(ROW_TAG.notInTerm, "info", ROW_HELPER.stillWatchable) : null;

  switch (a.state) {
    case "waiting_for_phone":
      return pendingClosed() ?? body(ROW_TAG.waitingTheirPhone, "waiting", after ? afterHelper(false) : ROW_HELPER.theirPhone(name));
    case "uploading":
      return pendingClosed() ?? body(ROW_TAG.uploading, "progress", after ? afterHelper(false) : null, { percent: a.progress_pct });
    case "upload_paused":
      return pendingClosed() ?? body(ROW_TAG.paused, "waiting", after ? afterHelper(false) : ROW_HELPER.quiet(name), { paused: true });
    case "processing":
      return body(canPlay(a, c) ? ROW_TAG.analyzing : ROW_TAG.processing, "waiting", after && !closed ? afterHelper(true) : null);
    case "ready":
      return body(ROW_TAG.ready, "done");
    case "no_match":
      return body(ROW_TAG.notUsed, "info", ROW_HELPER.noMatchOther);
    case "failed":
      return body(canPlay(a, c) ? ROW_TAG.analysisFailed : ROW_TAG.notUsed, "info", ROW_HELPER.otherFailed);
    default: {
      // abandoned: grey, never red on someone else's angle (deck 0.5).
      if (tk) return body(ROW_TAG.didntUpload, "info");
      if (a.role === "timekeeper") {
        const any = c.visible.some((b) => b !== a && b.state === "ready");
        return body(ROW_TAG.didntUpload, "info", any ? ROW_HELPER.usesOtherAngles : null);
      }
      const mine = c.visible.find((b) => b.recorder_athlete_id === c.viewerId);
      return body(ROW_TAG.didntUpload, "info", mine?.state === "ready" ? ROW_HELPER.usesYourAngle : null);
    }
  }
}

function buildRows(c: Ctx): FilmRow[] {
  const mine = c.visible.filter((a) => a.recorder_athlete_id === c.viewerId);
  const others = c.visible.filter((a) => a.recorder_athlete_id !== c.viewerId);
  const ordered = [
    ...mine,
    ...others.filter((a) => a.role !== "timekeeper"),
    ...others.filter((a) => a.role === "timekeeper"),
  ];
  const playable = c.visible.filter((a) => canPlay(a, c));
  const bestId = playable.length >= 2 ? (playable.find((a) => a.is_primary)?.video_id ?? null) : null;

  const rows: FilmRow[] = ordered.map((a) => {
    const isMine = a.recorder_athlete_id === c.viewerId;
    // The local job wins while it exists, unless the angle already plays
    // (a row that plays keeps saying what it is, as in wave 2).
    const plays = canPlay(a, c);
    const useLocal = isMine && c.local != null && !plays;
    const b = useLocal ? localRow(c.local!, c.keepOpen) : isMine ? mineServerRow(a, c) : otherRow(a, c);
    const watchable = !useLocal && plays;
    return {
      key: a.video_id ?? `angle-${a.recorder_athlete_id}`,
      videoId: a.video_id,
      isMine,
      label: labelOf(a, c.viewerId),
      roleTag: a.role === "timekeeper" && !isMine ? ANGLE_LABEL.timekeeperTag : null,
      best: watchable && a.video_id === bestId,
      tag: b.tag,
      tone: b.tone,
      glyph: toneGlyph(b.tone, b.paused),
      helper: b.helper,
      percent: b.percent,
      duration: watchable ? formatVideoDuration(a.duration_s ?? (a.video_id ? c.playable?.get(a.video_id) : null)) : null,
      watchable,
      action: b.action,
    };
  });

  // A local job with no server row for this viewer yet (the reservation has
  // not landed, or the intent row said "not recording"): still "Your angle".
  if (c.local && !c.s.angles.some((a) => a.recorder_athlete_id === c.viewerId && a.state !== "not_recording")) {
    const b = localRow(c.local, c.keepOpen);
    rows.unshift({
      key: "angle-local",
      videoId: null,
      isMine: true,
      label: ANGLE_LABEL.mine,
      roleTag: null,
      best: false,
      tag: b.tag,
      tone: b.tone,
      glyph: toneGlyph(b.tone, b.paused),
      helper: b.helper,
      percent: b.percent,
      duration: null,
      watchable: false,
      action: b.action,
    });
  }
  return rows;
}

interface PhaseOut {
  key: string;
  tag: string;
  tone: AngleTone;
  line: string;
  helper: string | null;
  countdown: FilmCountdown | null;
}

function phaseOut(key: string, tag: string, tone: AngleTone, line: string, helper: string | null = null, countdown: FilmCountdown | null = null): PhaseOut {
  return { key, tag, tone, line, helper, countdown };
}

/** The viewer's own highlight outcome once it is final (M1: it beats the match-level phase). */
function ownReelOut(c: Ctx): PhaseOut | null {
  const reel = c.s.reels.find((r) => r.athlete_id === c.viewerId) ?? null;
  if (!reel) return null;
  if (reel.state === "none") {
    return phaseOut(`film_only_${reel.none_reason ?? "none"}`, PHASE_TAG.filmReady, "done", PHASE_COPY.filmOnlyLine, reel.none_reason === "no_clear_moment" ? PHASE_COPY.noClearMomentHelper : null);
  }
  if (reel.state === "failed") {
    return phaseOut("film_only_failed", PHASE_TAG.filmReady, "done", PHASE_COPY.filmOnlyLine, PHASE_COPY.reelFailedHelper);
  }
  if (reel.state === "ready" || reel.state === "none_dominant_fallback") {
    if (c.fusion && reel.origin === "late_angle") {
      const late = c.visible.find((a) => a.used === true && a.recorder_athlete_id !== c.viewerId);
      if (late) return phaseOut("ready_late", PHASE_TAG.ready, "done", PHASE_COPY.readyLine, PHASE_COPY.readyLateAddedHelper(refOf(late, c.viewerId)));
    }
    return phaseOut("ready", PHASE_TAG.ready, "done", PHASE_COPY.readyLine);
  }
  return null;
}

function derivePhase(c: Ctx): PhaseOut {
  const { s, role, fusion } = c;
  const tk = role === "timekeeper";
  // My own angle that will never arrive (terminal failure or Discard on this
  // phone) is not "coming": it does not count as pending or expected.
  const mineGone = c.mineDead
    ? c.visible.find((a) => a.recorder_athlete_id === c.viewerId && a.state === "waiting_for_phone") ?? null
    : null;
  const live = mineGone ? c.visible.filter((a) => a !== mineGone) : c.visible;
  const pending = live.filter((a) => PENDING.has(a.state) && a.used !== true);
  const ownJobActive = localActive(c.local);

  // M1: once the viewer's own highlight is final, their line follows it,
  // not the match-level "building" that waits on the other athlete's reel.
  if (!tk && (s.phase === "building" || s.phase === "waiting_for_angle")) {
    const own = ownReelOut(c);
    if (own) return own;
  }

  // A local job on THIS phone is an angle the server has not heard of yet:
  // never "No video yet" / "No one recorded it" over "Your angle: Uploading".
  const nothingKnown = s.phase_reason === "no_video_yet" || s.phase_reason === "nobody_recorded";
  const phase: MatchVideoPhase = nothingKnown && ownJobActive ? "collecting" : s.phase;

  switch (phase) {
    case "recording":
      return tk
        ? phaseOut("recording", PHASE_TAG.recording, "progress", TIMEKEEPER_PHASE_COPY.recordingLine, TIMEKEEPER_PHASE_COPY.recordingHelper)
        : phaseOut("recording", PHASE_TAG.recording, "progress", PHASE_COPY.recordingLine);

    case "collecting": {
      if (s.phase_reason === "no_video_yet" && !ownJobActive) {
        return phaseOut("no_video_yet", PHASE_TAG.noVideoYet, "info", PHASE_COPY.noVideoLine, PHASE_COPY.noVideoHelper);
      }
      // Nothing else is coming and mine never will: no film from this phone's view.
      if (mineGone && !ownJobActive && pending.length === 0 && !live.some((a) => IN_FLIGHT.has(a.state))) {
        return phaseOut("no_film_here", PHASE_TAG.noFilm, "info", PHASE_COPY.noFilmLine, tk ? TIMEKEEPER_PHASE_COPY.noFilmHelper : PHASE_COPY.noneUsableHelper);
      }
      // The timekeeper keeps its own 4b copy, before the analysing variants.
      if (tk) {
        return phaseOut("collecting", PHASE_TAG.uploading, "progress", TIMEKEEPER_PHASE_COPY.collectingLine, ownJobActive ? c.keepOpen : null);
      }
      // v2.4 / v2.5 (review M2, R2-M1): bytes are in for an angle and analysis
      // is running. "Your film is in" only when the processing angle is the
      // viewer's own and nothing of theirs is still coming; otherwise (the
      // opponent finished first) "Film is coming in. Analyzing what's here so
      // far." The tag says Analyzing only when a processing angle already
      // plays, else Processing (still merging), matching its row.
      const processing = live.filter((a) => a.state === "processing");
      if (processing.length > 0) {
        const mine = live.find((a) => a.recorder_athlete_id === c.viewerId) ?? null;
        const mineComing = ownJobActive || (mine != null && COMING.has(mine.state));
        const mineIn = processing.some((a) => a.recorder_athlete_id === c.viewerId);
        const tag = processing.some((a) => canPlay(a, c)) ? PHASE_TAG.analyzing : PHASE_TAG.processing;
        return mineIn && !mineComing
          ? phaseOut("collecting_in", tag, "waiting", PHASE_COPY.filmInLine)
          : phaseOut("collecting_in_partial", tag, "waiting", PHASE_COPY.filmComingInLine);
      }
      const k = Math.max(s.angles_expected - (mineGone ? 1 : 0), ownJobActive ? 1 : 0);
      const line = k >= 2 ? PHASE_COPY.collectingManyLine(k) : PHASE_COPY.collectingOneLine;
      const graceMs = iso(s.no_video_grace_until);
      const windowMs = iso(s.film_window_until);
      const nothingIn =
        !ownJobActive && !live.some((a) => IN_FLIGHT.has(a.state)) && graceMs != null && c.serverNow >= graceMs;
      if (nothingIn && windowMs != null) {
        return phaseOut("collecting_window", PHASE_TAG.uploading, "progress", line, PHASE_COPY.collectingWindowHelper(formatLocalTime(windowMs, c.nowMs)));
      }
      const helper = k >= 2 && fusion ? PHASE_COPY.collectingManyHelper : PHASE_COPY.collectingOneHelper;
      return phaseOut(`collecting_${k >= 2 ? "many" : "one"}`, PHASE_TAG.uploading, "progress", line, helper);
    }

    case "waiting_for_angle": {
      const deadline = iso(s.wait_deadline_at);
      let tag: string = PHASE_TAG.waiting;
      let countdown: FilmCountdown | null = null;
      if (deadline != null && s.server_now) {
        const remaining = deadline - c.serverNow;
        if (remaining > 0) {
          const label = formatCountdown(remaining);
          countdown = { remainingMs: remaining, label, a11y: countdownA11y(Math.ceil(remaining / 1000)) };
          tag = countdownTag(label);
        } else {
          tag = PHASE_TAG.anySecond;
        }
      }
      const first = pending[0] ?? live.find((a) => a.state !== "ready") ?? null;
      const ref = first ? refOf(first, c.viewerId) : ANGLE_LABEL.mineRef;
      if (s.wait_extended === true && !tk) {
        const inAngle = pending.find((a) => a.state === "processing") ?? first;
        return phaseOut("waiting_extended", tag, "waiting", PHASE_COPY.waitExtendedLine(inAngle ? refOf(inAngle, c.viewerId) : ref), PHASE_COPY.waitExtendedHelper, countdown);
      }
      const many = pending.length >= 2;
      const line = many ? PHASE_COPY.waitManyLine(pending.length) : PHASE_COPY.waitOneLine(ref);
      const helper = tk ? TIMEKEEPER_PHASE_COPY.waitHelper : many ? PHASE_COPY.waitManyHelper : PHASE_COPY.waitOneHelper;
      return phaseOut(`waiting_${many ? "many" : "one"}`, tag, "waiting", line, helper, countdown);
    }

    case "building": {
      const n = fusion ? s.angles_used_count : null;
      if (tk) {
        return phaseOut("building", PHASE_TAG.building, "waiting", n != null && n >= 2 ? TIMEKEEPER_PHASE_COPY.buildingFromLine(n) : TIMEKEEPER_PHASE_COPY.buildingLine);
      }
      const missed = fusion && s.dispatched_at != null && s.dispatch_reason === "wait_expired" ? pending : [];
      if (missed.length > 0) {
        const used = c.visible.filter((a) => a.used === true);
        let line: string;
        if (used.length === 1) {
          line = used[0].recorder_athlete_id === c.viewerId ? PHASE_COPY.buildingFromYourAngle : PHASE_COPY.buildingFromNamedAngle(nameOf(used[0]) || ANGLE_LABEL.fallback);
        } else {
          line = n != null && n >= 2 ? PHASE_COPY.buildingFromLine(n) : PHASE_COPY.buildingLine;
        }
        return phaseOut("building_missed", PHASE_TAG.building, "waiting", line, PHASE_COPY.lateAngleHelper(refOf(missed[0], c.viewerId)));
      }
      const line = n != null && n >= 2 ? PHASE_COPY.buildingFromLine(n) : PHASE_COPY.buildingLine;
      return phaseOut(`building_${n ?? 1}`, PHASE_TAG.building, "waiting", line, PHASE_COPY.buildingHelper);
    }

    case "ready": {
      if (tk) return phaseOut("ready", PHASE_TAG.ready, "done", TIMEKEEPER_PHASE_COPY.readyLine);
      return ownReelOut(c) ?? phaseOut("ready", PHASE_TAG.ready, "done", PHASE_COPY.readyLine);
    }

    default: {
      // no_film
      const reason = s.phase_reason;
      if (reason === "match_cancelled") return phaseOut("no_film_cancelled", PHASE_TAG.noFilm, "info", PHASE_COPY.noFilmLine, PHASE_COPY.cancelledHelper);
      if (tk) return phaseOut("no_film", PHASE_TAG.noFilm, "info", PHASE_COPY.noFilmLine, TIMEKEEPER_PHASE_COPY.noFilmHelper);
      const helper =
        reason === "nobody_recorded"
          ? PHASE_COPY.nobodyRecordedHelper
          : reason === "window_closed"
            ? PHASE_COPY.windowClosedHelper
            : PHASE_COPY.noneUsableHelper;
      return phaseOut(`no_film_${reason ?? "none"}`, PHASE_TAG.noFilm, "info", PHASE_COPY.noFilmLine, helper);
    }
  }
}

/** Phase keys whose helper promises a highlight (or its timing). */
const PROMISE_KEYS = /^(collecting_(one|many)|waiting_|building_|ready_late)/;

/**
 * A disputed result is under admin review, so nothing promises a highlight
 * (wave 2 hid the note for the same reason): the line stays, the helper goes.
 */
function withoutPromises(ph: PhaseOut, disputed: boolean): PhaseOut {
  if (!disputed) return ph;
  // Building implies a ready angle: on a disputed match it reads as film
  // only, never "Building your highlight" (round 2 nit).
  if (ph.key.startsWith("building_")) return { ...ph, key: "disputed_film", tag: PHASE_TAG.filmReady, tone: "done", line: PHASE_COPY.filmOnlyLine, helper: null };
  return PROMISE_KEYS.test(ph.key) ? { ...ph, helper: null } : ph;
}

export function deriveFilmStatus(input: FilmStatusInput): FilmStatusView {
  const { status: s, viewerId, local, nowMs, clockOffsetMs } = input;
  const role = viewerRole(s, viewerId);
  const c: Ctx = {
    s,
    viewerId,
    role,
    local,
    fusion: isFusionLive(s),
    serverNow: nowMs + clockOffsetMs,
    nowMs,
    keepOpen: keepOpenCopy(input.backgroundUpload ?? false),
    // `not_recording` rows are never drawn (deck 1).
    visible: s.angles.filter((a) => a.state !== "not_recording"),
    playable: input.playable ?? null,
    mineDead: input.local?.terminal === true || (input.local == null && input.discardedHere === true),
    disputed: s.match_status === "disputed",
  };
  const ph = withoutPromises(derivePhase(c), c.disputed);
  const rows = buildRows(c);
  return {
    role,
    phase: s.phase,
    phaseKey: ph.key,
    phaseTag: ph.tag,
    phaseTone: ph.tone,
    line: ph.line,
    helper: ph.helper,
    countdown: ph.countdown,
    rows,
    playableVideoIds: rows.filter((r) => r.watchable && r.videoId).map((r) => r.videoId!),
    bestVideoId: rows.find((r) => r.best)?.videoId ?? null,
    fusionLive: c.fusion,
  };
}

/** Screen-reader label for one row (deck 10.2): "{label}, {tag}, {helper}". */
export function filmRowA11yLabel(row: FilmRow, bestLabel: string): string {
  return [row.label, row.roleTag, row.best ? bestLabel : null, row.tag, row.percent != null ? `${row.percent} percent` : null, row.helper]
    .filter(Boolean)
    .join(", ");
}
