/**
 * Inviter screen (jr_be spec 016, M2, AC1.2 to AC1.6): one single-use
 * challenge invite with its QR (black on white), the short code in big
 * monospace, Share / WhatsApp / SMS, a live waiting state and Revoke.
 */
import * as React from "react";
import { ActivityIndicator, Alert, Linking, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import type { InviteEntryPoint } from "@jits/shared/api/invites";
import { BOOKED_COPY, LOCATION_DENIED_COPY } from "@jits/shared/utils";
import { AppHeader } from "@/components/layout/app-header";
import { CtaButton, SecondaryButton, TertiaryButton } from "@/components/auth/auth-buttons";
import { Plate } from "@/components/ui/elo-system";
import { InviteQr } from "@/components/invite/invite-qr";
import { InviteShareRow } from "@/components/invite/share-row";
import { useChallengeInvite } from "@/lib/invites/use-challenge-invite";
import { ARENA_HREF, arenaMatchHref } from "@/lib/arena/constants";
import { isInArenaMatch } from "@/lib/arena/arena-store";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAuth } from "@/lib/auth/hooks";

const ENTRY_POINTS: readonly InviteEntryPoint[] = ["arena", "profile", "verdict", "home", "friends"];

export default function InviteScreen() {
  const router = useRouter();
  const tokens = useThemedTokens();
  const { athlete } = useAuth();
  const me = athlete?.first_name || athlete?.display_name || "You";
  const { from } = useLocalSearchParams<{ from?: string }>();
  const entry = ENTRY_POINTS.includes(from as InviteEntryPoint) ? (from as InviteEntryPoint) : null;
  const { invite, phase, locationDenied, revoke, retry } = useChallengeInvite(entry);

  React.useEffect(() => {
    if (phase.kind === "started" && !isInArenaMatch()) router.replace(arenaMatchHref(phase.matchId) as Href);
  }, [phase, router]);

  const confirmRevoke = () =>
    Alert.alert("Withdraw this challenge?", "The link and code stop working.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Withdraw",
        style: "destructive",
        onPress: async () => {
          const res = await revoke();
          if (!res.ok && res.hint === "invite_already_claimed") {
            Alert.alert("Already accepted", "Your training partner accepted this challenge.");
          }
        },
      },
    ]);

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Challenge a Friend" back backFallback={ARENA_HREF as Href} />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20, alignItems: "stretch" }}>
        {phase.kind === "creating" ? (
          <View className="items-center py-16">
            <ActivityIndicator color={tokens.textSecondary} accessibilityLabel="Creating your challenge" />
          </View>
        ) : null}

        {phase.kind === "error" ? (
          <Plate className="gap-4" testID="invite-error">
            <Text accessibilityRole="alert" className="font-body text-[14px] text-ink leading-6">
              {phase.message}
            </Text>
            <SecondaryButton label="Try again" onPress={() => void retry()} />
          </Plate>
        ) : null}

        {invite && (phase.kind === "open" || phase.kind === "claimed") ? (
          <>
            <Text className="font-body text-[14px] text-ink-2 text-center leading-6">
              Have them scan this with their phone camera, or type the code in ELO RATED.
            </Text>
            <View className="items-center">
              <InviteQr value={invite.url} />
            </View>
            <View className="items-center gap-1">
              <Text className="font-mono text-[11px] uppercase tracking-caps-l text-ink-3">Code</Text>
              <Text
                testID="invite-code"
                accessibilityLabel={`Code ${invite.short_code.split("").join(" ")}`}
                className="font-mono text-[40px] tabular-nums tracking-[4px] text-ink"
              >
                {invite.short_code_display}
              </Text>
            </View>
            <View className="items-center py-2" accessibilityLiveRegion="polite">
              <Text className="font-heading text-[14px] text-ink uppercase tracking-caps-l">
                {phase.kind === "claimed" ? "Accepted. Getting the match ready..." : "Waiting for a training partner..."}
              </Text>
            </View>
            {locationDenied ? (
              <View className="gap-2">
                <Text className="font-body text-[13px] text-ink-2 leading-5">{LOCATION_DENIED_COPY}</Text>
                <SecondaryButton label="Open Settings" onPress={() => void Linking.openSettings()} />
              </View>
            ) : null}
            <InviteShareRow
              invite={{ inviteId: invite.invite_id, kind: "challenge", url: invite.url, codeDisplay: invite.short_code_display }}
            />
            {phase.kind === "open" ? <TertiaryButton label="Withdraw challenge" onPress={confirmRevoke} /> : null}
          </>
        ) : null}

        {phase.kind === "booked" ? (
          <Plate className="gap-4" testID="invite-booked">
            <Text className="font-heading text-[18px] text-ink uppercase">
              {phase.opponentName ? `You're booked: ${me} vs ${phase.opponentName}` : "You're booked"}
            </Text>
            <Text className="font-body text-[14px] text-ink leading-6">{BOOKED_COPY}</Text>
            <CtaButton label="Go to the Arena" onPress={() => router.replace(`${ARENA_HREF}?booking=${phase.challengeId}` as Href)} />
          </Plate>
        ) : null}

        {phase.kind === "revoked" || phase.kind === "expired" ? (
          <Plate className="gap-4">
            <Text className="font-body text-[14px] text-ink leading-6">
              {phase.kind === "revoked" ? "Challenge withdrawn." : "This challenge expired."}
            </Text>
            <CtaButton label="New challenge" onPress={() => void retry()} />
          </Plate>
        ) : null}
      </ScrollView>
    </View>
  );
}
