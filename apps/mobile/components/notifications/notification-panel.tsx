/**
 * Bottom-sheet panel that lists recent notifications: challenges received,
 * accepted, declined, and match results. Items are grouped by date.
 *
 * Mirrors `apps/web/app/(app)/notifications/notification-list.tsx`.
 */
import * as React from "react";
import { Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import type { NotificationItem, NotificationDateGroup } from "@jits/shared/types/notification";
import { getDateGroup } from "@jits/shared/utils";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { NotificationRow } from "./notification-item";

interface NotificationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NotificationItem[];
}

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

export function NotificationPanel({
  open,
  onOpenChange,
  items,
}: NotificationPanelProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  const tokens = useThemedTokens();

  React.useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);

  const handleSheetChange = React.useCallback(
    (idx: number) => {
      if (idx === -1) onOpenChange(false);
    },
    [onOpenChange],
  );

  const groups = React.useMemo(() => {
    const result: { label: NotificationDateGroup; items: NotificationItem[] }[] = [];
    let current: (typeof result)[number] | null = null;
    for (const item of items) {
      const label = getDateGroup(item.createdAt);
      if (!current || current.label !== label) {
        current = { label, items: [] };
        result.push(current);
      }
      current.items.push(item);
    }
    return result;
  }, [items]);

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={["65%"]}
      enablePanDownToClose
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: tokens.bgSecondary }}
      handleIndicatorStyle={{ backgroundColor: tokens.textTertiary }}
    >
      <View className="border-b border-hairline px-4 pb-3">
        <Text className="font-heading text-[14px] text-ink uppercase tracking-caps-l">
          Notifications
        </Text>
      </View>

      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {items.length === 0 ? (
          <View className="items-center py-12">
            <Text className="font-body text-[13px] text-ink-2">
              No notifications yet
            </Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.label}>
              <Text className="px-4 pb-1 pt-4 font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
                {g.label}
              </Text>
              {g.items.map((item) => (
                <View key={item.id} className="px-1">
                  <NotificationRow item={item} />
                </View>
              ))}
            </View>
          ))
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
