/**
 * Inviter screen (jr_be spec 016, M2, AC1.2 to AC1.6): one single-use
 * challenge invite with its QR (black on white), the short code in big
 * monospace, Share, a live waiting state and Revoke.
 */
import * as React from "react";
import { ActivityIndicator, Alert, Linking, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter, type Href } from "expo-router";
import type { InviteEntryPoint } from "@jits/shared/api/invites";
import { BOOKED_COPY, BOOKING_CLOSED_COPY, LOCATION_DENIED_COPY, START_AVAILABLE_COPY } from "@jits/shared/utils";
import { AppHeader } from "@/components/layout/app-header";
import { CtaButton, SecondaryButton, TertiaryButton } from "@/components/auth/auth-buttons";
import { Plate } from "@/components/ui/elo-system";
import { InviteQr } from "@/components/invite/invite-qr";
import { InviteShareRow } from "@/components/invite/share-row";
import { OpenChallenges } from "@/components/invite/open-challenges";
import { useChallengeInvite } from "@/lib/invites/use-challenge-invite";
import { useMatchLocationFlag } from "@/lib/arena/match-location-flag";
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
  // Until the flag is known neither variant shows (no Start match flash).
  const { required: locationRequired, known: flagKnown } = useMatchLocationFlag();
  const showStart = flagKnown && !locationRequired;
  const { invite, phase, locationDenied, codeStale, revoke, retry, keepOpen, wouldWithdrawOnLeave, start } =
    useChallengeInvite(entry, { locationRequired });
  const [openListKey, setOpenListKey] = React.useState(0);

  React.useEffect(() => {
    if (phase.kind === "started" && !isInArenaMatch()) router.replace(arenaMatchHref(phase.matchId) as Href);
  }, [phase, router]);

  // Leaving with an open invite nobody has been sent: ask, rather than
  // silently leaving it open for 7 days (it counts toward the 5-open limit).
  const navigation = useNavigation();
  React.useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (!wouldWithdrawOnLeave()) return;
        e.preventDefault();
        Alert.alert(
          "Keep this challenge open?",
          "Nobody has accepted it yet. Keep the link and code working for 7 days, or withdraw it now.",
          [
            { text: "Withdraw", style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
            {
              text: "Keep open",
              onPress: () => {
                keepOpen();
                navigation.dispatch(e.data.action);
              },
            },
          ],
        );
      }),
    [navigation, keepOpen, wouldWithdrawOnLeave],
  );

  const confirmRevoke = () =>
    Alert.alert("Withdraw this challenge?", "The link and code stop working.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Withdraw",
        style: "destructive",
        onPress: async () => {
          const res = await revoke();
          if (!res.ok) Alert.alert("Couldn't withdraw", res.message);
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
            {phase.hint === "too_many_open_invites" ? (
              <OpenChallenges
                key={openListKey}
                athleteId={athlete?.id ?? null}
                onWithdrawn={() => void retry()}
              />
            ) : null}
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
                className={`font-mono text-[40px] tabular-nums tracking-[4px] ${codeStale ? "text-ink-3" : "text-ink"}`}
              >
                {invite.short_code_display}
              </Text>
              {codeStale ? (
                <Text testID="invite-code-stale" className="font-body text-[12px] text-ink-3 text-center">
                  This code expired. Getting a new one... The QR and link still work.
                </Text>
              ) : null}
            </View>
            <View className="items-center py-2" accessibilityLiveRegion="polite">
              <Text className="font-heading text-[14px] text-ink uppercase tracking-caps-l">
                {phase.kind === "claimed"
                  ? phase.claimerName
                    ? `Waiting for ${phase.claimerName}...`
                    : "Accepted. Getting the match ready..."
                  : "Waiting for a training partner..."}
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
              onShared={keepOpen}
            />
            {phase.kind === "open" ? <TertiaryButton label="Withdraw challenge" onPress={confirmRevoke} /> : null}
            {phase.kind === "open" ? (
              <OpenChallenges
                key={openListKey}
                athleteId={athlete?.id ?? null}
                excludeInviteId={invite.invite_id}
                title="Your other open challenges"
                onWithdrawn={() => setOpenListKey((n) => n + 1)}
              />
            ) : null}
          </>
        ) : null}

        {phase.kind === "booked" ? (
          <Plate className="gap-4" testID="invite-booked">
            <Text className="font-heading text-[18px] text-ink uppercase">
              {phase.opponentName ? `You're booked: ${me} vs ${phase.opponentName}` : "You're booked"}
            </Text>
            <Text className="font-body text-[14px] text-ink leading-6">
              {showStart ? START_AVAILABLE_COPY : BOOKED_COPY}
            </Text>
            {showStart && phase.startError ? (
              <Text testID="invite-start-error" accessibilityRole="alert" className="font-body text-[14px] text-ink leading-6">
                {phase.startError}
              </Text>
            ) : null}
            {showStart ? (
              // Secondary: red stays the one CTA on this plate.
              <SecondaryButton
                label={phase.starting ? "Starting..." : "Start match"}
                disabled={Boolean(phase.starting)}
                onPress={() => void start()}
              />
            ) : null}
            <CtaButton label="Go to the Arena" onPress={() => router.replace(`${ARENA_HREF}?booking=${phase.challengeId}` as Href)} />
          </Plate>
        ) : null}

        {phase.kind === "closed" ? (
          <Plate className="gap-4" testID="invite-booking-closed">
            <Text accessibilityRole="alert" className="font-body text-[14px] text-ink leading-6">
              {BOOKING_CLOSED_COPY}
            </Text>
            <CtaButton label="Go to the Arena" onPress={() => router.replace(ARENA_HREF as Href)} />
          </Plate>
        ) : null}

        {phase.kind === "started" && isInArenaMatch() ? (
          <Plate className="gap-4" testID="invite-started">
            <Text className="font-heading text-[18px] text-ink uppercase">Your match is ready</Text>
            <Text className="font-body text-[14px] text-ink leading-6">
              Finish your current match, then start this one.
            </Text>
            <CtaButton label="Go to the match" onPress={() => router.replace(arenaMatchHref(phase.matchId) as Href)} />
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
