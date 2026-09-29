import { Tabs } from "expo-router";
import { Home, Swords, Trophy, User } from "lucide-react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { EloTabBar } from "@/components/layout/elo-tab-bar";
import { useArenaTabBadge } from "@/lib/arena/use-arena-tab-badge";

/**
 * The bar plus its status marks. Its own component so the Arena badge
 * (red count, green dot, hollow ring; `useArenaTabBadge`) re-renders the bar
 * only, never the navigator.
 */
function TabBar(props: BottomTabBarProps) {
  const arena = useArenaTabBadge();
  return <EloTabBar {...props} badges={{ arena }} />;
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
          tabBarIcon: ({ color, size }) => <Swords color={color} size={size} />,
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
