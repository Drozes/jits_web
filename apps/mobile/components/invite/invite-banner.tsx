import { Text, View } from "react-native";
import { inviteSignupBanner } from "@jits/shared/utils";

/**
 * Signup banner for an invitee (contract section 7). The inviter's name is
 * not readable before sign-in (the preview RPC is server-only), so a signed-out
 * invitee sees the neutral "Your training partner" form.
 */
export function InviteBanner({ kind, inviterName }: { kind: "join" | "challenge" | null; inviterName: string | null }) {
  return (
    <View
      testID="invite-signup-banner"
      accessibilityRole="summary"
      className="rounded-sm border border-hairline-strong bg-surface-2 px-4 py-3"
    >
      <Text className="font-heading text-[14px] text-ink">{inviteSignupBanner(kind, inviterName)}</Text>
    </View>
  );
}
