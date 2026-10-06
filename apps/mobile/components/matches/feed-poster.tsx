import * as React from "react";
import { View } from "react-native";
import { Image, type ImageLoadEventData } from "expo-image";
import { ON_MEDIA } from "@/lib/theme/palette";
import { cropFor, PILLARBOX_BLUR_RADIUS, PILLARBOX_SCRIM_OPACITY } from "@/lib/film-room/card-media";

const FILL = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 } as const;

interface FeedPosterProps {
  url: string;
  /** The poster's storage key, so a re-signed URL does not flash and a new poster gets a new key. */
  cacheKey?: string | null;
  /** Server-known size; null reads the intrinsic size on load. */
  width: number | null;
  height: number | null;
  /** Dimmed while this phone uploads the match's film. */
  dim?: boolean;
}

/**
 * A poster in the card's 16:9 media area, by the crop rule (specs/matches-tab
 * 6.3): landscape or square fills with `cover`; portrait phone footage is a
 * pillarbox (the whole frame `contain`ed over a blurred `cover` copy under a
 * 40% void scrim). With no server size it draws `cover` until expo-image's
 * `onLoad` reports the intrinsic size, then applies the rule.
 */
export function FeedPoster({ url, cacheKey, width, height, dim = false }: FeedPosterProps) {
  const [loaded, setLoaded] = React.useState<{ w: number; h: number } | null>(null);
  const server = cropFor(width, height);
  const rule = server.known ? server : cropFor(loaded?.w, loaded?.h);
  const source = cacheKey ? { uri: url, cacheKey: `film-still-${cacheKey}` } : { uri: url };
  const onLoad = server.known
    ? undefined
    : (e: ImageLoadEventData) => setLoaded({ w: e.source.width, h: e.source.height });
  const opacity = dim ? 0.38 : 1;

  if (rule.fit === "pillarbox") {
    return (
      <View testID="feed-poster-pillarbox" style={[FILL, { opacity }]}>
        <Image
          testID="feed-poster-blur"
          accessibilityIgnoresInvertColors
          source={source}
          recyclingKey={cacheKey ?? undefined}
          contentFit="cover"
          blurRadius={PILLARBOX_BLUR_RADIUS}
          style={FILL}
        />
        <View style={[FILL, { backgroundColor: ON_MEDIA.ground, opacity: PILLARBOX_SCRIM_OPACITY }]} />
        <Image
          testID="feed-poster"
          accessibilityIgnoresInvertColors
          source={source}
          recyclingKey={cacheKey ?? undefined}
          contentFit="contain"
          style={FILL}
        />
      </View>
    );
  }
  return (
    <Image
      testID="feed-poster"
      accessibilityIgnoresInvertColors
      source={source}
      recyclingKey={cacheKey ?? undefined}
      contentFit="cover"
      onLoad={onLoad}
      style={[FILL, { opacity }]}
    />
  );
}
