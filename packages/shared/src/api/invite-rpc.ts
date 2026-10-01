/**
 * The Result-style RPC caller shared by the invite and location wrappers
 * (`invites.ts`, `location.ts`). Never throws: a RAISE comes back as
 * `{ ok:false, error }` with the HINT kept on `error.hint`, and a returned
 * `{ok:false, code}` JSON is a successful call whose data says so.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { StartBlockedReason } from "../utils/invite-copy";

export type Client = SupabaseClient<Database>;
type RpcName = keyof Database["public"]["Functions"];

/** A failed call: the RAISE hint (`invites_disabled`, `not_found`, ...) or `unknown`. */
export interface InviteRpcError {
  hint: string;
  message: string;
}

export type InviteResult<T> = { ok: true; data: T } | { ok: false; error: InviteRpcError };

type RawError = { message?: string; hint?: string | null; code?: string } | null;

/**
 * Call an RPC and parse its jsonb result. `fn` is a generated function name,
 * or (for an RPC newer than the generated types) any string cast by the caller.
 */
export async function rpc<T>(
  supabase: Client,
  fn: RpcName,
  args: Record<string, unknown>,
  parse: (data: unknown) => T | null,
): Promise<InviteResult<T>> {
  try {
    const call = supabase.rpc as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: RawError }>;
    const { data, error } = await call.call(supabase, fn, args);
    if (error) {
      return {
        ok: false,
        error: { hint: error.hint || (error.code === "PGRST202" ? "rpc_missing" : "unknown"), message: error.message ?? "" },
      };
    }
    const parsed = parse(data);
    if (parsed === null) return { ok: false, error: { hint: "unknown", message: `Unexpected ${fn} response.` } };
    return { ok: true, data: parsed };
  } catch (err) {
    return { ok: false, error: { hint: "unknown", message: err instanceof Error ? err.message : String(err) } };
  }
}

export const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
export const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A `report_match_presence` answer. `recorded` is the athlete-level `go_live` reply. */
export type PresenceResult =
  | {
      ok: true;
      verdict: "passed" | "failed" | "waiting" | "already_started" | "recorded";
      reason: string | null;
      distance_m: number | null;
      started: boolean;
      match_id: string | null;
      start_blocked_reason: StartBlockedReason | null;
    }
  | { ok: false; code: "accuracy_too_low" | "booking_closed" | string };

export function parsePresence(data: unknown): PresenceResult | null {
  const o = obj(data);
  if (!o) return null;
  if (o.ok === false) return { ok: false, code: str(o.code) ?? "unknown" };
  if (o.ok !== true) return null;
  return {
    ok: true,
    verdict: (str(o.verdict) ?? "waiting") as "passed" | "failed" | "waiting" | "already_started" | "recorded",
    reason: str(o.reason),
    distance_m: num(o.distance_m),
    started: o.started === true,
    match_id: str(o.match_id),
    start_blocked_reason: (str(o.start_blocked_reason) as StartBlockedReason | null) ?? null,
  };
}
