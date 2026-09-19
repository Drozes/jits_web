import { Stack } from "expo-router";

// Anchor the hub beneath the portal's leaf screens, exactly as gyms/_layout.tsx
// does for the gym list. Without it a cold entry into a leaf (deep link, OTA
// reload, OS state restoration) leaves that leaf as the portal's only screen,
// and since (app) already holds [(tabs), gym-manager], router.canGoBack() is
// true: AppHeader would pop the WHOLE portal out to Home without ever
// consulting the screen's backFallback. With the anchor, back lands on the hub,
// which is exactly where every leaf's fallback points.
export const unstable_settings = {
  initialRouteName: "index",
};

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
