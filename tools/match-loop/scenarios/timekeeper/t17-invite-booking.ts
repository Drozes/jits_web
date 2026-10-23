import type { Scenario, ScenarioCtx } from "../context";
import { createInvite } from "@jits/shared/api/invites";
import { startInviteBooking } from "@jits/shared/api/location";
import { inviteCapProblem, readFlags, readInviteCounts, withAthleteColumns, withFlags, withInviteCleanup } from "../../fixtures/timekeeper";
import { lit, queryJson } from "../../lib/psql";
import { tkDb } from "../../oracle/tk-db";
import { EnvError, pollUntil } from "../../lib/util";
import { blueLeavesFromCrew, tkCreationFlags, tkScenario, TK, type TkCast } from "./tk-flows";

/**
 * T17 (TEST-PLAN 4.2, A16, review B1), Blue the opponent: an invite booking
 * runs the timekeeper flow. Red's bot (with the capability header) creates
 * an invite (`inviter_tk_capable` stamped from its header), Blue opens the
 * link and claims it in the app (its header stamps the claimer side), and
 * the booking is started by Red with `start_invite_booking` while
 * `timekeeper_role` is on (the match INSERT snapshots the mode). Blue's
 * app follows the challenge row to `started` and lands on `crew`.
 *
 * Prerequisites on the local stack, checked and never changed:
 * `invites_enabled` ON and `match_location_required` OFF (the claim books;
 * the booking starts later). With `match_location_required` ON the claim
 * would start the match itself and needs a simulated location.
 *
 * A claim needs the claimer's date of birth (`dob_required`); Demo Blue has
 * none, so the scenario sets one for its duration and puts the previous
 * value back afterwards (`withAthleteColumns`: recorded first, so a killed
 * run is repaired by the next run's start; no flag-OFF scenario reads it).
 *
 * Hermetic like every other scoped fixture, so it passes on every run and
 * under `--repeat`: `create_invite` allows Red 3 invite matches a week, 5
 * open invites and 20 invites a day, and nothing else ever takes T17's out
 * of those counts. So every challenge invite Red creates during the scenario
 * is deleted afterwards (`withInviteCleanup`, recorded before the first one
 * exists, which also takes the booked match out of the weekly count), and
 * a stack where Red already reached a limit is an `env_error` naming it,
 * before anything runs. The pending invite the app keeps on the device from
 * the moment the link opens until the claim books (`elorated.invite.pending.v1`,
 * which would bring every later cold launch back to the claim screen) is
 * dropped with the claim screen's own Not now when the scenario ends with
 * the claim screen still up (`dropPendingInvite`; `normaliseApp` does the
 * same for a run killed there).
 */
const scenario: Scenario = {
  id: "T17",
  tier: "timekeeper",
  title: "Invite booking in timekeeper mode: Blue claims Red's invite, the booked match runs the timekeeper flow (crew)",
  needs: ["M8"],
  async run(ctx) {
    const flags = await readFlags(["invites_enabled", "match_location_required"]);
    if (flags.invites_enabled !== true || flags.match_location_required !== false) {
      throw new EnvError(
        `T17 needs invites_enabled ON and match_location_required OFF on the local stack (have ${JSON.stringify(flags)}); the harness never changes them`,
      );
    }
    const capped = inviteCapProblem(await readInviteCounts(ctx.ids.red), "Demo Red (T17's inviter)");
    if (capped) throw new EnvError(`T17 cannot run: ${capped}`);
    const note = (what: string, payload: unknown) => ctx.trace.note("harness", what, payload);
    await withAthleteColumns(
      [ctx.ids.blue],
      ["date_of_birth"],
      () => tkScenario(ctx, {}, (cast) => claimAndBook(ctx, cast)),
      { date_of_birth: "1995-01-01" },
      undefined,
      note,
    );
  },
};
export default scenario;

async function claimAndBook(ctx: ScenarioCtx, cast: TkCast): Promise<void> {
  const note = (what: string, payload: unknown) => ctx.trace.note("harness", what, payload);
  await withInviteCleanup(cast.red.me.id, () => inviteBooking(ctx, cast), note);
}

async function inviteBooking(ctx: ScenarioCtx, cast: TkCast): Promise<void> {
  const { red } = cast;
  const inv = await ctx.step("Red creates an invite", () => createInvite(red.client, "arena"));
  if (!inv.ok) throw new Error(`createInvite failed: ${JSON.stringify(inv.error)}`);
  const invite = inv.data;
  const stamped = (await queryJson<{ inviter_tk_capable: boolean }>(`select inviter_tk_capable from public.invites where id = ${lit(invite.invite_id)}`))[0];
  ctx.eq("db:invite-stamped-capable", true, stamped?.inviter_tk_capable ?? null);
  try {
    await ctx.step("Blue opens the invite link", () => ctx.simctl.openUrl(invite.scheme_url));
    await ctx.step("Blue confirms the account and claims", async () => {
      await ctx.idb.tapQ({ label: "Continue", type: "Button" }, TK.step);
      await ctx.idb.waitFor({ label: /^Booked$/i }, TK.handshake);
    });
  } finally {
    // Booked clears the device's pending invite; anything short of it may not.
    const dropped = await ctx.ui.dropPendingInvite().catch((e: unknown) => {
      ctx.trace.note("harness", "pending_invite_drop_failed", e instanceof Error ? e.message : String(e));
      return false;
    });
    if (dropped) ctx.trace.note("harness", "pending_invite_dropped", { inviteId: invite.invite_id });
  }
  const challengeId = await pollUntil(
    "the booked challenge",
    async () => (await queryJson<{ challenge_id: string | null }>(`select challenge_id from public.invites where id = ${lit(invite.invite_id)}`))[0]?.challenge_id ?? undefined,
    { timeoutMs: TK.db },
  );
  ctx.eq("db:booking-both-capable", { challenger_tk_capable: true, opponent_tk_capable: true }, await tkDb.challengeCaps(challengeId));
  await ctx.step("Blue goes to the Arena (the booking is followed live there)", () => ctx.idb.tapQ({ label: "Go to the Arena", type: "Button" }, TK.step));
  const started = await ctx.step("Red starts the booking (timekeeper_role on for the match's creation only)", () =>
    withFlags(tkCreationFlags(true), () => startInviteBooking(red.client, challengeId), (what, payload) => ctx.trace.note("harness", what, payload)),
  );
  if (!started.ok || !started.data.ok) throw new Error(`start_invite_booking failed: ${JSON.stringify(started.ok ? started.data : started.error)}`);
  const matchId = started.data.match_id;
  const row = await tkDb.match(matchId);
  ctx.eq(
    "db:booked-match-is-timekeeper-mode",
    { requires_timekeeper: true, status: "pending", timekeeper_id: null },
    { requires_timekeeper: row?.requires_timekeeper, status: row?.status, timekeeper_id: row?.timekeeper_id },
  );
  await ctx.step("Blue lands on crew in the booked match", () => ctx.ui.waitStep("crew", TK.handshake));
  await blueLeavesFromCrew(ctx);
  const after = await tkDb.waitMatch(matchId, "cancelled", (x) => x.status === "cancelled", TK.db).catch(() => tkDb.match(matchId));
  ctx.eq("db:left-while-picking", { status: "cancelled", cancel_reason: "athlete_left" }, { status: after?.status, cancel_reason: after?.cancel_reason });
}
