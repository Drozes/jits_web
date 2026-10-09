import * as React from "react";
import { Tabs } from "expo-router";
import { Film, Home, Trophy, User } from "lucide-react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { ArenaTabBarIcon, ArenaTabSignalsProvider } from "@/components/layout/arena-tab-icon";
import { EloTabBar } from "@/components/layout/elo-tab-bar";
import { arenaTabBadge } from "@/lib/arena/mat-board";
import { useArenaTabState } from "@/lib/arena/use-arena-tab-badge";
import { TabsUploadStrip } from "@/components/video-status/upload-strip-slots";

/**
 * The bar plus its status marks. Its own component so the Arena state (the
 * badge: red count, green dot, hollow ring, see `arenaTabBadge`; and the
 * Arena icon's embers and blade clash, see `ArenaTabIcon`) re-renders the bar
 * only, never the navigator. Live is passed to the bar separately because a
 * count overrides the green dot, and VoiceOver still says "live".
 */
function TabBar(props: BottomTabBarProps) {
  const arena = useArenaTabState();
  const signals = React.useMemo(
    () => ({
      live: arena.isLive,
      incomingCount: arena.incomingCount,
      incomingKnown: arena.incomingKnown,
    }),
    [arena.isLive, arena.incomingCount, arena.incomingKnown],
  );
  return (
    <ArenaTabSignalsProvider value={signals}>
      {/* The app-wide upload strip sits on the bar, never in the header (jits-n2im.2). */}
      <TabsUploadStrip />
      <EloTabBar {...props} badges={{ arena: arenaTabBadge(arena) }} live={{ arena: arena.isLive }} />
    </ArenaTabSignalsProvider>
  );
}

/**
 * Bottom tab navigator. Every route directory inside this `(tabs)` group gets a
 * slot in EloTabBar, so a screen that must NOT be a tab lives outside the group
 * instead, as a sibling of `(tabs)` under `(app)` that pushes over the bar as a
 * card (athlete/[id], match/[matchId], video/[id], settings). Mobile has no gym
 * pages, sessions or gym-manager portal: the Arena tab is the only way to get a
 * match.
 *
 * The bar is 5-up (owner decision 2026-10-06, spec specs/matches-tab/spec.md
 * section 4.1, reopening the four-tab decision of jits-tj5n / jits-icei):
 * Home, Arena, Matches, Rankings, Profile. Matches is the athlete's own match
 * history (it replaced the pushed Film Room screen) and carries no badge: the
 * Arena's is the only tab badge (PM9). A Screen and its route directory have
 * to land together, in the same commit, because expo-router drops a Screen
 * with no matching route file (console.warn "[Layout children]: No route
 * named ...", then it is filtered out, in 6.0.23 build/useScreens.js:65-68)
 * and the column simply would not render. EloTabBar needs no change for a
 * fifth tab: its columns are flex-1 and it reads the list off the navigator.
 * At 375 pt each column is 75 pt, and every label fits on one line there
 * (asserted from the font's real advance widths in elo-tab-bar.test.tsx).
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="arena"
        options={{
          title: "Arena",
          tabBarIcon: ({ color, size, focused }) => (
            <ArenaTabBarIcon color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Film",
          tabBarIcon: ({ color, size }) => <Film color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Rankings",
          tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
