import type { MyActiveMatch } from "@jits/shared/api/queries";
import type { MyTimekeepingMatch } from "@jits/shared/api/timekeeper";
import { ResumeMatchCard } from "@/components/dashboard/resume-match-card";
import { TimekeepingResumeCard } from "@/components/dashboard/timekeeping-resume-card";
import { isTimekeepingActive } from "@/lib/match-flow/timekeeping-match-store";

/**
 * Home's way back into a match, at the top of the feed.
 *
 * A match the app lost as an athlete (killed mid-match, jits-r9a) comes
 * first and takes Home's one red CTA (spec matches-tab PM7). A match this
 * athlete TIMEKEEPS (timekeeper mode A20, spec 9.1) shows below it: both can
 * show only in the timekeeper's 30-minute edit window (PM20), and its CTA is
 * red only while on duty with no athlete card above it.
 */
export function HomeResumeCards({
  activeMatch,
  timekeepingMatch,
}: {
  activeMatch: MyActiveMatch | null;
  timekeepingMatch: MyTimekeepingMatch | null;
}) {
  return (
    <>
      {activeMatch ? <ResumeMatchCard match={activeMatch} /> : null}
      {timekeepingMatch ? (
        <TimekeepingResumeCard
          match={timekeepingMatch}
          primary={isTimekeepingActive(timekeepingMatch) && !activeMatch}
        />
      ) : null}
    </>
  );
}
