import type { MatchDetailVideo } from "@jits/shared/api/queries";

/**
 * How far an angle's sync offset can be trusted (research 01, section 3):
 *
 *   reference  the timeline's own angle (the server-elected primary, else
 *              the angle the player opened on). Its audio is the master
 *              clock while an audio-synced angle is on screen.
 *   audio      `sync_source = 'audio'` with a numeric `sync_confidence`,
 *              and a numeric offset on both it and the reference: about one
 *              frame (20 to 40 ms). Lock-stepped; switches are a cut and
 *              keep the reference's audio.
 *   clock      anything else: `sync_source` 'clock', 'manual' or missing,
 *              a null confidence, or no offset. Off by up to seconds. Never
 *              lock-stepped; a switch to or from it dips to black, it plays
 *              its own audio, and it wears "Approx. sync".
 *
 * `sync_source` / `sync_confidence` arrive on `get_match_details` videos
 * (jr_be feat/playback-encode). Until they do, every non-reference angle
 * is "clock": absence never upgrades trust.
 */
export type SyncTrust = "reference" | "audio" | "clock";

/** The sync fields this player reads off a match video (all optional until jr_be ships them). */
export interface SyncFields {
  sync_offset_ms?: number | null;
  sync_source?: string | null;
  sync_confidence?: number | null;
}

export type AngleVideo = MatchDetailVideo & SyncFields;

function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** The offset to use for an angle: the row's own, else the separately read map (getVideoSyncOffsets). */
export function offsetOf(v: AngleVideo, fallback: Record<string, number | null | undefined>): number | null {
  if (num(v.sync_offset_ms)) return v.sync_offset_ms;
  const f = fallback[v.id];
  return num(f) ? f : null;
}

export function syncTrust(v: AngleVideo, referenceId: string, offsets: Record<string, number | null | undefined>): SyncTrust {
  if (v.id === referenceId) return "reference";
  const source = typeof v.sync_source === "string" ? v.sync_source.trim().toLowerCase() : null;
  if (source !== "audio" || !num(v.sync_confidence)) return "clock";
  return num(offsets[v.id]) && num(offsets[referenceId]) ? "audio" : "clock";
}

/** Lock-step and audio-bed eligible. */
export function isHard(trust: SyncTrust): boolean {
  return trust !== "clock";
}

/** The timeline's angle: the server's Best angle when it can play, else the angle the player opened on. */
export function referenceAngleId(videos: Array<Pick<MatchDetailVideo, "id" | "is_primary" | "playability">>, entryId: string): string {
  const primary = videos.find((v) => v.is_primary === true && (v.playability == null || v.playability === "playable"));
  return primary?.id ?? entryId;
}
