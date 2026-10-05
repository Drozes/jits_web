import * as React from "react";
import { Tabs } from "expo-router";
import { Home, Trophy, User } from "lucide-react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { ArenaTabBarIcon, ArenaTabSignalsProvider } from "@/components/layout/arena-tab-icon";
import { EloTabBar } from "@/components/layout/elo-tab-bar";
import { arenaTabBadge } from "@/lib/arena/mat-board";
import { useArenaTabState } from "@/lib/arena/use-arena-tab-badge";
import { UploadStripSlot } from "@/components/video-status/upload-strip";

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
      <UploadStripSlot placement="tabs" />
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
 * The bar is the target 4-up: Home, Arena, Rankings, Profile. A Screen and its
 * route file have to land together, because expo-router drops a Screen with no
 * matching route file (console.warn "[Layout children]: No route named ...",
 * then it is filtered out, in 6.0.23 build/useScreens.js:65-68) and the column
 * simply would not render. EloTabBar needs no change for a fourth tab: its
 * columns are flex-1 and it reads the list off the navigator.
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
