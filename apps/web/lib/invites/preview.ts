import "server-only";
import { cache } from "react";
import { createInviteAdminClient } from "./admin-client";
import { INVITE_TOKEN_RE } from "./constants";
import { e2eFixturePreview } from "./e2e-fixtures";
import type { InvitePreview } from "./types";

const UNAVAILABLE: InvitePreview = { state: "unavailable" };

/**
 * Server-side invite preview (contract 4.7). Never throws: any failure reads
 * as the uniform "unavailable" state so the page never leaks why. Operator
 * failures (missing service key, RPC error) are logged server-side, without
 * the token, so a broken deploy does not hide behind the uniform state.
 */
export async function getInvitePreview(token: string): Promise<InvitePreview> {
  if (!INVITE_TOKEN_RE.test(token)) return UNAVAILABLE;

  const fixture = e2eFixturePreview(token);
  if (fixture) return fixture;

  const admin = createInviteAdminClient();
  if (!admin) {
    console.error("[invites] get_invite_preview_server skipped: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is not set");
    return UNAVAILABLE;
  }

  const { data, error } = await admin.rpc("get_invite_preview_server", { p_token: token });
  if (error) {
    console.error("[invites] get_invite_preview_server failed", { code: error.code, message: error.message });
    return UNAVAILABLE;
  }
  if (!data || typeof data !== "object") return UNAVAILABLE;
  const preview = data as InvitePreview;
  return preview.state === "open" ? preview : UNAVAILABLE;
}

/**
 * Per-request memoised preview for Server Components: generateMetadata and
 * the page body share one RPC instead of two.
 */
export const getInvitePreviewCached = cache(getInvitePreview);
