import "server-only";
import { createInviteAdminClient } from "./admin-client";
import { INVITE_TOKEN_RE } from "./constants";
import { e2eFixturePreview } from "./e2e-fixtures";
import type { InvitePreview } from "./types";

const UNAVAILABLE: InvitePreview = { state: "unavailable" };

/**
 * Server-side invite preview (contract 4.7). Never throws: any failure reads
 * as the uniform "unavailable" state so the page never leaks why.
 */
export async function getInvitePreview(token: string): Promise<InvitePreview> {
  if (!INVITE_TOKEN_RE.test(token)) return UNAVAILABLE;

  const fixture = e2eFixturePreview(token);
  if (fixture) return fixture;

  const admin = createInviteAdminClient();
  if (!admin) return UNAVAILABLE;

  const { data, error } = await admin.rpc("get_invite_preview_server", { p_token: token });
  if (error || !data || typeof data !== "object") return UNAVAILABLE;
  const preview = data as InvitePreview;
  return preview.state === "open" ? preview : UNAVAILABLE;
}
