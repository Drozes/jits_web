import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { lit, psql } from "../../lib/psql";
import { prepare } from "../flows";

const scenario: Scenario = {
  id: "E2",
  tier: "extended",
  title: "Blue's outgoing challenge expires: the waiting plate must clear (H9)",
  expectedFailure: "H9: the challenger side ignores status 'expired'",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const since = new Date(Date.now() - 2_000).toISOString();
    await ctx.step("Blue challenges Demo Red", () => ctx.ui.challenge(ctx.cfg.names.red));
    await ctx.step("Blue sees the waiting plate", () => ctx.ui.waitWaitingPlate(ctx.cfg.names.red));
    const row = await ctx.step("Red receives the challenge", () => red.waitForIncoming(20_000, ctx.ids.blue));
    await ctx.step("expire it (expires_at in the past + sweep)", async () => {
      await psql(`update public.challenges set expires_at = now() - interval '1 minute' where id = ${lit(row.id)}`);
      await psql("select public.expire_pending_challenges()");
    });
    ctx.eq("db:challenge-expired", "expired", (await db.challenge(row.id))?.status);
    await ctx.expect("ui:waiting-plate-cleared", true, async () => {
      await ctx.idb.waitGone({ label: `Waiting for ${ctx.cfg.names.red}`, type: "StaticText" }, 15_000);
      return true;
    });
    ctx.trace.note("harness", "since", since);
  },
};
export default scenario;
