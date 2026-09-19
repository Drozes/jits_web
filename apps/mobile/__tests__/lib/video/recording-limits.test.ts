/**
 * Regression tests for the recording cap (jits-2zpe).
 *
 * THE DEFECT: `maxDuration` was a hardcoded 600, EXACTLY the backend
 * default `matches.duration_seconds` (jr_be
 * `20260204034401_create_matches_tables.sql:22`). Recording always starts
 * after the match starts (a camera-ready backstop plus a not-ready retry
 * budget) and pauses stretch wall-clock further, so on a full-length match
 * the OS cap fired BEFORE the match ended. That hit the "settled without an
 * explicit stop" branch, which uploaded the truncated clip mid-match, and
 * the real stop then no-opped. The last minutes were never captured.
 *
 * The invariant these tests pin is the one the old code violated: the cap
 * must be STRICTLY GREATER than the match duration plus the worst-case
 * start delay, for every duration the match flow can configure.
 */
import {
  AUTO_END_DELAY_MS,
  CAMERA_READY_TIMEOUT_MS,
  MAX_FULLY_COVERED_MATCH_SECONDS,
  PENDING_STOP_MAX_ATTEMPTS,
  PENDING_STOP_RETRY_MS,
  RECORDING_CAP_MAX_SECONDS,
  RECORDING_CAP_MIN_SECONDS,
  RECORDING_CLOCK_SLACK_SECONDS,
  RECORDING_PAUSE_SLACK_SECONDS,
  RECORD_START_MAX_ATTEMPTS,
  RECORD_START_RETRY_MS,
  STOP_WATCHDOG_MS,
  WORST_CASE_START_DELAY_SECONDS,
  WORST_CASE_STOP_DELAY_SECONDS,
  computeMaxRecordingSeconds,
} from "@/lib/video/recording-limits";

/** The backend default for `matches.duration_seconds`, and the old cap. */
const BACKEND_DEFAULT_MATCH_SECONDS = 600;

/** Every duration the match flow realistically configures, in seconds. */
const REALISTIC_DURATIONS = [60, 120, 180, 300, 360, 600, 900, 1200, 1800, 3600];

