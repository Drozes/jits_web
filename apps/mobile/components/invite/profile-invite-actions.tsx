import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, QrCode, Users } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useInvitesEnabled } from "@/lib/invites/use-invites-enabled";

/**
 * Profile entry points (jr_be spec 016): the personal join QR and the
 * Friends list. Secondary surface styling, like Share profile. The invite
 * row is hidden while `invites_enabled` is off; Friends always shows.
 */
export function ProfileInviteActions() {
  const router = useRouter();
  const invitesOn = useInvitesEnabled();
  return (
    <View className="gap-[1px]">
      {invitesOn ? (
        <Row icon="qr" label="Invite a training partner" onPress={() => router.push("/invite/join" as Href)} />
      ) : null}
      <Row icon="friends" label="Friends" onPress={() => router.push("/friends" as Href)} />
    </View>
  );
}

function Row({ icon, label, onPress }: { icon: "qr" | "friends"; label: string; onPress: () => void }) {
  const tokens = useThemedTokens();
  const Icon = icon === "qr" ? QrCode : Users;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-row items-center gap-3 bg-surface-3 border border-hairline-faint rounded-xs px-4 py-3 active:bg-surface-4"
    >
      <View pointerEvents="none">
        <Icon size={16} color={tokens.textSecondary} />
      </View>
      <Text className="flex-1 font-heading text-[12px] text-ink uppercase tracking-caps">{label}</Text>
      <View pointerEvents="none">
        <ChevronRight size={16} color={tokens.textTertiary} />
      </View>
    </Pressable>
  );
}
