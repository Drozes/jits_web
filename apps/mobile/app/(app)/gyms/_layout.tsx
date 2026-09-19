import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

// Anchor the gym list beneath the gym detail so the header back chevron always
// has somewhere to pop to. Without this, entering /gyms/[id] directly (full JS
// reload, a /gyms/* universal link, or OS state restoration) leaves [id] as the
// only screen on the stack and router.back() silently no-ops (dead back button).
export const unstable_settings = {
  initialRouteName: "index",
};

export default function GymsLayout() {
  const tokens = useThemedTokens();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "card",
        headerStyle: { backgroundColor: tokens.background },
        headerTintColor: tokens.foreground,
        headerTitleStyle: { color: tokens.foreground },
      }}
    />
  );
}