describe("computeMaxRecordingSeconds", () => {
  it.each(REALISTIC_DURATIONS)(
    "gives a %ds match a cap strictly greater than its duration plus the worst-case start delay",
    (duration) => {
      const cap = computeMaxRecordingSeconds(duration);
      // The acceptance criterion, stated literally.
      expect(cap).toBeGreaterThan(duration + WORST_CASE_START_DELAY_SECONDS);
      // And the fuller budget: start delay plus the stop delay the
      // recording also has to outlast, plus pause slack on top.
      expect(cap).toBeGreaterThanOrEqual(
        duration + RECORDING_CLOCK_SLACK_SECONDS + RECORDING_PAUSE_SLACK_SECONDS,
      );
    },
  );

  it("no longer returns the backend default duration as the cap", () => {
    // The exact shape of the bug: cap === duration === 600.
    const cap = computeMaxRecordingSeconds(BACKEND_DEFAULT_MATCH_SECONDS);
    expect(cap).not.toBe(BACKEND_DEFAULT_MATCH_SECONDS);
    expect(cap).toBeGreaterThan(BACKEND_DEFAULT_MATCH_SECONDS);
  });

  it("leaves room for a paused match of the default duration", () => {
    // A 600s match paused for the full allowance still finishes recording
    // inside the cap. This is the case that made pauses lose the ending.
    const cap = computeMaxRecordingSeconds(BACKEND_DEFAULT_MATCH_SECONDS);
    const worstLegitimateRecording =
      BACKEND_DEFAULT_MATCH_SECONDS + RECORDING_PAUSE_SLACK_SECONDS + WORST_CASE_STOP_DELAY_SECONDS;
    expect(cap).toBeGreaterThanOrEqual(worstLegitimateRecording);
  });

  it("grows with the match duration rather than being a second constant", () => {
    // A cap that ignored its input is how the old magic number drifted
    // away from the backend default in the first place.
    expect(computeMaxRecordingSeconds(1800)).toBeGreaterThan(
      computeMaxRecordingSeconds(600),
    );
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["zero", 0],
    ["negative", -1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("falls back to the ceiling when the duration is %s", (_name, value) => {
    // Unknown end time: over-recording is recoverable, truncation is not.
    expect(computeMaxRecordingSeconds(value as number | null | undefined)).toBe(
      RECORDING_CAP_MAX_SECONDS,
    );
  });

  it("floors a very short match at the minimum cap", () => {
    expect(computeMaxRecordingSeconds(30)).toBe(RECORDING_CAP_MIN_SECONDS);
    expect(computeMaxRecordingSeconds(30)).toBeGreaterThan(30 + WORST_CASE_START_DELAY_SECONDS);
  });

  it("clamps at the ceiling, and says where the ceiling starts to bite", () => {
    expect(computeMaxRecordingSeconds(MAX_FULLY_COVERED_MATCH_SECONDS)).toBe(
      RECORDING_CAP_MAX_SECONDS,
    );
    expect(computeMaxRecordingSeconds(MAX_FULLY_COVERED_MATCH_SECONDS + 600)).toBe(
      RECORDING_CAP_MAX_SECONDS,
    );
    // The clamp is a real limit, so keep it well clear of anything the
    // match flow configures: if someone ever lowers the ceiling into the
    // realistic range, this fails instead of silently truncating again.
    expect(MAX_FULLY_COVERED_MATCH_SECONDS).toBeGreaterThan(
      Math.max(...REALISTIC_DURATIONS),
    );
  });

  it("stays finite, because the cap is the backstop against a dropped stop", () => {
    // Hardware has been observed ignoring stopRecording(); an uncapped
    // recording would then run until the device filled up.
    expect(Number.isFinite(computeMaxRecordingSeconds(600))).toBe(true);
    expect(computeMaxRecordingSeconds(10 ** 9)).toBe(RECORDING_CAP_MAX_SECONDS);
  });
});

/**
 * VALUES, not expressions.
 *
 * An earlier version of this block asserted things like
 *
 *   WORST_CASE_START_DELAY_SECONDS ===
 *     Math.ceil((CAMERA_READY_TIMEOUT_MS + MAX_ATTEMPTS * RETRY_MS) / 1000)
 *
 * evaluated from the same exported constants: the definition restated, so
 * it could not fail. Changing CAMERA_READY_TIMEOUT_MS from 3000 to 30000
 * left all three assertions green while the real start budget silently
 * grew tenfold past what the cap covers. Pin the NUMBERS instead, so any
 * change to them is a deliberate, visible edit here, and assert the
 * RUNTIME actually uses them over in use-video-recorder.test.ts.
 */
describe("the timing budget the cap is built from", () => {
  it.each([
    ["CAMERA_READY_TIMEOUT_MS", CAMERA_READY_TIMEOUT_MS, 3000],
    ["RECORD_START_RETRY_MS", RECORD_START_RETRY_MS, 500],
    ["RECORD_START_MAX_ATTEMPTS", RECORD_START_MAX_ATTEMPTS, 16],
    ["PENDING_STOP_RETRY_MS", PENDING_STOP_RETRY_MS, 250],
    ["PENDING_STOP_MAX_ATTEMPTS", PENDING_STOP_MAX_ATTEMPTS, 8],
    ["AUTO_END_DELAY_MS", AUTO_END_DELAY_MS, 1000],
  ])("pins %s", (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it.each([
    ["WORST_CASE_START_DELAY_SECONDS", WORST_CASE_START_DELAY_SECONDS, 11],
    ["WORST_CASE_STOP_DELAY_SECONDS", WORST_CASE_STOP_DELAY_SECONDS, 3],
    ["RECORDING_CLOCK_SLACK_SECONDS", RECORDING_CLOCK_SLACK_SECONDS, 14],
    ["RECORDING_PAUSE_SLACK_SECONDS", RECORDING_PAUSE_SLACK_SECONDS, 600],
    ["STOP_WATCHDOG_MS", STOP_WATCHDOG_MS, 10000],
  ])("pins the derived %s", (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it("pins the cap for the backend's default match duration", () => {
    // 600 (the match) + 600 (pause allowance) + 14 (start and stop slack).
    // The whole fix in one number, and that number is not 600.
    expect(computeMaxRecordingSeconds(BACKEND_DEFAULT_MATCH_SECONDS)).toBe(1214);
  });

  it("keeps the stop watchdog clear of the re-issue loop it backstops", () => {
    // It must not fire while issuePendingStop is still legitimately
    // re-issuing, or a stop that was about to land is reported as failed.
    expect(STOP_WATCHDOG_MS).toBeGreaterThan(
      PENDING_STOP_MAX_ATTEMPTS * PENDING_STOP_RETRY_MS,
    );
  });
});
