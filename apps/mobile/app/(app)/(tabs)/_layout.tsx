import { Tabs } from "expo-router";
import { Building2, Dumbbell, Home, Trophy, User } from "lucide-react-native";
import { EloTabBar } from "@/components/layout/elo-tab-bar";
import { useManagedGyms } from "@/lib/gym-manager/use-managed-gyms";

export default function TabsLayout() {
  // The gym-owner tab is only shown to athletes who manage at least one gym.
  // The screen stays mounted either way; `tabBarButton: () => null` is the
  // Expo Router idiom for a hidden tab, which EloTabBar honors.
  const { gyms } = useManagedGyms();
  const isManager = gyms.length > 0;

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
      <Tabs.Screen
        name="gyms"
        options={{
          title: "Gyms",
          tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size} />,
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
        name="gym-manager"
        options={{
          title: "Gym",
          tabBarIcon: ({ color, size }) => <Building2 color={color} size={size} />,
          tabBarButton: isManager ? undefined : () => null,
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
