import { Pressable, Text, View } from "react-native";
import { SecondaryButton } from "@/components/auth/auth-buttons";
import { shareInvite, type ShareableInvite, type ShareChannel } from "@/lib/invites/share-invite";

/**
 * Share, plus WhatsApp and SMS shortcuts. Secondary styling: the screen's one
 * red CTA is elsewhere. `onShared` fires when a share target actually opened.
 */
export function InviteShareRow({ invite, onShared }: { invite: ShareableInvite; onShared?: () => void }) {
  const share = (channel: ShareChannel) =>
    void shareInvite(invite, channel).then((shared) => {
      if (shared) onShared?.();
    });
  return (
    <View className="gap-3">
      <SecondaryButton label="Share" onPress={() => share("share_sheet")} />
      <View className="flex-row gap-3">
        <Shortcut label="WhatsApp" onPress={() => share("wa_me")} />
        <Shortcut label="Text message" onPress={() => share("sms")} />
      </View>
    </View>
  );
}

function Shortcut({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Share by ${label}`}
      onPress={onPress}
      className="flex-1 items-center justify-center rounded-sm border border-hairline-strong bg-surface-3 px-3 py-3 active:opacity-70"
    >
      <Text className="font-heading text-[12px] uppercase tracking-caps-l text-ink">{label}</Text>
    </Pressable>
  );
}
