/**
 * Bottom-sheet panel that lists recent notifications (currently pending
 * challenges; chat / match-result events arrive as system push notifications
 * so we don't duplicate them here).
 *
 * Mirrors `apps/web/components/domain/notification-panel.tsx`. Uses the
 * controlled-`open` pattern from web by managing the sheet ref imperatively.
 */
import * as React from "react";
import { Text, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import type { PendingChallenge } from "@jits/shared/hooks/use-pending-challenges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { ChallengeItem } from "./challenge-item";

interface NotificationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  challenges: PendingChallenge[];
}

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

export function NotificationPanel({
  open,
  onOpenChange,
  challenges,
}: NotificationPanelProps) {
  const ref = React.useRef<BottomSheet | null>(null);
  const tokens = useThemedTokens();

  React.useEffect(() => {
    if (open) ref.current?.expand();
    else ref.current?.close();
  }, [open]);

  const handleClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSheetChange = React.useCallback(
    (idx: number) => {
      if (idx === -1) onOpenChange(false);
    },
    [onOpenChange],
  );

  const navigateToChallenges = React.useCallback(() => {
    handleClose();
  }, [handleClose]);

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={["55%"]}
      enablePanDownToClose
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: tokens.card }}
      handleIndicatorStyle={{ backgroundColor: tokens.mutedForeground }}
    >
      <BottomSheetView className="flex-1 px-4 pb-6">
        <View className="border-b border-border pb-3">
          <Text className="text-base font-heading text-foreground">
            Notifications
          </Text>
        </View>

        <View className="pt-4 pb-2 flex-row items-center gap-2">
          <Text className="text-xs font-heading uppercase tracking-wider text-muted-foreground">
            Challenges
          </Text>
          {challenges.length > 0 && (
            <Badge variant="secondary" className="px-1.5 py-0">
              <Text className="text-[10px] font-heading text-secondary-foreground">
                {challenges.length}
              </Text>
            </Badge>
          )}
        </View>

        {challenges.length > 0 ? (
          <View className="gap-1">
            {challenges.map((c) => (
              <ChallengeItem
                key={c.id}
                challenge={c}
                onNavigate={navigateToChallenges}
              />
            ))}
          </View>
        ) : (
          <View className="py-6 items-center">
            <Text className="text-sm text-muted-foreground">
              No pending challenges
            </Text>
          </View>
        )}

        {challenges.length > 0 && (
          <View className="border-t border-border mt-3 pt-3">
            <Button variant="ghost" size="sm" onPress={navigateToChallenges}>
              View all challenges
            </Button>
          </View>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}
