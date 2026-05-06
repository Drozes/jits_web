/**
 * Bell icon with an unread badge. Tapping opens a bottom sheet listing
 * pending challenges (and surfaces an entry point for future notification
 * categories).
 *
 * Mirrors `apps/web/components/domain/notification-bell.tsx`. Consumes the
 * shared `usePendingChallenges` hook ported in Phase 2.
 */
import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Bell } from "lucide-react-native";
import { usePendingChallenges } from "@jits/shared/hooks/use-pending-challenges";
import { supabase } from "@/lib/supabase/client";
import { useThemedTokens } from "@/lib/theme/use-theme";
const NotificationPanel = React.lazy(() =>
  import("./notification-panel").then((m) => ({ default: m.NotificationPanel })),
);

interface NotificationBellProps {
  athleteId: string;
}

export function NotificationBell({ athleteId }: NotificationBellProps) {
  const [open, setOpen] = React.useState(false);
  const tokens = useThemedTokens();
  const { count, challenges } = usePendingChallenges(supabase, athleteId);

  return (
    <>
      <Pressable
        accessibilityLabel="Notifications"
        onPress={() => setOpen(true)}
        className="relative h-10 w-10 items-center justify-center rounded-full active:bg-accent/40"
        hitSlop={8}
      >
        <Bell size={20} color={tokens.foreground} />
        {count > 0 && (
          <View className="absolute top-1 right-1 h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1">
            <Text className="text-[10px] font-mono text-primary-foreground">
              {count > 99 ? "99+" : String(count)}
            </Text>
          </View>
        )}
      </Pressable>

      <React.Suspense fallback={null}>
        <NotificationPanel
          open={open}
          onOpenChange={setOpen}
          challenges={challenges}
        />
      </React.Suspense>
    </>
  );
}
