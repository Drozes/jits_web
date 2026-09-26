/**
 * Scenario registry. Core runs every iteration; extended when core is green
 * or every third iteration (LOOP.md).
 */
import type { Scenario } from "./context";
import c1 from "./core/c1-blue-challenges-submission-win";
import c2 from "./core/c2-red-challenges-home-red-wins";
import c3 from "./core/c3-draw";
import c4 from "./core/c4-blue-declines";
import c5 from "./core/c5-blue-aborts-ready";
import c6 from "./core/c6-blue-disputes";
import c6b from "./core/c6b-red-disputes";
import e1 from "./extended/e01-red-withdraws";
import e2 from "./extended/e02-expiry";
import e3 from "./extended/e03-red-aborts-ready";
import e3b from "./extended/e03b-cancel-before-opponent-ready-mounts";
import e4 from "./extended/e04-red-pause-resume";
import e5 from "./extended/e05-red-ends";
import e6 from "./extended/e06-background-mid-live";
import e7 from "./extended/e07-cold-relaunch";
import e8 from "./extended/e08-realtime-outage";
import e9 from "./extended/e09-fast-opponent";
import e10 from "./extended/e10-simultaneous-record";
import e11 from "./extended/e11-timer-auto-end";
import e12 from "./extended/e12-weight-gap";
import e14 from "./extended/e14-recovery-prompt";
import e15 from "./extended/e15-cap-plate";
import e16 from "./extended/e16-challenge-mid-match";
import e17 from "./extended/e17-match-video-history";

export const SCENARIOS: Scenario[] = [
  c1, c2, c3, c4, c5, c6, c6b,
  e1, e2, e3, e3b, e4, e5, e6, e7, e8, e9, e10, e11, e12, e14, e15, e16, e17,
];

/** Extended scenarios that are specified but not implemented, with why. */
export const NOT_IMPLEMENTED: { id: string; reason: string }[] = [
  {
    id: "E13",
    reason:
      "TODO: camera granted on the simulator. The iOS simulator has no camera device, so expo-camera never produces a " +
      "recording and the upload/playback path this scenario exists for cannot run; granting the permission only " +
      "exercises the viewfinder's error state. Needs a physical device (or a mocked recorder build) to be meaningful.",
  },
];
