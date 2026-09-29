import * as React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { HeaderStatusChip } from "./header-status-chip";

/**
 * The right side of every tab-root header (spec 4.1, AC-H1): exactly the
 * status chip, then the bell, 8pt apart. Nothing else goes on the right.
 * The chip is the only part that yields width (its name truncates first).
 * The cluster grows to fill the space beside the title (right-aligned, so it
 * looks the same) so the chip can measure the width it really has.
 */
export function TabHeaderActions({ onArena = false }: { onArena?: boolean } = {}) {
  return (
    <View
      className="flex-row items-center justify-end gap-2"
      style={{ flexGrow: 1, flexShrink: 1 }}
    >
      <HeaderStatusChip onArena={onArena} />
      <NotificationBell />
    </View>
  );
}

interface TabHeaderProps {
  /** Rendered in caps at the LEFT (DM Sans), e.g. "Arena", "Profile". */
  title: string;
  /** This header is the Arena tab's (see `HeaderStatusChip`). */
  onArena?: boolean;
}

/**
 * The titled tab roots' header (Arena, Profile): the tab title at the left,
 * the status chip and the bell at the right. Same 56pt bar and surface as
 * `BrandHeader` (Home, Rankings) and `AppHeader` (pushed screens), so the
 * headers read as one system. Pushed screens keep `AppHeader`'s centred title.
 */
export function TabHeader({ title, onArena = false }: TabHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-surface-2 border-b border-hairline flex-row items-center justify-between"
      style={{
        paddingTop: insets.top,
        height: 56 + insets.top,
        paddingLeft: Math.max(16, insets.left),
        paddingRight: Math.max(16, insets.right),
        gap: 12,
      }}
    >
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        className="font-heading text-[12px] text-ink-2 uppercase tracking-caps-l"
        style={{ flexShrink: 0 }}
      >
        {title}
      </Text>
      <TabHeaderActions onArena={onArena} />
    </View>
  );
}
