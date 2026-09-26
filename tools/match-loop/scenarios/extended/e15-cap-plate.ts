import type { Scenario } from "../context";
import { lit, psql, queryJson } from "../../lib/psql";
import { prepare } from "../flows";

const scenario: Scenario = {
  id: "E15",
  tier: "extended",
  title: "3-cap: with 3 pending outgoing challenges, a 4th is refused and the cap plate shows",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    await ctx.step("fixture: 3 pending challenges Blue -> Green", () =>
      psql(
        `insert into public.challenges (challenger_id, opponent_id, match_type, challenger_weight)
         select ${lit(ctx.ids.blue)}, ${lit(ctx.ids.green)}, 'ranked', 170 from generate_series(1, 3)`,
      ),
    );
    const since = new Date().toISOString();
    await ctx.step("Blue challenges Demo Red", () => ctx.ui.challenge(ctx.cfg.names.red));
    await ctx.expect("ui:cap-plate", true, async () => {
      await ctx.idb.waitFor({ label: /you have 3 challenges out/i }, 10_000);
      return true;
    });
    const rows = await queryJson(`select id from public.challenges where challenger_id = ${lit(ctx.ids.blue)} and opponent_id = ${lit(ctx.ids.red)} and created_at >= ${lit(since)}::timestamptz`);
    ctx.eq("db:no-4th-challenge", 0, rows.length);
    const gotIt = await ctx.idb.find({ label: "Got it", type: "Button" });
    if (gotIt) await ctx.idb.tap(gotIt);
  },
};
export default scenario;
