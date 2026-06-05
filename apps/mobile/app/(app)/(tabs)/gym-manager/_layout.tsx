import { Stack } from "expo-router";

/**
 * Gym-owner portal (H1-H11). The hub (index) is the tab landing; sessions,
 * roster, stats, and ladder push on top as a Stack. Headers come from each
 * screen's own <AppHeader>, so the native header stays hidden.
 */
export default function GymManagerLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
