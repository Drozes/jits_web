/**
 * Personal join invite (jr_be spec 016, US4): the athlete's own reusable QR
 * and link (the same link every time), shared with the join template, plus
 * counts of who joined through it (never identities).
 */
import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  getMyInviteStats,
  getOrCreatePersonalInvite,
  logInviteEvent,
  type InviteStats,
  type PersonalInvite,
} from "@jits/shared/api/invites";
import { createInviteErrorMessage } from "@jits/shared/utils";
import { AppHeader } from "@/components/layout/app-header";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { InviteQr } from "@/components/invite/invite-qr";
import { InviteShareRow } from "@/components/invite/share-row";
import { supabase } from "@/lib/supabase/client";
import { useThemedTokens } from "@/lib/theme/use-theme";

export default function JoinInviteScreen() {
  const router = useRouter();
  const tokens = useThemedTokens();
  const [invite, setInvite] = React.useState<PersonalInvite | null>(null);
  const [stats, setStats] = React.useState<InviteStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    const [res, st] = await Promise.all([getOrCreatePersonalInvite(supabase), getMyInviteStats(supabase)]);
    if (!res.ok) {
      setError(createInviteErrorMessage(res.error.hint));
      return;
    }
    setInvite(res.data);
    if (st.ok) setStats(st.data);
    void logInviteEvent(supabase, "qr_shown", { inviteId: res.data.invite_id });
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const joined = stats?.joined_count ?? 0;

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Invite to ELO RATED" back backFallback={"/profile" as Href} />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
        {error ? (
          <Plate className="gap-4">
            <Text accessibilityRole="alert" className="font-body text-[14px] text-ink leading-6">
              {error}
            </Text>
            <Button variant="secondary" label="Try again" onPress={() => void load()} />
          </Plate>
        ) : !invite ? (
          <View className="items-center py-16">
            <ActivityIndicator color={tokens.textSecondary} accessibilityLabel="Loading your invite" />
          </View>
        ) : (
          <>
            <Text className="font-body text-[14px] text-ink-2 text-center leading-6">
              Your personal link. Anyone who joins through it becomes your friend on ELO RATED.
            </Text>
            <View className="items-center">
              <InviteQr value={invite.url} />
            </View>
            <Text selectable className="font-mono text-[12px] text-ink-2 text-center" testID="join-url">
              {invite.url}
            </Text>
            {joined > 0 ? (
              <Text className="font-heading text-[13px] uppercase tracking-caps-l text-ink text-center">
                <Text className="font-mono tabular-nums">{joined}</Text> {joined === 1 ? "friend" : "friends"} joined
              </Text>
            ) : null}
            <InviteShareRow invite={{ inviteId: invite.invite_id, kind: "join", url: invite.url }} />
            <Button label="Challenge a friend" onPress={() => router.push("/invite?from=profile" as Href)} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
