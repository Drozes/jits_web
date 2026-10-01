/**
 * Invite sharing (contract 6): the share sheet gets a message only, with the
 * link inside it, plus WhatsApp and SMS shortcuts. The resolved
 * `{action, activityType}` is logged as the `shared` step.
 */
import { Linking, Share } from "react-native";
import { logInviteEvent } from "@jits/shared/api/invites";
import { buildInviteShareMessage, smsShareUrl, whatsappShareUrl, type InviteKind } from "@jits/shared/utils";
import { supabase } from "@/lib/supabase/client";

export type ShareChannel = "share_sheet" | "wa_me" | "sms";

export interface ShareableInvite {
  inviteId: string;
  kind: InviteKind;
  url: string;
  codeDisplay?: string | null;
}

/** Opens the share target and logs it. Resolves false when nothing opened. */
export async function shareInvite(invite: ShareableInvite, channel: ShareChannel): Promise<boolean> {
  const message = buildInviteShareMessage(invite.kind, invite.url, invite.codeDisplay);
  let action: "sharedAction" | "dismissedAction" = "sharedAction";
  let activityType: string | null = null;
  try {
    if (channel === "share_sheet") {
      const res = await Share.share({ message });
      action = res.action === Share.dismissedAction ? "dismissedAction" : "sharedAction";
      activityType = res.action === Share.sharedAction ? (res.activityType ?? null) : null;
    } else {
      await Linking.openURL(channel === "wa_me" ? whatsappShareUrl(message) : smsShareUrl(message));
    }
  } catch {
    // WhatsApp not installed, or the sheet failed to open: nothing was shared.
    return false;
  }
  void logInviteEvent(supabase, "shared", {
    inviteId: invite.inviteId,
    detail: { channel, activity_type: activityType, action },
  });
  return action === "sharedAction";
}
