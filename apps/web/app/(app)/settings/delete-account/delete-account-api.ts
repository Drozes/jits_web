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
