import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { VideoView } from "expo-video";
import { Image } from "expo-image";
import { Play } from "lucide-react-native";
import { darkTokens } from "@/lib/tokens";
import { playerLabel } from "@/lib/highlight/highlight-copy";
import { useReelSlot, useSlotFirstFrame } from "@/lib/highlight/use-reel-player-pool";
import type { ReelPoolController } from "@/lib/highlight/reel-player-pool";

export interface ReelPoster {
  url: string | null;
  path: string | null;
}

/** The signed 9:16 cover (`cover`), cached as `highlight-poster:<posterPath>`; `blur` for the legacy pillarbox. */
export function ReelPosterImage({ poster, blur = false }: { poster: ReelPoster; blur?: boolean }) {
  if (!poster.url) return null;
  // Keyed by the render-unique storage path, shared with the match-detail card: a re-signed URL reuses it.
  const source = { uri: poster.url, cacheKey: poster.path ? `highlight-poster:${poster.path}` : undefined };
  return (
    <Image
      testID={blur ? "highlight-poster-blur" : "highlight-poster"}
      source={source}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      blurRadius={blur ? 24 : undefined}
      pointerEvents="none"
    />
  );
}

const CENTER = { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" } as const;

/**
 * The reel edge to edge on the page's pooled player (spec 8.2): `cover` for
 * a 9:16 render, `contain` over its own blurred poster (40% void) for a
 * legacy asset off 9:16. The poster covers the frame until this item has
 * played and a frame is up (swapped instantly). A tap toggles pause / play;
 * paused shows a still 64 pt play glyph. No native controls, fullscreen or PiP.
 */
export function ReelVideo({ pool, index, durationS, poster }: { pool: ReelPoolController; index: number; durationS: number; poster: ReelPoster }) {
  const snap = useReelSlot(pool, index);
  const onFirstFrame = useSlotFirstFrame(pool, snap.slot);
  const contain = snap.fit === "contain";
  return (
    <View testID="highlight-player" style={[StyleSheet.absoluteFill, { backgroundColor: darkTokens.bgPrimary }]}>
      {contain ? <ReelPosterImage poster={poster} blur /> : null}
      {contain ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: darkTokens.bgPrimary, opacity: 0.4 }]} /> : null}
      <Pressable
        testID="highlight-player-toggle"
        accessibilityRole="button"
        accessibilityLabel={playerLabel(durationS)}
        accessibilityHint="Plays or pauses the reel"
        onPress={() => pool.toggle(index)}
        style={{ flex: 1 }}
      >
        {snap.player ? (
          <VideoView
            player={snap.player}
            style={{ flex: 1 }}
            contentFit={snap.fit}
            nativeControls={false}
            fullscreenOptions={{ enable: false }}
            allowsPictureInPicture={false}
            onFirstFrameRender={onFirstFrame}
          />
        ) : null}
        {snap.covered ? <ReelPosterImage poster={poster} /> : null}
        {snap.paused ? (
          <View testID="reel-paused" pointerEvents="none" style={CENTER}>
            <Play size={64} color={darkTokens.textPrimary} style={{ opacity: 0.8 }} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
