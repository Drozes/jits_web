/**
 * Invite sharing (contract 6): the share sheet gets a message only, with the
 * link inside it. The resolved `{action, activityType}` is logged as the
 * `shared` step; on iOS `activityType` names the app picked (WhatsApp,
 * Messages, Messenger, Instagram), so it is the per-channel signal.
 */
import { Share } from "react-native";
import { logInviteEvent } from "@jits/shared/api/invites";
import { buildInviteShareMessage, type InviteKind } from "@jits/shared/utils";
import { supabase } from "@/lib/supabase/client";

export interface ShareableInvite {
  inviteId: string;
  kind: InviteKind;
  url: string;
  codeDisplay?: string | null;
}

/** Opens the share sheet and logs it. Resolves false when nothing was shared. */
export async function shareInvite(invite: ShareableInvite): Promise<boolean> {
  const message = buildInviteShareMessage(invite.kind, invite.url, invite.codeDisplay);
  let action: "sharedAction" | "dismissedAction";
  let activityType: string | null = null;
  try {
    const res = await Share.share({ message });
    action = res.action === Share.dismissedAction ? "dismissedAction" : "sharedAction";
    activityType = res.action === Share.sharedAction ? (res.activityType ?? null) : null;
  } catch {
    // The sheet failed to open: nothing was shared.
    return false;
  }
  void logInviteEvent(supabase, "shared", {
    inviteId: invite.inviteId,
    detail: { channel: "share_sheet", activity_type: activityType, action },
  });
  return action === "sharedAction";
}
