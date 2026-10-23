/**
 * The Arena screen's two timekeeper-mode reads (slice M6), kept out of the
 * screen so it does not grow (ARCHITECTURE M-R6).
 *
 * - `onDuty`: this athlete is the seated timekeeper of a `pending` or
 *   `in_progress` timekeeper-mode match (A20, spec 9.1). Going live is then
 *   locked with the in-match treatment; going offline stays open. The
 *   server's busy rule (R2) is the backstop. A completed match in its edit
 *   window does not lock anything (PM20).
 * - `waitingHelper`: the line under the waiting strip, TK-AR2, only while the
 *   timekeeper flag is known ON (spec 4.2 Arena); null keeps the shipped
 *   strip.
 */
import { isTimekeepingActive, useMyTimekeepingMatch } from "@/lib/match-flow/timekeeping-match-store";
import { useTimekeeperEnabled } from "@/lib/match-flow/use-timekeeper-enabled";
import { TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";

export function useArenaTimekeeper(athleteId: string | null | undefined): {
  onDuty: boolean;
  waitingHelper: string | null;
} {
  const onDuty = isTimekeepingActive(useMyTimekeepingMatch(athleteId));
  const flagOn = useTimekeeperEnabled().enabled;
  return { onDuty, waitingHelper: flagOn ? TIMEKEEPER_COPY["TK-AR2"] : null };
}
