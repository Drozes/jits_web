import * as React from "react";
import { StyleSheet } from "react-native";
import { Image } from "expo-image";

export interface ReelPoster {
  url: string | null;
  path: string | null;
}

/** The signed 9:16 cover (`cover`), cached as `highlight-poster:<posterPath>`; `blur` for the legacy pillarbox. */
export function ReelPosterImage({ poster, blur = false, onError }: { poster: ReelPoster; blur?: boolean; onError?: () => void }) {
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
      onError={onError}
      pointerEvents="none"
    />
  );
}
