/**
 * Timing budget for a match recording (jits-2zpe).
 *
 * The recorder's OS-level `maxDuration` used to be a hardcoded 600s, which
 * was EXACTLY the backend default `matches.duration_seconds` (jr_be
 * `20260204034401_create_matches_tables.sql:22`). Recording always starts
 * AFTER the match starts and pauses stretch wall-clock further, so on any
 * full-length match the OS cap fired BEFORE the match ended: the clip was
 * truncated, uploaded mid-match, and the real stop then no-opped.
 *
 * Everything here is pure arithmetic over the recorder's own retry
 * constants, so the cap and the delay budget cannot drift apart: change a
 * retry constant and the worst-case delay (and therefore the cap) moves
 * with it. The hook imports these rather than redeclaring them.
 */

// --- recorder retry constants (shared with use-video-recorder) ---

/**
 * Pending-stop hardening (jits-a8y.13): a stop issued before native
 * capture is live can be silently ignored on hardware, so it is re-issued
 * on this interval until `recordAsync` settles.
 */
export const PENDING_STOP_RETRY_MS = 250;
export const PENDING_STOP_MAX_ATTEMPTS = 8;

/**
 * Start hardening: `onCameraReady` can fire before the native session can
 * actually record, and sometimes never fires at all. A not-ready
 * `recordAsync` rejection is retried on this interval, and a start
 * deferred on readiness falls through after the backstop timeout.
 */
export const RECORD_START_RETRY_MS = 500;
export const RECORD_START_MAX_ATTEMPTS = 16;
export const CAMERA_READY_TIMEOUT_MS = 3000;

/**
 * How long the live step waits after the timer hits zero before firing the
 * end handler. Lives here so it is counted in the stop budget below rather
 * than being an untracked magic number in the step component.
 */
export const AUTO_END_DELAY_MS = 1000;

// --- derived delay budgets ---

/**
 * Worst case wall-clock between the match starting and the camera actually
 * recording: the deferred-start backstop plus the full not-ready retry
 * budget. Recording time that the match clock has already spent.
 */
export const WORST_CASE_START_DELAY_SECONDS = Math.ceil(
  (CAMERA_READY_TIMEOUT_MS + RECORD_START_MAX_ATTEMPTS * RECORD_START_RETRY_MS) / 1000,
);

/**
 * Worst case wall-clock between the match ending and `recordAsync`
 * settling: the auto-end delay plus the full stop re-issue budget. The
 * recording is still running for all of it, so the cap has to cover it.
 */
export const WORST_CASE_STOP_DELAY_SECONDS = Math.ceil(
  (AUTO_END_DELAY_MS + PENDING_STOP_MAX_ATTEMPTS * PENDING_STOP_RETRY_MS) / 1000,
);

/** Total slack the recording clock needs beyond the match clock itself. */
export const RECORDING_CLOCK_SLACK_SECONDS =
  WORST_CASE_START_DELAY_SECONDS + WORST_CASE_STOP_DELAY_SECONDS;

/**
 * Pause allowance. `pause_match` / `resume_match` stop the match clock but
 * NOT the camera, so every paused second is recorded wall-clock the match
 * duration does not account for. Ten minutes covers an injury check or a
 * belt re-tie; a pause longer than this trips the backstop, which is now
 * reported to the user instead of passing as a normal completion.
 */
export const RECORDING_PAUSE_SLACK_SECONDS = 600;

/** Floor, so a misconfigured very short match still gets usable headroom. */
export const RECORDING_CAP_MIN_SECONDS = 900;

/**
 * Ceiling. The cap is a last-resort backstop against a stop the hardware
 * silently dropped (observed live), so it must stay finite: an uncapped
 * recording would run until the device filled up, and a nonsense
 * `duration_seconds` would otherwise propagate straight into it.
 *
 * Two hours is far past any plausible grappling match and is already past
 * the point where the 2 GiB storage limit bites at 720p; that limit is
 * enforced separately pre-flight in `upload-recording.ts`.
 */
export const RECORDING_CAP_MAX_SECONDS = 7200;

/**
 * The longest match duration this cap can fully cover, headroom included.
 * Past this the ceiling clamps and a full-length recording would truncate,
 * which is the defect this module exists to prevent. Written down and
 * asserted rather than left implicit: at ~110 minutes it is far outside
 * anything the match flow configures today, but it is a real limit.
 */
export const MAX_FULLY_COVERED_MATCH_SECONDS =
  RECORDING_CAP_MAX_SECONDS - RECORDING_PAUSE_SLACK_SECONDS - RECORDING_CLOCK_SLACK_SECONDS;

/**
 * Tolerance for deciding that an unexpected `recordAsync` settle was the OS
 * cap rather than an interruption (a phone call, backgrounding, a stop whose
 * bookkeeping was lost). Generous because the elapsed measurement starts in
 * JS, one tick before native capture actually begins.
 */
export const CAP_DETECTION_TOLERANCE_MS = 2000;

/**
 * The OS recording cap for a match of `matchDurationSeconds`.
 *
 * Derived from the match's own configured duration rather than a second
 * hardcoded constant, so it cannot drift from the backend default the way
 * the old 600 did. Headroom = the pause allowance plus the start/stop
 * slack, so the cap is always STRICTLY greater than the longest recording
 * a match of that duration can legitimately produce without a pause longer
 * than the allowance.
 *
 * An unknown duration returns the ceiling rather than some assumed default:
 * when we cannot tell when the match ends, over-recording is recoverable
 * and truncation is not.
 */
export function computeMaxRecordingSeconds(matchDurationSeconds?: number | null): number {
  const known =
    typeof matchDurationSeconds === "number" &&
    Number.isFinite(matchDurationSeconds) &&
    matchDurationSeconds > 0;
  if (!known) return RECORDING_CAP_MAX_SECONDS;

  const needed =
    Math.ceil(matchDurationSeconds as number) +
    RECORDING_PAUSE_SLACK_SECONDS +
    RECORDING_CLOCK_SLACK_SECONDS;

  return Math.min(Math.max(needed, RECORDING_CAP_MIN_SECONDS), RECORDING_CAP_MAX_SECONDS);
}
