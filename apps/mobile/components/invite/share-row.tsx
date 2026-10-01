import { Pressable, Text, View } from "react-native";
import { SecondaryButton } from "@/components/auth/auth-buttons";
import { shareInvite, type ShareableInvite } from "@/lib/invites/share-invite";

/** Share, plus WhatsApp and SMS shortcuts. Secondary styling: the screen's one red CTA is elsewhere. */
export function InviteShareRow({ invite }: { invite: ShareableInvite }) {
  return (
    <View className="gap-3">
      <SecondaryButton label="Share" onPress={() => void shareInvite(invite, "share_sheet")} />
      <View className="flex-row gap-3">
        <Shortcut label="WhatsApp" onPress={() => void shareInvite(invite, "wa_me")} />
        <Shortcut label="Text message" onPress={() => void shareInvite(invite, "sms")} />
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
