import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

export default function HomeLayout() {
  const tokens = useThemedTokens();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "card",
        // Headers are hidden, but these set the fallback colors if a child
        // ever re-enables one. Use the ELO surface family.
        headerStyle: { backgroundColor: tokens.bgSecondary },
        headerTintColor: tokens.textPrimary,
        headerTitleStyle: { color: tokens.textPrimary },
      }}
    />
  );
}
