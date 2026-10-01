import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * In-app account deletion (App Store guideline 5.1.1(v), jits-b3js.10).
 *
 * Calls the jr_be `delete-account` edge function with the signed-in user's
 * JWT (supabase-js attaches it) and the typed confirmation. The function
 * anonymises the athlete (opponents keep their match results against an
 * anonymous athlete), removes the profile photos, then deletes the auth user.
 * It refuses with match_in_progress while the athlete is in a live match.
 * not_authenticated during a delete is terminal: either the session is gone
 * or a previous attempt already deleted the account (its 200 was lost).
 * Never throws: supabase-js reports failures in `error`.
 */

export const DELETE_CONFIRM_WORD = "DELETE";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; code: "confirm_required" | "not_authenticated" | "match_in_progress" | "failed" };

/** True when the typed text is the confirmation word (case and spaces exact, trimmed ends). */
export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim() === DELETE_CONFIRM_WORD;
}

async function errorCode(error: unknown): Promise<string | null> {
  // FunctionsHttpError carries the Response in `context`.
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = (await (ctx as Response).clone().json()) as { code?: unknown };
      return typeof body?.code === "string" ? body.code : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function deleteAccount(
  client: Pick<SupabaseClient, "functions">,
): Promise<DeleteAccountResult> {
  const { data, error } = await client.functions.invoke("delete-account", {
    body: { confirm: DELETE_CONFIRM_WORD },
  });
  if (error) {
    const code = await errorCode(error);
    if (code === "confirm_required" || code === "not_authenticated" || code === "match_in_progress") {
      return { ok: false, code };
    }
    return { ok: false, code: "failed" };
  }
  if ((data as { ok?: unknown } | null)?.ok === true) return { ok: true };
  return { ok: false, code: "failed" };
}
