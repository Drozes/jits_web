import type { RecordingState } from "@/lib/video/use-video-recorder";

/** How long the End button has to be held down. Same in practice. */
export const HOLD_TO_END_MS = 1200;
/** How long the "opponent ended the match" plate shows before the END step. */
export const OPPONENT_ENDED_INTERSTITIAL_MS = 1500;
/** The final-seconds countdown strip starts at this many seconds left. */
export const FINAL_SECONDS = 10;

export type StripVariant = "hold" | "paused" | "timeup" | "final10" | "starting";
export type TallyVariant = "rec" | "starting" | "noVideo" | "saving";
export type SlabLabel = "live" | "paused" | "time" | "final";
export type CameraTreatment = "live" | "starting-dim" | "saving-dim" | "unavailable";
export type UnavailableVariant = "canAsk" | "denied" | "error";

export interface LiveViewInput {
  remaining: number;
  paused: boolean;
  holding: boolean;
  recorderState: RecordingState;
  permission: { granted: boolean; canAskAgain: boolean } | null;
  opponentEnded: boolean;
}

export interface LiveView {
  strip: StripVariant | null;
  tally: TallyVariant;
  slab: SlabLabel;
  camera: CameraTreatment;
  /** Set only when `camera` is "unavailable". */
  unavailable: UnavailableVariant | null;
  /** The clock is at 00:00 on a running clock: auto-end owns the End button. */
  autoEndPending: boolean;
}

const SAVING_STATES: ReadonlySet<RecordingState> = new Set<RecordingState>([
  "recording",
  "stopping",
  "uploading",
  "uploaded",
]);

/** Everything the live broadcast screen shows, derived from the live state. */
export function deriveLiveView(input: LiveViewInput): LiveView {
  const { remaining, paused, holding, recorderState, permission, opponentEnded } = input;
  const granted = permission?.granted ?? false;
  const autoEndPending = remaining === 0 && !paused && !opponentEnded;

  let unavailable: UnavailableVariant | null = null;
  if (!granted) unavailable = permission?.canAskAgain === false ? "denied" : "canAsk";
  else if (recorderState === "error") unavailable = "error";

  const starting = granted && recorderState === "idle" && remaining > 0 && !opponentEnded;

  let strip: StripVariant | null = null;
  if (opponentEnded) strip = null;
  else if (holding) strip = "hold";
  else if (paused) strip = "paused";
  else if (autoEndPending) strip = "timeup";
  else if (remaining >= 1 && remaining <= FINAL_SECONDS) strip = "final10";
  else if (starting) strip = "starting";

  let tally: TallyVariant;
  if (opponentEnded) tally = SAVING_STATES.has(recorderState) ? "saving" : "noVideo";
  else if (unavailable) tally = "noVideo";
  else if (recorderState === "recording") tally = "rec";
  else tally = "starting";

  let slab: SlabLabel;
  if (opponentEnded) slab = "final";
  else if (paused) slab = "paused";
  else if (remaining === 0) slab = "time";
  else slab = "live";

  let camera: CameraTreatment;
  if (opponentEnded) camera = "saving-dim";
  else if (unavailable) camera = "unavailable";
  else if (starting) camera = "starting-dim";
  else camera = "live";

  return {
    strip,
    tally,
    slab,
    camera,
    unavailable: camera === "unavailable" ? unavailable : null,
    autoEndPending,
  };
}

/** Seconds as MM:SS, the match clock's format. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Seconds as speech, for screen readers: "2 minutes 14 seconds". */
export function spokenDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const min = `${m} ${m === 1 ? "minute" : "minutes"}`;
  const sec = `${r} ${r === 1 ? "second" : "seconds"}`;
  if (m === 0) return sec;
  if (r === 0) return min;
  return `${min} ${sec}`;
}

/** "MM:SS" back to seconds (NaN-safe: returns 0 on anything else). */
export function parseClock(formatted: string): number {
  const match = /^(\d+):(\d{2})$/.exec(formatted.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * The athlete bar's meta line: "1512 · 77 KG". Either part is left out when
 * missing, and the line is null when both are. Weight keeps at most one
 * decimal.
 */
export function formatAthleteMeta(elo: number | null | undefined, weightKg: number | null | undefined): string | null {
  const parts: string[] = [];
  if (elo != null && Number.isFinite(elo)) parts.push(String(Math.round(elo)));
  if (weightKg != null && Number.isFinite(weightKg)) parts.push(`${Number(weightKg.toFixed(1))} KG`);
  return parts.length ? parts.join(" · ") : null;
}
