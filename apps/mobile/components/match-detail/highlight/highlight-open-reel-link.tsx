import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { DISCOVERY_COPY, highlightHref } from "@/lib/highlight/discovery";

/**
 * Secondary text link from the match-detail ready card to the full-screen
 * viewer (`source=match_detail`). A text link, never a second red CTA.
 */
export function HighlightOpenReelLink({ highlightId }: { highlightId: string }) {
  const router = useRouter();
  return (
    <Pressable
      testID="highlight-open-reel"
      accessibilityRole="button"
      onPress={() => router.push(highlightHref(highlightId, "match_detail") as never)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className="items-center py-1 active:opacity-70"
    >
      <Text className="font-heading text-[12px] text-ink-2 uppercase tracking-caps">
        {DISCOVERY_COPY.openReel}
      </Text>
    </Pressable>
  );
}
