import type { PlaybackAngle } from "./playback-telemetry";

/** The telemetry angle of a recording: the sideline one is "timekeeper", never "opponent". */
export function playbackAngleOf(v: { is_mine: boolean; recording_type?: string | null }): PlaybackAngle {
  if (v.recording_type === "timekeeper") return "timekeeper";
  return v.is_mine ? "mine" : "opponent";
}
