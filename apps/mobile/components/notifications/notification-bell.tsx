/**
 * Bell icon with an unread badge. Tapping opens a bottom sheet listing
 * recent notifications (challenges, match results).
 *
 * Mirrors `apps/web/components/domain/notification-bell.tsx`. Consumes the
 * shared `usePendingChallenges` hook for the badge count and
 * `useNotificationHistory` for the full feed.
 */
import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Bell } from "lucide-react-native";
import { usePendingChallenges } from "@jits/shared/hooks/use-pending-challenges";
import { supabase } from "@/lib/supabase/client";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useNotificationHistory } from "@/hooks/use-notification-history";

const NotificationPanel = React.lazy(() =>
  import("./notification-panel").then((m) => ({
    default: m.NotificationPanel,
  })),
);

interface NotificationBellProps {
  athleteId: string;
}

export function NotificationBell({ athleteId }: NotificationBellProps) {
  const [open, setOpen] = React.useState(false);
  const tokens = useThemedTokens();
  const { count } = usePendingChallenges(supabase, athleteId);
  const { items, refresh } = useNotificationHistory(athleteId);

  const handleOpen = React.useCallback(() => {
    setOpen(true);
    void refresh();
  }, [refresh]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        onPress={handleOpen}
        className="relative w-8 h-8 items-center justify-center rounded-xs active:bg-surface-4"
        hitSlop={8}
      >
        <Bell size={18} color={tokens.textPrimary} />
        {count > 0 && (
          <View className="absolute top-0 right-0 h-4 min-w-4 items-center justify-center rounded-full bg-cta px-1">
            <Text className="font-mono-bold text-[9px] text-ink-on-cta">
              {count > 99 ? "99+" : String(count)}
            </Text>
          </View>
        )}
      </Pressable>

      <React.Suspense fallback={null}>
        <NotificationPanel
          open={open}
          onOpenChange={setOpen}
          items={items}
        />
      </React.Suspense>
    </>
  );
}
