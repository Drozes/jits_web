import { Stack } from "expo-router";

/**
 * Gym-owner portal (H1-H11). The portal is not a tab: it sits outside the
 * `(tabs)` group and is pushed over the tab bar from the Manage Gym affordance
 * on /gyms/[id], which hands it the gym via a `gymId` param. The hub (index) is
 * the entry screen; sessions, roster, stats, and ladder push on top as a Stack.
 * Headers come from each screen's own <AppHeader>, so the native header stays
 * hidden, and every screen's backFallback resolves without a tab to escape to.
 */
export default function GymManagerLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
