import * as React from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { LivePill } from "@/components/ui/elo-system/live-pill";
import { useIsArenaLive } from "@/lib/arena/arena-store";
import { ARENA_HREF } from "@/lib/arena/constants";

interface LiveHeaderSignalProps {
  /**
   * "link" (default) taps through to the Arena. "static" is for the Arena
   * itself, where a link back to the screen you are on would be a dead tap.
   */
  variant?: "link" | "static";
}

/**
 * The header's LIVE pill: shown on every screen while the athlete is live in
 * the Arena, so they always know they are advertised as available and can be
 * challenged. Renders nothing when offline.
 *
 * Reads the app-wide store, so it works in any header without a Provider, and
 * reads "not live" outside the signed-in app.
 */
export function LiveHeaderSignal({ variant = "link" }: LiveHeaderSignalProps) {
  const isLive = useIsArenaLive();
  const router = useRouter();

  if (!isLive) return null;

  if (variant === "static") {
    return (
      <View
        testID="live-header-signal"
        accessible
        accessibilityLabel="You are live in the Arena"
      >
        <LivePill />
      </View>
    );
  }

  return (
    <Pressable
      testID="live-header-signal"
      accessibilityRole="button"
      accessibilityLabel="You are live in the Arena. Open Arena"
      hitSlop={10}
      onPress={() => router.navigate(ARENA_HREF)}
      className="h-8 justify-center rounded-xs px-1 active:bg-surface-3"
    >
      <LivePill />
    </Pressable>
  );
}
