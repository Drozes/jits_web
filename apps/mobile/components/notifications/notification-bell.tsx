/**
 * Bell icon with an unread badge, for a tab-root header. Tapping opens the
 * one app-wide notification panel.
 *
 * A thin view over `lib/notifications/bell-store.ts` (jits-dq85.7): the
 * pending-challenges channel, the feed and the panel live once in
 * `BellBootstrap`, so four headers cost one realtime channel, not four. The
 * badge is fresh incoming challenges plus unseen highlight reels.
 */
import * as React from "react";
import { Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Bell } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { CountPill, formatBadgeCount } from "@/components/ui/count-pill";
import {
  notifyBellFocused,
  openBell,
  useBellBadgeCount,
} from "@/lib/notifications/bell-store";

/** Takes no props: the bell reads the signed-in athlete's store. */
export function NotificationBell() {
  const tokens = useThemedTokens();
  const count = useBellBadgeCount();

  // The header this bell sits in gained focus: the host re-reads the reels
  // (deduped), so one watched elsewhere stops counting.
  useFocusEffect(
    React.useCallback(() => {
      notifyBellFocused();
    }, []),
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Notifications"
      accessibilityValue={count > 0 ? { text: `${count} new` } : undefined}
      onPress={openBell}
      className="relative w-8 h-8 items-center justify-center rounded-xs active:bg-surface-4"
      hitSlop={8}
    >
      <View pointerEvents="none">
        <Bell size={18} color={tokens.textPrimary} />
      </View>
      {count > 0 && <CountPill className="top-0 right-0" text={formatBadgeCount(count)} />}
    </Pressable>
  );
}
