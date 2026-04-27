/**
 * Bottom-sheet panel that lists recent notifications (currently pending
 * challenges; chat / match-result events arrive as system push notifications
 * so we don't duplicate them here).
 *
 * Mirrors `apps/web/components/domain/notification-panel.tsx`. Uses the
 * controlled-`open` pattern from web by managing the sheet ref imperatively.
 */
import * as React from "react";
import { Pressable, Text, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { ChevronRight, Zap } from "lucide-react-native";
import { formatRelativeDate } from "@jits/shared/utils";
import type { PendingChallenge } from "@jits/shared/hooks/use-pending-challenges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useThemedTokens } from "@/lib/theme/use-theme";

interface NotificationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  challenges: PendingChallenge[];
}

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

function ChallengeItem({
  challenge,
  onNavigate,
}: {
  challenge: PendingChallenge;
  onNavigate: () => void;
}) {
  return (
    <Pressable
      onPress={onNavigate}
      className="flex-row items-center gap-3 rounded-lg px-3 py-3 active:bg-accent/40"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
        <Zap size={16} color="#f59e0b" />
      </View>
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className="text-sm font-medium text-foreground"
        >
          {challenge.challengerName}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {challenge.matchType === "ranked" ? "Ranked" : "Casual"} challenge
          {" · "}
          {formatRelativeDate(challenge.createdAt)}
        </Text>
      </View>
      <ChevronRight size={16} color="#a1a1aa" />
    </Pressable>
  );
}

export function NotificationPanel({
  open,
  onOpenChange,
  challenges,
}: NotificationPanelProps) {
  const ref = React.useRef<BottomSheet | null>(null);
  const tokens = useThemedTokens();
  const router = useRouter();

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
    // Match list / challenge inbox isn't shipped on mobile yet; the join /
    // session lobby is the closest analog. Surface a simple toast-less no-op
    // for now -- backend already exposes the route from the push payload.
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
          <Text className="text-base font-semibold text-foreground">
            Notifications
          </Text>
        </View>

        <View className="pt-4 pb-2 flex-row items-center gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Challenges
          </Text>
          {challenges.length > 0 && (
            <Badge variant="secondary" className="px-1.5 py-0">
              <Text className="text-[10px] font-semibold text-secondary-foreground">
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
