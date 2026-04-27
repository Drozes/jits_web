import { Tabs } from "expo-router";
import { Dumbbell, Home, Trophy, User } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";

export default function AppLayout() {
  const tokens = useThemedTokens();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.primary,
        tabBarInactiveTintColor: tokens.mutedForeground,
        tabBarStyle: {
          backgroundColor: tokens.card,
          borderTopColor: tokens.border,
        },
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
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="athlete" options={{ href: null }} />
      <Tabs.Screen name="session" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
