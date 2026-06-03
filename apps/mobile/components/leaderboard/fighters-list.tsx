import { FlatList, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { RankRow } from "@/components/ui/elo-system";
import { useThemedTokens } from "@/lib/theme/use-theme";
import type { RankedAthlete } from "@/lib/leaderboard/use-leaderboard-data";

interface FightersListProps {
  athletes: RankedAthlete[];
  isRefreshing: boolean;
  onRefresh: () => void;
  /**
   * The current user, if present in the unfiltered dataset. Rendered as a
   * sticky `RankRow` footer with `you` styling so the user can always see
   * where they stand even when their row scrolls offscreen.
   */
  currentUser: RankedAthlete | null;
}

function buildSubtitle(athlete: RankedAthlete): string {
  return athlete.gymName ?? "Free agent";
}

export function FightersList({
  athletes,
  isRefreshing,
  onRefresh,
  currentUser,
}: FightersListProps) {
  const tokens = useThemedTokens();
  const router = useRouter();
  // Rows pass delta={0} (renders a neutral muted "—"): there is no real per-row
  // recent-ELO-delta source yet (needs a batch elo_history RPC; get_elo_history is
  // own-profile only), and we never fabricate rating movement. Wire a real value
  // once that RPC lands. See research/013 + jits-4zp.
  return (
    <View className="flex-1">
      <FlatList
        data={athletes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: 4,
          paddingBottom: 16,
          gap: 1,
        }}
        renderItem={({ item, index }) => (
          <RankRow
            rank={index + 1}
            name={item.displayName}
            subtitle={buildSubtitle(item)}
            value={item.currentElo}
            delta={0}
            leader={index === 0}
            onPress={() => router.push(`/(app)/athlete/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <View className="rounded-md border border-dashed border-hairline p-8 items-center mx-1">
            <Text className="font-body text-[13px] text-ink-3">
              No athletes found
            </Text>
          </View>
        }
        ListFooterComponent={
          <Text className="text-center font-mono text-[10px] text-ink-3 uppercase tracking-caps-l pt-3">
            Rankings based on current ELO
          </Text>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accentCta}
          />
        }
      />
      {currentUser ? (
        <RankRow
          rank={currentUser.rank}
          name={`${currentUser.displayName} · You`}
          subtitle={buildSubtitle(currentUser)}
          value={currentUser.currentElo}
          delta={0}
          onPress={() => router.push(`/(app)/athlete/${currentUser.id}`)}
          you
        />
      ) : null}
    </View>
  );
}
