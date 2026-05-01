import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="athlete/[id]" />
      <Stack.Screen name="session/[id]" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
