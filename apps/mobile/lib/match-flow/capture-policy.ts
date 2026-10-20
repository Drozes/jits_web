/**
 * The capture policy: how each role in each mode records a match (timekeeper
 * mode spec 13; owner decisions A21 to A23; ARCHITECTURE 2.1 and 2.8). The
 * one place that chooses a recording orientation or a lens (clean-code rule
 * M-R12); the capture quality is the admin flag
 * (`lib/video/use-capture-quality.ts`) and the lens is found by
 * `lib/video/select-capture-lens.ts`.
 *
 *  - Portrait for everyone (A21), in both modes and in practice (A23): the
 *    ready check and the live step lock portrait, and the ready preview is
 *    the recorded 9:16 frame, so what the athlete frames is what is recorded.
 *  - The timekeeper prefers the ultrawide (0.5x) lens to keep the whole mat
 *    in frame (A21; iOS only). The athletes keep the default lens.
 *
 * `landscape_locked` and `free` stay supported by the orientation controller,
 * the wide preview card and the landscape live layout: the spec 13.6 review
 * turns a landscape timekeeper on by changing one row here.
 *
 * Pure, with type-only imports by relative path, like `match-roles.ts`.
 */
import type { MatchMode, MatchRoles, ViewerRole } from "./match-roles";
import type { ReadyPreviewShape } from "../video/recorded-frame";

/**
 * How the match is recorded (`MatchOrientationController`):
 *  - "portrait_locked": portrait on every step (A21);
 *  - "landscape_locked": the ready check turns to landscape (either side)
 *    and going live locks the side it is in;
 *  - "free": the ready check follows the phone and going live locks
 *    whichever side the interface is in (the flow before A21).
 */
export type RecordingOrientation = "free" | "portrait_locked" | "landscape_locked";

/** Which lens the viewfinder asks for; `select-capture-lens.ts` finds it on the phone. */
export type CaptureLensPreference = "ultrawide_preferred" | "default";

export interface CapturePolicy {
  readonly recordingOrientation: RecordingOrientation;
  readonly captureLens: CaptureLensPreference;
}

/** Both athletes, in both modes, and practice. */
const ATHLETE: CapturePolicy = { recordingOrientation: "portrait_locked", captureLens: "default" };

/** The seated timekeeper (landscape is the spec 13.6 review trigger, not the default). */
const TIMEKEEPER: CapturePolicy = { recordingOrientation: "portrait_locked", captureLens: "ultrawide_preferred" };

/**
 * One row per role per mode (the capture rows of the ARCHITECTURE 2.1 table).
 * A two-athlete match has no timekeeper role (`deriveMatchRoles` never yields
 * one), so its timekeeper cell only completes the table.
 */
export const CAPTURE_POLICY: Readonly<Record<MatchMode, Readonly<Record<ViewerRole, CapturePolicy>>>> = {
  self_run: { challenger: ATHLETE, opponent: ATHLETE, timekeeper: ATHLETE },
  timekeeper: { challenger: ATHLETE, opponent: ATHLETE, timekeeper: TIMEKEEPER },
};

/** Practice records like an athlete in a match (A23). */
export const PRACTICE_CAPTURE: CapturePolicy = ATHLETE;

/** This viewer's capture policy in this match. */
export function capturePolicyFor(roles: Pick<MatchRoles, "mode" | "viewer">): CapturePolicy {
  return CAPTURE_POLICY[roles.mode][roles.viewer];
}

/**
 * The ready check's preview: the recorded frame under the portrait lock
 * (9:16, what-you-see-is-what-you-get); the wide 16:9 card otherwise, the
 * frame the phone records once it is turned sideways.
 */
export function readyPreviewShapeFor(orientation: RecordingOrientation): ReadyPreviewShape {
  return orientation === "portrait_locked" ? "recorded" : "wide";
}
