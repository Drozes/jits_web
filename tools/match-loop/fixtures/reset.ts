/**
 * Deterministic starting state before every scenario, touching ONLY the
 * three test athletes' rows. Never a `db reset`; match history is kept.
 *
 *  - stranded pending / in_progress matches involving them -> cancelled
 *  - pending / accepted challenges involving them -> cancelled
 *  - current_elo = 1000, current_weight = 170 (or per-scenario overrides)
 *  - Red and Green (bot-only accounts) have looking_for_ranked cleared, in
 *    case a crashed run left them advertised. Blue's live state is owned by
 *    the running app and is normalised through the UI only.
 */
import type { AthleteIds } from "../config";
import { lit, psql } from "../lib/psql";

export interface ResetOptions {
  weights?: Partial<Record<keyof AthleteIds, number>>;
  elo?: Partial<Record<keyof AthleteIds, number>>;
}

export async function resetFixtures(ids: AthleteIds, opts: ResetOptions = {}): Promise<string> {
  const all = [ids.blue, ids.red, ids.green].map(lit).join(", ");
  const sets = (["blue", "red", "green"] as const)
    .map(
      (k) =>
        `update public.athletes set current_elo = ${opts.elo?.[k] ?? 1000}, current_weight = ${
          opts.weights?.[k] ?? 170
        } where id = ${lit(ids[k])};`,
    )
    .join("\n");
  const sql = `
    begin;
    with stranded as (
      update public.matches m set status = 'cancelled'
      where m.status in ('pending', 'in_progress')
        and exists (select 1 from public.match_participants p where p.match_id = m.id and p.athlete_id in (${all}))
      returning 1
    ), ch as (
      update public.challenges set status = 'cancelled', updated_at = now()
      where status in ('pending', 'accepted') and (challenger_id in (${all}) or opponent_id in (${all}))
      returning 1
    )
    select (select count(*) from stranded) || ' matches, ' || (select count(*) from ch) || ' challenges cancelled';
    ${sets}
    update public.athletes set looking_for_ranked = false, looking_for_casual = false
      where id in (${lit(ids.red)}, ${lit(ids.green)});
    commit;`;
  const out = await psql(sql);
  return out.split("\n").find((l) => l.includes("cancelled")) ?? out;
}
