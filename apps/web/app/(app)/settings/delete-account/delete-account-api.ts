import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Calls the jr_be `delete-account` edge function (contract 016 section 8).
 * Mirrors apps/mobile/lib/account/delete-account.ts; the web slice keeps its
 * own copy because apps may not import each other and packages/shared is
 * owned by the mobile slice in this release. supabase-js never rejects.
 */
export const DELETE_CONFIRM_WORD = "DELETE";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; code: "confirm_required" | "not_authenticated" | "match_in_progress" | "failed" };

export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim() === DELETE_CONFIRM_WORD;
}

export async function deleteAccount(
  client: Pick<SupabaseClient, "functions">,
): Promise<DeleteAccountResult> {
  const { data, error } = await client.functions.invoke("delete-account", {
    body: { confirm: DELETE_CONFIRM_WORD },
  });
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    // Any 401 is a dead session, whatever the body says: the gateway's own
    // JWT check (verify_jwt) answers with its own body ({code: 401, msg}).
    if ((ctx as { status?: unknown } | null)?.status === 401) {
      return { ok: false, code: "not_authenticated" };
    }
    if (ctx instanceof Response) {
      try {
        const body = (await ctx.clone().json()) as { code?: unknown };
        if (
          body.code === "confirm_required" ||
          body.code === "not_authenticated" ||
          body.code === "match_in_progress"
        ) {
          return { ok: false, code: body.code };
        }
      } catch {
        // not JSON: fall through
      }
    }
    return { ok: false, code: "failed" };
  }
  return (data as { ok?: unknown } | null)?.ok === true ? { ok: true } : { ok: false, code: "failed" };
}
