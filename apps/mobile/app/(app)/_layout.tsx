import { View } from "react-native";
import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { ArenaBootstrap } from "@/lib/arena/arena-bootstrap";
import { BellBootstrap } from "@/components/notifications/bell-bootstrap";
import { AppStackTopTracker } from "@/lib/deep-links/tab-root-route";
import { StackStripFrame } from "@/components/video-status/upload-strip-slots";

// Anchor the tab navigator beneath the pushed detail screens (athlete/[id],
// match/[matchId], video/[id], highlight/[id], settings). Deep links / reloads into those routes otherwise land with an
// empty stack and a dead back chevron.
export const unstable_settings = {
  initialRouteName: "(tabs)",
};

export default function AppLayout() {
  const tokens = useThemedTokens();

  return (
    <>
      <View style={{ flex: 1, backgroundColor: tokens.bgPrimary }}>
        {/* The upload strip on pushed screens (on the tabs it sits on the bar). */}
        <StackStripFrame>
          <Stack
            screenOptions={{
              headerShown: false,
              presentation: "card",
              contentStyle: { backgroundColor: tokens.bgPrimary },
              headerStyle: { backgroundColor: tokens.bgSecondary },
              headerTintColor: tokens.textPrimary,
              headerTitleStyle: { color: tokens.textPrimary },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="athlete/[id]" />
            {/* A match with no session behind it: where an Arena challenge lands
              both parties. Pushes over the tab bar like every other detail
              screen. */}
            <Stack.Screen name="match/[matchId]" />
            {/* A past match opened from a history row: read-only, never the
              live wizard, so it leaves live state alone. */}
            <Stack.Screen name="match-detail/[matchId]" />
            <Stack.Screen name="video/[id]" />
            {/* One of the athlete's own highlight reels, full screen (push, bell,
              Home, Profile, match detail). Header hidden: a dark video surface. */}
            <Stack.Screen name="highlight/[id]" options={{ headerShown: false }} />
            {/* The Film Room: every past match as a poster grid, from Profile. */}
            <Stack.Screen name="film-room" />
            <Stack.Screen name="settings" />
            {/* The practice match: a local walk through one Arena match against
              a scripted bot. Writes no match data. */}
            <Stack.Screen name="practice" />
            {/* Invites + friends (jr_be spec 016). */}
            <Stack.Screen name="invite/index" />
            <Stack.Screen name="invite/join" />
            <Stack.Screen name="invite/claim" options={{ gestureEnabled: false }} />
            <Stack.Screen name="friends" />
          </Stack>
        </StackStripFrame>
      </View>
      {/* Live state, lobby presence and the incoming-challenge prompt, once for
        the whole signed-in app, so being live survives switching tabs and a
        challenge reaches a live athlete on any screen. */}
      <ArenaBootstrap />
      {/* The notification bell's one realtime channel, feed and panel; the
        header bells are views over its store (jits-dq85.7). */}
      <BellBootstrap />
      {/* Whether a detail screen is pushed over the tabs, so a notification
        tap opens a tab root in place instead of stacking a second one. */}
      <AppStackTopTracker />
    </>
  );
}
