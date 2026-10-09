import * as React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Wordmark } from "@/components/ui/elo-system";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { HeaderStatusChip } from "./header-status-chip";
import { HeaderElo } from "./header-elo";

/** The header wordmark does not grow with Dynamic Type (AC-H12). */
export const BRAND_WORDMARK_MAX_FONT_SCALE = 1;

/**
 * The right side of every tab-root header (spec 4.1, AC-H1): exactly the
 * status chip, then the bell, 8pt apart. Nothing else goes on the right.
 * The chip is the only part that yields width (its name truncates first).
 * The cluster grows to fill the space beside the wordmark and rating
 * (right-aligned, so it looks the same) so the chip can measure the width it
 * really has.
 */
export function TabHeaderActions({
  onArena = false,
  onSpareWidth,
}: { onArena?: boolean; onSpareWidth?: (px: number) => void } = {}) {
  return (
    <View
      className="flex-row items-center justify-end gap-2"
      style={{ flexGrow: 1, flexShrink: 1 }}
    >
      <HeaderStatusChip onArena={onArena} onSpareWidth={onSpareWidth} />
      <NotificationBell />
    </View>
  );
}

interface BrandHeaderProps {
  /**
   * The tab's name, e.g. "Arena". Never drawn (the tab bar names the screen):
   * it is the tab root's accessibility-only heading.
   */
  title: string;
  /** This header is the Arena tab's (see `HeaderStatusChip`). */
  onArena?: boolean;
}

/**
 * The one header of every tab root (Home, Arena, Matches, Rankings, Profile),
 * jits-1ez5. Left: the "ELO RATED" wordmark, a 1px rule, then the athlete's
 * rating (`HeaderElo`, a button that opens Your numbers), on one baseline.
 * Right: `TabHeaderActions`, the status chip then the bell. No tab title in
 * the bar; the tab keeps an accessibility-only heading. The left side never
 * yields: the wordmark never scales and the rating never truncates; the chip
 * gets the rest of the row and runs its own fit inside it. Pushed screens
 * keep `AppHeader`.
 */
export function BrandHeader({ title, onArena = false }: BrandHeaderProps) {
  const insets = useSafeAreaInsets();
  // What the chip leaves unused, so the post-match delta shows only if it fits.
  const [spareWidth, setSpareWidth] = React.useState<number | null>(null);
  const onSpareWidth = React.useCallback((px: number) => {
    setSpareWidth((prev) => (prev === px ? prev : px));
  }, []);

  return (
    <View
      className="bg-surface-2 border-b border-hairline flex-row items-center justify-between"
      style={{
        paddingTop: insets.top,
        height: 56 + insets.top,
        // The 16pt gutter, or the side safe area when wider (landscape).
        paddingLeft: Math.max(16, insets.left),
        paddingRight: Math.max(16, insets.right),
        gap: 12,
      }}
    >
      <Text
        // Read first on the tab root, never drawn. An element every state of
        // the tab root has (the match-loop harness proves which tab is open
        // by it: `tab-header-title-matches`).
        testID={`tab-header-title-${title.toLowerCase()}`}
        accessibilityRole="header"
        style={VISUALLY_HIDDEN}
      >
        {title}
      </Text>
      <View className="flex-row items-baseline" style={{ flexShrink: 0 }}>
        {/*
          The wordmark is a logo, not body copy: it stays at its drawn size
          under Dynamic Type so it can never squeeze the status chip's count,
          countdown or CONFIRM out of view (AC-H12). Not focusable.
        */}
        <Wordmark
          size="md"
          maxFontSizeMultiplier={BRAND_WORDMARK_MAX_FONT_SCALE}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <HeaderElo spareWidth={spareWidth} />
      </View>
      <TabHeaderActions onArena={onArena} onSpareWidth={onSpareWidth} />
    </View>
  );
}

/**
 * Accessible but not drawn: out of the row's layout, one point, clipped and
 * transparent (not `opacity: 0`, which VoiceOver skips).
 */
const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  color: "transparent",
} as const;
