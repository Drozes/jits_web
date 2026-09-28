import * as React from "react";
import { Image } from "expo-image";
import type { HighlightSource } from "@/lib/highlight/use-my-highlight";

const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

/** Cached by the render-unique storage key: re-signs reuse it, matches never share it. */
function posterSource({ posterUrl, posterPath }: HighlightSource) {
  return { uri: posterUrl ?? undefined, cacheKey: posterPath ? `highlight-poster:${posterPath}` : undefined };
}

/** The poster over the player frame until a frame of the current version is on screen. */
export function HighlightPoster({ source }: { source: HighlightSource }) {
  return (
    <Image testID="highlight-poster" source={posterSource(source)} style={FILL} contentFit="contain" pointerEvents="none" />
  );
}
