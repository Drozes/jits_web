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
 * later wave and is deliberately NOT registered yet: React Navigation throws on
 * a Screen whose route file does not exist, so registering it before the screen
 * lands would crash the app rather than show a placeholder.
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
          or in EloTabBar needs to change for it. */}
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
