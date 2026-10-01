/**
 * Friends (jr_be spec 016, US6): live first, then by name. Remove goes
 * through a confirm sheet. Friendships come from accepted invites only.
 */
import * as React from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { getMyFriends, removeFriend, type FriendCard } from "@jits/shared/api/friends";
import { AppHeader } from "@/components/layout/app-header";
import { CtaButton, SecondaryButton } from "@/components/auth/auth-buttons";
import { Avatar32, LivePill, Plate } from "@/components/ui/elo-system";
import { supabase } from "@/lib/supabase/client";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useInvitesEnabled } from "@/lib/invites/use-invites-enabled";

export default function FriendsScreen() {
  const router = useRouter();
  const tokens = useThemedTokens();
  const invitesOn = useInvitesEnabled();
  const [friends, setFriends] = React.useState<FriendCard[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await getMyFriends(supabase);
    if (res.ok) {
      setFriends(res.data);
      setError(null);
    } else {
      setError("Couldn't load your friends. Check your connection.");
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const confirmRemove = (f: FriendCard) =>
    Alert.alert(`Remove ${f.display_name}?`, "You won't see when they're on the mat.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const res = await removeFriend(supabase, f.athlete_id);
          if (res.ok) setFriends((cur) => cur?.filter((x) => x.athlete_id !== f.athlete_id) ?? cur);
          else Alert.alert("Couldn't remove", "Check your connection and try again.");
        },
      },
    ]);

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Friends" back backFallback={"/profile" as Href} />
      {error ? (
        <View className="gap-4 p-6">
          <Text accessibilityRole="alert" className="font-body text-[14px] text-ink-2">{error}</Text>
          <SecondaryButton label="Try again" onPress={() => void load()} />
        </View>
      ) : friends === null ? (
        <View className="items-center py-16">
          <ActivityIndicator color={tokens.textSecondary} accessibilityLabel="Loading friends" />
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(f) => f.athlete_id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          ListEmptyComponent={
            <Plate className="gap-4">
              <Text className="font-body text-[14px] text-ink leading-6">
                No friends yet. When someone accepts your invite, you're friends automatically.
              </Text>
              {invitesOn ? (
                <CtaButton label="Invite a training partner" onPress={() => router.push("/invite/join" as Href)} />
              ) : null}
            </Plate>
          }
          renderItem={({ item }) => (
            <View className="flex-row items-center gap-3 rounded-sm bg-surface-2 px-3 py-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.display_name}${item.is_live ? ", on the mat" : ""}, ${item.current_elo} ELO`}
                onPress={() => router.push(`/athlete/${item.athlete_id}` as Href)}
                className="flex-1 flex-row items-center gap-3 active:opacity-70"
              >
                <Avatar32 name={item.display_name} photoUrl={item.avatar_url} />
                <View className="flex-1">
                  <Text className="font-heading text-[14px] text-ink" numberOfLines={1}>{item.display_name}</Text>
                  <Text className="font-mono text-[12px] tabular-nums text-ink-3">{item.current_elo} ELO</Text>
                </View>
                {item.is_live ? <LivePill /> : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.display_name}`}
                hitSlop={8}
                onPress={() => confirmRemove(item)}
                className="px-2 py-1 active:opacity-70"
              >
                <Text className="font-heading text-[11px] uppercase tracking-caps-l text-ink-3">Remove</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}
