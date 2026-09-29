import * as React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Wordmark } from "@/components/ui/elo-system";
import { TabHeaderActions } from "./tab-header";

/** The header wordmark does not grow with Dynamic Type (AC-H12). */
export const BRAND_WORDMARK_MAX_FONT_SCALE = 1;

/**
 * The wordmark header for the untitled top-level tabs (Home, Rankings).
 *
 * Same 56pt bar, surface and right cluster as `TabHeader` on the titled tabs
 * (Arena, Profile), so the four tab headers read as one system: the right side
 * is exactly the status chip then the notification bell, 8pt apart
 * (`TabHeaderActions`). Nothing else goes on the right.
 */
export function BrandHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-surface-2 border-b border-hairline flex-row items-center justify-between px-4"
      style={{ paddingTop: insets.top, height: 56 + insets.top, gap: 12 }}
    >
      <View style={{ flexShrink: 0 }}>
        {/*
          The wordmark is a logo, not body copy: it stays at its drawn size
          under Dynamic Type so it can never squeeze the status chip's count,
          countdown or CONFIRM out of view (AC-H12).
        */}
        <Wordmark size="md" maxFontSizeMultiplier={BRAND_WORDMARK_MAX_FONT_SCALE} />
      </View>
      <TabHeaderActions />
    </View>
  );
}
