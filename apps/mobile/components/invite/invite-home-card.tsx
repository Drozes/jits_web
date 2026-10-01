import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { SecondaryButton } from "@/components/auth/auth-buttons";
import { useInvitesEnabled } from "@/lib/invites/use-invites-enabled";

/**
 * Home fallback entry point (jr_be spec 016): only when Home has no practice
 * offer and no resume prompt (the caller decides), and invites are on.
 * Secondary styling: never the screen's red CTA.
 */
export function InviteHomeCard() {
  const router = useRouter();
  const invitesOn = useInvitesEnabled();
  if (!invitesOn) return null;
  return (
    <View testID="home-invite-card" className="gap-3 rounded-sm border border-hairline-faint bg-surface-3 px-4 py-4">
      <Text className="font-body text-[14px] text-ink leading-6">
        Got a training partner who isn't on ELO RATED yet? Invite them.
      </Text>
      <SecondaryButton label="Invite a training partner" onPress={() => router.push("/invite?from=home" as Href)} />
    </View>
  );
}
