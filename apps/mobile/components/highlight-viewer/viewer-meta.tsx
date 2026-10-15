import * as React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import type { HighlightProgress } from "@jits/shared/api/highlights";
import { formatInstagramHandle, instagramProfileUrl } from "@jits/shared/utils";
import { regeneratingBanner } from "@/lib/highlight/highlight-copy";
import { reelMetaLine, type ReelMetaInfo } from "@/lib/highlight/reel-meta";
import { ON_MEDIA } from "@/lib/theme/palette";
import { MonoNumbers } from "@/components/match-detail/highlight/mono-numbers";
import { VIEWER_COPY } from "./viewer-copy";

/**
 * Bottom-left meta of a reel page (spec 8.2): the phase-1 regenerating
 * banner, the mono `OCT 04 · 0:28` line, then the reel subject's Instagram
 * handle as a small tappable `@handle` that opens their Instagram profile
 * (owner decision 2026-10-14; it replaced Open match / View profile). No
 * handle, no line. No title line (spec 020 D).
 */
export function ViewerMeta({ progress, meta }: { progress: HighlightProgress | null; meta: ReelMetaInfo }) {
  const playback = progress?.playback ?? null;
  const handle = meta.instagramHandle;
  const url = instagramProfileUrl(handle);
  const label = formatInstagramHandle(handle);
  const openInstagram = React.useCallback(() => {
    if (!url) return;
    // iOS hands the universal link to the Instagram app when it is installed.
    Linking.openURL(url).catch(() => {});
  }, [url]);
  return (
    <View pointerEvents="box-none" className="gap-1">
      {progress?.phase === "regenerating" ? (
        <View testID="viewer-regenerating" pointerEvents="none" className="rounded-md px-3 py-2 mb-1" style={{ backgroundColor: ON_MEDIA.badge }}>
          <Text className="font-body text-small text-ink">
            <MonoNumbers text={regeneratingBanner(progress.renderTotal)} />
          </Text>
        </View>
      ) : null}
      {playback ? (
        <Text testID="viewer-meta" pointerEvents="none" className="font-mono text-small uppercase" style={{ color: ON_MEDIA.text2, fontVariant: ["tabular-nums"] }}>
          {reelMetaLine(meta.dateIso, playback.durationS)}
        </Text>
      ) : null}
      {url ? (
        <Pressable
          testID="viewer-instagram-handle"
          accessibilityRole="link"
          accessibilityLabel={VIEWER_COPY.instagramLabel(label)}
          accessibilityHint={VIEWER_COPY.instagramHint}
          hitSlop={10}
          onPress={openInstagram}
          className="self-start py-1 active:opacity-70"
        >
          <Text className="font-body text-small" style={{ color: ON_MEDIA.text }}>
            {label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
