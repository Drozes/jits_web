import * as React from "react";
import { RefreshControl, Text, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { RankRow } from "@/components/ui/elo-system";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { easing, type EnteringAnimation } from "@/lib/motion";
import type { RankedAthlete } from "@/lib/leaderboard/use-leaderboard-data";
import {
  orderBeforeClimb,
  RANK_SWAP_MS,
  type RankClimb,
} from "@/lib/leaderboard/use-rank-climb";
import { RankFlare } from "./rank-flare";

const SWAP_TRANSITION = LinearTransition.duration(RANK_SWAP_MS).easing(easing.brandOut);

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
  /** First-load stagger from `useFirstLoadEntering()` (owned by the screen). */
  entering?: (index: number) => EnteringAnimation | undefined;
  /**
   * A rank climb to show (from `useRankClimb`): `old` renders the order before
   * the climb, `swapped` renders the real order with a layout transition and
   * the flare on the athlete's rows. Never set under Reduce Motion.
   */
  climb?: RankClimb | null;
}

function buildSubtitle(athlete: RankedAthlete): string {
  return athlete.gymName ?? "Free agent";
}

export function FightersList({
  athletes,
  isRefreshing,
  onRefresh,
  currentUser,
  entering,
  climb = null,
}: FightersListProps) {
  const tokens = useThemedTokens();
  const router = useRouter();
  const data = React.useMemo(
    () => (climb?.stage === "old" ? orderBeforeClimb(athletes, climb) : athletes),
    [athletes, climb],
  );
  const flaring = climb?.stage === "swapped";
  // The sticky footer flares too: it is the one row always on screen.
  const youRow = currentUser ? (
    <RankRow
      rank={climb?.stage === "old" ? climb.from : currentUser.rank}
      name={`${currentUser.displayName} · You`}
      subtitle={buildSubtitle(currentUser)}
      value={currentUser.currentElo}
      delta={0}
      onPress={() => router.push(`/(app)/athlete/${currentUser.id}`)}
      you
    />
  ) : null;
  // Rows pass delta={0} (renders a neutral muted "—"): there is no real per-row
  // recent-ELO-delta source yet (needs a batch elo_history RPC; get_elo_history is
  // own-profile only), and we never fabricate rating movement. Wire a real value
  // once that RPC lands. See research/013 + jits-4zp.
  return (
    <View className="flex-1">
      <Animated.FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: 4,
          paddingBottom: 16,
          gap: 1,
        }}
        // Layout moves animate only during a climb's swap (a filter change
        // must not slide rows around).
        itemLayoutAnimation={climb ? SWAP_TRANSITION : undefined}
        renderItem={({ item, index }) => {
          const row = (
            <RankRow
              rank={item.rank}
              name={item.displayName}
              subtitle={buildSubtitle(item)}
              value={item.currentElo}
              delta={0}
              leader={item.rank === 1}
              onPress={() => router.push(`/(app)/athlete/${item.id}`)}
            />
          );
          return (
            <Animated.View entering={entering?.(index)}>
              {item.isCurrentUser ? <RankFlare active={flaring}>{row}</RankFlare> : row}
            </Animated.View>
          );
        }}
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
      {youRow ? <RankFlare active={flaring}>{youRow}</RankFlare> : null}
    </View>
  );
}
