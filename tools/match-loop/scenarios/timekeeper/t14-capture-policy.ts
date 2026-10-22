import type { Scenario, ScenarioCtx } from "../context";
import { blueChallengesRed, blueEnds, blueOnWeight, finishWithDraw, prepare, readyToLive, T } from "../flows";
import { PRACTICE_PARTNER, PRACTICE_UI, portraitIn } from "../../sim/capture-screens";
import { pollUntil } from "../../lib/util";

/**
 * Rotate the simulator to each side and check the app stayed portrait,
 * putting the device upright again after each: left (check) then right back,
 * right (check) then left back. `Simctl.rotate` waits until the DEVICE has
 * turned (the Simulator window's shape), so a check can never pass on a
 * rotation that did not happen; the app's own frame then says whether it
 * followed (`portraitIn`). Measured on this simulator, 2026-10-21: Safari,
 * which follows the device, reports its Application frame 874x402 when
 * turned, so `portraitIn` does see an app that rotates; ELO RATED stays at
 * 402x874.
 */
async function rotateAndCheck(ctx: ScenarioCtx, where: string): Promise<void> {
  for (const [side, back] of [["left", "right"], ["right", "left"]] as const) {
    const turned = await ctx.simctl.rotate(side, "landscape");
    const els = await ctx.idb.describe();
    const app = els.find((e) => e.type === "Application")?.frame ?? null;
    ctx.eq(`ui:portrait-${where}-rotated-${side}`, true, portraitIn(els), `device window ${turned.width}x${turned.height}, app frame ${app ? `${app.width}x${app.height}` : "missing"}`);
    await ctx.simctl.rotate(back, "portrait");
  }
}

/**
 * Practice's local Go live (setup, not under test: practice is client-side
 * only and its lobby is not the Arena). Practice takes Blue offline, so the
 * Arena under the pushed screen also reads Go live while the push settles
 * (seen 2026-10-21: the first tap landed nowhere and practice stayed
 * offline). So the tap goes to the Go live under practice's tip, once it
 * has stopped moving, and is made once more if the partner's Challenge row
 * has not shown, with a trace note. The challenge step after it is the
 * proof.
 */
async function practiceGoLive(ctx: ScenarioCtx): Promise<void> {
  const challenge = { label: `Challenge ${PRACTICE_PARTNER}` };
  for (let tap = 1; tap <= 2; tap++) {
    await ctx.idb.settled(PRACTICE_UI.tip, 3_000);
    const btn = await pollUntil(
      "practice's Go live under its tip",
      async () => {
        const els = await ctx.idb.describe();
        const tip = await ctx.idb.find(PRACTICE_UI.tip, els);
        const all = await ctx.idb.findAll(PRACTICE_UI.goLive, els);
        return tip ? all.find((e) => ctx.idb.onScreen(e) && e.frame.y > tip.frame.y) : undefined;
      },
      { timeoutMs: T.step, intervalMs: 300 },
    );
    await ctx.idb.tap(btn);
    const shown = await ctx.idb.waitFor(challenge, 6_000).then(
      () => true,
      () => false,
    );
    if (shown) return;
    ctx.trace.note("harness", "practice_go_live_retap", { tap });
  }
}

/**
 * T14 (TEST-PLAN 4.2, A21 to A23): the capture policy on a flag-OFF match
 * and in practice. Owned by slice M9, run by M7: the READY and LIVE steps
 * stay portrait when the simulator rotates (before M9 the ready check
 * follows the phone), and so do practice's ready and live.
 *
 * What the simulator cannot show is not asserted here: the 9:16 ready
 * preview and the TK-REC2 hint render only beside an actual preview, with
 * camera permission granted and recording on (match-recorder-surface.tsx),
 * and harness runs revoke the camera and record from no phone (preflight
 * `camera-mic-revoked`; the simulator has no camera device either, see E13).
 * Those are covered by M9's component tests (`match-recorder-surface.test.tsx`,
 * `capture-copy.test.ts`, with the label contract pinning TK-REC2 and the
 * retired sideways hint) and by device script TEST-PLAN 5.2 step 3; the
 * quality and row values by `use-capture-quality.test.ts`,
 * `match-video-upload.test.ts` and 5.2 steps 3 and 9.
 */
const scenario: Scenario = {
  id: "T14",
  tier: "timekeeper",
  title: "Capture policy (A21 to A23): a flag-OFF match and practice stay portrait on ready and live when the simulator rotates",
  needs: ["M9"],
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const h = await blueChallengesRed(ctx, red);
    const side = await ctx.matchSide(red, h.matchId);
    await blueOnWeight(ctx);
    // The ready check: after Blue's weigh-in and check, before Blue taps Ready.
    await readyToLive(ctx, side, { onReadyStep: () => rotateAndCheck(ctx, "ready") });
    await rotateAndCheck(ctx, "live");
    await blueEnds(ctx, side);
    await finishWithDraw(ctx, side);
    // Practice (A23): portrait on its ready and live steps too. It opens
    // offline in its own local lobby: go live there, challenge the practice
    // partner (it accepts after 1.5 s), weigh in.
    await ctx.step("open practice", async () => {
      await ctx.simctl.openUrl("elorated://practice");
      await ctx.idb.waitFor(PRACTICE_UI.header, T.step);
    });
    await ctx.step("practice: go live in its lobby", () => practiceGoLive(ctx));
    await ctx.step(`practice: challenge ${PRACTICE_PARTNER}`, () => ctx.ui.challenge(PRACTICE_PARTNER, T.step));
    await ctx.step("practice weigh-in", () => ctx.idb.tapQ(PRACTICE_UI.weighIn, T.step));
    await ctx.step("practice ready step", () => ctx.idb.waitFor(PRACTICE_UI.ready, T.step));
    await rotateAndCheck(ctx, "practice-ready");
    await ctx.step("practice ready", () => ctx.idb.tapQ(PRACTICE_UI.ready, T.step));
    // Live only: the HUD's End (after the 3-2-1), never the non-live chrome
    // (the ghost Exit practice shares its testID with the HUD's EXIT).
    await ctx.step("practice live", () => ctx.idb.waitFor(PRACTICE_UI.liveEnd, T.handshake));
    const liveEls = await ctx.idb.describe();
    ctx.eq("ui:practice-live-chrome-gone", false, !!(await ctx.idb.find(PRACTICE_UI.header, liveEls)), "the header shows on every phase but live");
    // Practice runs 30 s; paused, it stays on live while the checks rotate.
    await ctx.step("pause practice", () => ctx.idb.tapQ(PRACTICE_UI.pause, T.step));
    await rotateAndCheck(ctx, "practice-live");
    const els = await ctx.idb.describe();
    ctx.eq(
      "ui:practice-still-live-after-rotation",
      { liveEnd: true, header: false },
      { liveEnd: !!(await ctx.idb.find(PRACTICE_UI.liveEnd, els)), header: !!(await ctx.idb.find(PRACTICE_UI.header, els)) },
    );
    // Leave practice through its live EXIT so the next scenario starts from a tab root.
    await ctx.step("leave practice", () => ctx.idb.tapQ(PRACTICE_UI.exit, T.step));
  },
};
export default scenario;
