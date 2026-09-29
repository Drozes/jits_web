/**
 * Bottom-sheet panel that lists recent notifications: challenges received,
 * accepted, declined, match results and ready reels, grouped by date, then a
 * "Missed" section for pending challenges past the freshness window
 * (jits-dq85.8). Rendered once, by `BellBootstrap`.
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
import type { NotificationDateGroup } from "@jits/shared/types/notification";
import { getDateGroup } from "@jits/shared/utils";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { bellItemRoute, type BellItem } from "@/lib/notifications/notification-items";
import { NotificationRow } from "./notification-item";

interface NotificationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BellItem[];
  /**
   * Pending challenges past the freshness window, listed after the feed.
   * Tappable like every challenge row (spec 4.5, AC-H15): they open the
   * Arena, where the athlete can challenge that opponent back.
   */
  missed?: BellItem[];
  /**
   * Opens a tappable row. A row is tappable when `bellItemRoute` gives it a
   * route: reels, challenges fresh or Missed (the Arena) and match results
   * (match detail).
   */
  onItemPress?: (item: BellItem) => void;
}

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

export function NotificationPanel({
  open,
  onOpenChange,
  items,
  missed = [],
  onItemPress,
}: NotificationPanelProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  const tokens = useThemedTokens();

  // Only dismiss a sheet that is actually showing. Calling dismiss() on a gorhom
  // modal that was never presented (this effect's first run, open=false) or
  // that already closed itself (backdrop tap / pan down) leaves it stuck in
  // DISMISSING, so every later present() mounts and immediately tears down:
  // the bell looked dead.
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open) ref.current?.present();
    else if (wasOpen.current) ref.current?.dismiss();
    wasOpen.current = open;
  }, [open]);

  const handleSheetChange = React.useCallback(
    (idx: number) => {
      if (idx === -1) {
        wasOpen.current = false; // the sheet closed itself; don't dismiss again
        onOpenChange(false);
      }
    },
    [onOpenChange],
  );

  const groups = React.useMemo(() => {
    const result: { label: NotificationDateGroup; items: BellItem[] }[] = [];
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

  const renderRow = (item: BellItem) => (
    <View key={item.id} className="px-1">
      <NotificationRow
        item={item}
        onPress={onItemPress && bellItemRoute(item) ? () => onItemPress(item) : undefined}
      />
    </View>
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={["65%"]}
      // Fixed-height list with a BottomSheetScrollView, not a BottomSheetView,
      // so gorhom v5's default dynamic sizing would size it to a sliver.
      enableDynamicSizing={false}
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
        {items.length === 0 && missed.length === 0 ? (
          <View className="items-center py-12">
            <Text className="font-body text-[13px] text-ink-2">
              No notifications yet
            </Text>
          </View>
        ) : (
          <>
            {groups.map((g) => (
              <View key={g.label}>
                <SectionLabel label={g.label} />
                {g.items.map((item) => renderRow(item))}
              </View>
            ))}
            {missed.length > 0 ? (
              <View testID="notification-missed">
                <SectionLabel label="Missed" />
                {missed.map((item) => renderRow(item))}
              </View>
            ) : null}
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <Text
      accessibilityRole="header"
      className="px-4 pb-1 pt-4 font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l"
    >
      {label}
    </Text>
  );
}
