/**
 * Every capture string the app shows, keyed by its copy deck id
 * (`design/native-screens/proposals/2026-10-15-timekeeper/COPY-DECK.md`,
 * "Capture: portrait guidance, wide lens, capture quality"; timekeeper mode
 * spec 13; clean-code rule M-R4). They replace the shipped sideways ready
 * hint, retired in both modes and in practice (A21, A23).
 *
 * Not here: TK-CAP1, the `match_capture_1080p` description, which the backend
 * migration writes to `feature_flags.description` (Admin > Feature flags
 * shows it). No athlete-facing string mentions the capture resolution.
 */
import type { MatchVideoCaptureLens } from "@jits/shared/api/match-video-upload";
import type { CapturePolicy } from "@/lib/match-flow/capture-policy";

export const CAPTURE_COPY = {
  /** The timekeeper's recorder hint while the ultrawide is selected (an iPhone with one). */
  "TK-REC1": "Hold your phone upright. The wide lens keeps the whole mat in frame.",
  /** The timekeeper's recorder hint with no ultrawide (Android, older iPhones). */
  "TK-REC1b": "Hold your phone upright. Step back so the whole mat fits.",
  /** An athlete's recorder hint on the ready step, both modes and practice. */
  "TK-REC2": "Hold your phone upright and keep both of you in frame.",
  /** The tag on the timekeeper's preview while the ultrawide is selected. */
  "TK-REC3": { text: "WIDE LENS", a11y: "Recording with the wide lens" },
} as const;

export type CaptureCopyId = keyof typeof CAPTURE_COPY;
export type ReadyHintId = "TK-REC1" | "TK-REC1b" | "TK-REC2";

/**
 * The framing hint under the ready preview. Portrait guidance only: a
 * landscape capture (the spec 13.6 review seam) has no deck string yet, so it
 * shows none rather than a portrait instruction.
 */
export function readyHintFor(policy: CapturePolicy, lens: MatchVideoCaptureLens): ReadyHintId | null {
  if (policy.recordingOrientation !== "portrait_locked") return null;
  if (policy.captureLens === "default") return "TK-REC2";
  return lens === "ultrawide" ? "TK-REC1" : "TK-REC1b";
}
