import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { HighlightProgress } from "@jits/shared/api/highlights";
import { regeneratingBanner } from "@/lib/highlight/highlight-copy";
import { reelMetaLine, secondaryHref, type ReelMetaInfo } from "@/lib/highlight/reel-meta";
import { ON_MEDIA } from "@/lib/theme/palette";
import { MonoNumbers } from "@/components/match-detail/highlight/mono-numbers";
import { VIEWER_COPY } from "./viewer-copy";

/**
 * Bottom-left meta of a reel page (spec 8.2): the phase-1 regenerating
 * banner, `vs {opp}` (the subject's name on a reel that is not yours), the
 * mono `OCT 04 · 0:28` line, then Open match (a participant) or View profile
 * (C-V5, anyone else; spec 8.6).
 */
export function ViewerMeta({ progress, meta }: { progress: HighlightProgress | null; meta: ReelMetaInfo }) {
  const router = useRouter();
  const playback = progress?.playback ?? null;
  const href = secondaryHref(meta);
  return (
    <View className="gap-1">
      {progress?.phase === "regenerating" ? (
        <View testID="viewer-regenerating" className="rounded-md px-3 py-2 mb-1" style={{ backgroundColor: ON_MEDIA.badge }}>
          <Text className="font-body text-small text-ink">
            <MonoNumbers text={regeneratingBanner(progress.renderTotal)} />
          </Text>
        </View>
      ) : null}
      {meta.title ? (
        <Text testID="viewer-title" className="font-heading text-title" style={{ color: ON_MEDIA.text }} numberOfLines={1}>
          {meta.title}
        </Text>
      ) : null}
      {playback ? (
        <Text testID="viewer-meta" className="font-mono text-small uppercase" style={{ color: ON_MEDIA.text2, fontVariant: ["tabular-nums"] }}>
          {reelMetaLine(meta.dateIso, playback.durationS)}
        </Text>
      ) : null}
      {href ? (
        <Pressable
          testID={meta.secondary === "open_match" ? "viewer-open-match" : "viewer-view-profile"}
          accessibilityRole="link"
          hitSlop={10}
          onPress={() => router.push(href as never)}
          className="self-start py-2 active:opacity-70"
        >
          <Text className="font-heading text-callout uppercase tracking-caps" style={{ color: ON_MEDIA.text }}>
            {meta.secondary === "open_match" ? VIEWER_COPY.openMatch : VIEWER_COPY.viewProfile}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
