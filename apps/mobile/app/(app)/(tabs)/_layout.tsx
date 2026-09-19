import { Tabs } from "expo-router";
import { Home, Trophy, User } from "lucide-react-native";
import { EloTabBar } from "@/components/layout/elo-tab-bar";

/**
 * Bottom tab navigator. Every route directory inside this `(tabs)` group gets a
 * slot in EloTabBar, so a screen that must NOT be a tab lives outside the group
 * instead: `/gyms` and `/gym-manager` are now siblings of `(tabs)` under
 * `(app)` and push over the bar as cards. Their URLs are unchanged (both
 * `(app)` and `(tabs)` are route groups, which do not appear in the path). Gym
 * and session discovery is entered from Home; the gym-manager portal is entered
 * from the manager affordance on `/gyms/[id]`.
 *
 * Target layout is a 4-up bar: Home, Arena, Rankings, Profile. Arena ships in a
 * later wave, so the bar deliberately carries three tabs until then rather than
 * a placeholder route that would be deleted days later. Registering `arena`
 * ahead of its screen would not help either: expo-router drops a Screen with no
 * matching route file (console.warn "[Layout children]: No route named ...",
 * then it is filtered out, in 6.0.23 build/useScreens.js:65-68), so the fourth
 * column would simply not render. The tab and the screen land together.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <EloTabBar {...props} />}
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
      {/* ===== ARENA TAB SLOT (second of four) =====
          Add the `arena` Tabs.Screen right here, at the same time as the
          `app/(app)/(tabs)/arena/` route directory. Nothing else in this file
          or in EloTabBar needs to change for it. Both expectations in
          __tests__/app/tabs-layout.test.tsx take "arena" in this position. */}
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
