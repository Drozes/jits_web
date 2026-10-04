/**
 * Location attempt telemetry (jr_be 016 addendum, live location fixes 4.5
 * and 4.6): one `go_live_attempt` per athlete-initiated Go Live flow (flag
 * on), and one `match_start` per athlete per match at the face-off. The
 * instant go-live drift check adds `drift_check` (drifted) and
 * `drift_prompt` (the athlete's answer).
 *
 * Fire and forget. Nothing here is awaited on a UI path, and a failed,
 * slow or throwing log never blocks, delays or changes a flow and never
 * shows anything. Coordinates go to the server once (it rounds them to 3
 * decimals); this module stores nothing on the device.
 */
import { logLocationEvent, type LocationEventOutcome } from "@jits/shared/api/location";
import type { LocationReading } from "@jits/shared/api/invites";
import type { GoLiveTagSource } from "@jits/shared/constants/go-live";
import { supabase } from "@/lib/supabase/client";
import { readAppVersionInfo } from "@/lib/updates/app-version";

/** e.g. `0.5.0 (25) 9287a1e5` (the OTA id when one runs), at most 32 characters. */
export function locationAppVersion(): string | null {
  try {
    const info = readAppVersionInfo();
    if (!info.appVersion) return null;
    const build = info.buildNumber ? ` (${info.buildNumber})` : "";
    const ota = info.updateId && !info.isEmbeddedLaunch ? ` ${info.updateId.slice(0, 8)}` : "";
    return `${info.appVersion}${build}${ota}`.slice(0, 32);
  } catch {
    return null;
  }
}

function fire(input: Parameters<typeof logLocationEvent>[1]): void {
  try {
    void Promise.resolve(
      logLocationEvent(supabase, { ...input, appVersion: locationAppVersion(), occurredAt: new Date() }),
    ).then(
      (r) => {
        if (r && !r.ok) console.warn("[location] event log failed:", r.error.hint);
      },
      () => undefined,
    );
  } catch {
    // Telemetry only: never let it reach the flow.
  }
}

/**
 * One athlete-initiated Go Live flow finished (flag on). `source`: the rung
 * of the location ladder that produced the tag, on `ok`.
 */
export function logGoLiveAttempt(
  outcome: LocationEventOutcome,
  reading?: LocationReading | null,
  source?: GoLiveTagSource | null,
): void {
  fire({
    event: "go_live_attempt",
    outcome,
    reading: reading ?? null,
    ...(outcome === "ok" && source ? { source } : {}),
  });
}

/** A drift check found the athlete drifted (the prompt is shown). */
export function logDriftCheck(reading: LocationReading): void {
  fire({ event: "drift_check", outcome: "drifted", reading });
}

/** The athlete's answer to the drift prompt. */
export function logDriftPrompt(outcome: "retagged" | "went_offline" | "dismissed"): void {
  fire({ event: "drift_prompt", outcome });
}

/** The face-off re-poll for one match (record only, any flag value). */
export function logMatchStartLocation(
  matchId: string,
  outcome: LocationEventOutcome,
  reading?: LocationReading | null,
): void {
  fire({ event: "match_start", outcome, matchId, reading: reading ?? null });
}
