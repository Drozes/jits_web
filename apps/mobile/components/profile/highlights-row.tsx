import * as React from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import type { ProfileHighlight } from "@/lib/highlight/use-my-highlights";
import { highlightHref } from "@/lib/highlight/highlight-href";
import { logHighlightEvent } from "@/lib/highlight/log-highlight-event";
import { MetaTag } from "@/components/ui/elo-system";
import { HighlightTile } from "./highlight-tile";

/** The page's horizontal padding; the row bleeds to the screen edge and re-adds it. */
export const HIGHLIGHTS_ROW_GUTTER = 16;

interface HighlightsRowProps {
  items: ProfileHighlight[];
  /** `highlight_clips_enabled`: discovery follows it (spec 014 section 16.1). */
  clipsEnabled: boolean;
  /** Called on tap, before navigating (clears the NEW tag without a refetch). */
  onOpen?: (highlightId: string) => void;
}

/**
 * "Highlights" on the Profile tab: up to 10 of the athlete's own ready reels,
 * newest first, as a horizontal row of 9:16 tiles. A tile opens the viewer
 * (`?source=profile`). Hidden entirely when there are none or clips are off.
 */
export function HighlightsRow({ items, clipsEnabled, onOpen }: HighlightsRowProps) {
  const router = useRouter();
  if (!clipsEnabled || items.length === 0) return null;
  return (
    <View testID="profile-highlights" className="gap-3">
      <MetaTag>Highlights</MetaTag>
      <ScrollView
        testID="profile-highlights-scroll"
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -HIGHLIGHTS_ROW_GUTTER }}
        contentContainerStyle={{ paddingHorizontal: HIGHLIGHTS_ROW_GUTTER, gap: 8 }}
      >
        {items.map((item) => (
          <HighlightTile
            key={item.highlightId}
            item={item}
            onPress={() => {
              logHighlightEvent(item.highlightId, "profile_row_tapped", { source: "profile" });
              onOpen?.(item.highlightId);
              router.push(highlightHref(item.highlightId, "profile"));
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}
