/**
 * Timekeeper-mode scenarios T1 to T18 (TEST-PLAN 4.2), tier `timekeeper`:
 * never part of the flag-OFF guard (core and extended). T13 (the
 * timekeeper's own resume) is the device script's (TEST-PLAN 5.2 step 8):
 * the simulator is never the timekeeper. T0 and T0B, M7 additions, run with
 * bots only, on any build: T0 the whole bot protocol, T0B the test-only
 * windows and the harness's sweep.
 */
import type { Scenario } from "../context";
import t0 from "./t00-bot-protocol";
import t0b from "./t00b-bot-sweep";
import t1 from "./t01-happy-path-challenger";
import t1b from "./t01b-happy-path-opponent";
import t2 from "./t02-decline-then-repick";
import t3 from "./t03-request-lapses";
import t4 from "./t04-nobody-accepts";
import t5 from "./t05-prestart-dropout";
import t6 from "./t06-midmatch-leave";
import t7 from "./t07-timekeeper-offline";
import t8 from "./t08-result-stall";
import t9 from "./t09-result-edit";
import t10 from "./t10-weight-flag";
import t11 from "./t11-capability-mixed";
import t12 from "./t12-subflag-off";
import t14 from "./t14-capture-policy";
import t15 from "./t15-faceoff-timeout";
import t16 from "./t16-pause-timeout";
import t17 from "./t17-invite-booking";
import t18 from "./t18-edit-window-closed";

export const TIMEKEEPER_SCENARIOS: Scenario[] = [t0, t0b, t1, t1b, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t14, t15, t16, t17, t18];

export const TIMEKEEPER_NOT_IMPLEMENTED: { id: string; reason: string }[] = [
  {
    id: "T13",
    reason:
      "Moved to the three-phone device script (TEST-PLAN 5.2 step 8) and component tests: the timekeeper's own resume " +
      "(Home card, TIMEKEEPING chip, A20) happens on the timekeeper's phone, and the simulator is never the timekeeper (PM18).",
  },
];
