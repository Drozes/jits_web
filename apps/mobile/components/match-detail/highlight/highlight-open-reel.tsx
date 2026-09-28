import * as React from "react";
import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { markHighlightSeen } from "@jits/shared/api/highlight-share";
import { highlightHref } from "@/lib/highlight/highlight-href";

export const OPEN_REEL_LABEL = "Open reel";

/**
 * The ready card's secondary text link into the full-screen viewer
 * (`?source=match_detail`). Watching the reel here counts as seeing it, so the
 * live version is marked seen once per version while the card shows it.
 */
export function HighlightOpenReel({ highlightId, version }: { highlightId: string; version: number }) {
  const router = useRouter();
  const markedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = `${highlightId}:${version}`;
    if (markedRef.current === key) return;
    markedRef.current = key;
    void markHighlightSeen(supabase, highlightId, version);
  }, [highlightId, version]);

  return (
    <Pressable
      testID="highlight-open-reel"
      accessibilityRole="link"
      accessibilityLabel={OPEN_REEL_LABEL}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      onPress={() => router.push(highlightHref(highlightId, "match_detail"))}
      className="self-start active:opacity-70"
    >
      <Text className="font-heading text-[12px] uppercase tracking-caps text-ink-2 underline">{OPEN_REEL_LABEL}</Text>
    </Pressable>
  );
}
