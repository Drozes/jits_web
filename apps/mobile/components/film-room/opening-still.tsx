import * as React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { FILM } from "@/lib/film-room/film-palette";
import { AthleteTile } from "./athlete-tile";

export interface StillAthlete {
  name: string;
  photoUrl?: string | null;
}

interface OpeningStillProps {
  /** Signed poster (slicer thumbnail); null shows the fallback plate. */
  posterUrl: string | null;
  /** Stable cache key so a re-signed URL does not flash (the video id). */
  cacheKey?: string;
  me: StillAthlete;
  opponent: StillAthlete | null;
  /** Fallback caption, e.g. "STILL ARRIVES AFTER UPLOAD" or "UPLOADING 64%". */
  fallbackLabel: string;
  tileSize: number;
  /** Dim + desaturate the poster (an upload in progress over an older still). */
  dim?: boolean;
  testID?: string;
}

/**
 * The hero image of a match, filling its (sized, overflow-hidden) parent:
 * the slicer's opening still when it exists, else both athletes side by side
 * on the plate with a mono caption saying why there is no still yet.
 */
export function OpeningStill({
  posterUrl,
  cacheKey,
  me,
  opponent,
  fallbackLabel,
  tileSize,
  dim = false,
  testID = "opening-still",
}: OpeningStillProps) {
  if (posterUrl) {
    return (
      <Image
        testID={testID}
        accessibilityIgnoresInvertColors
        source={cacheKey ? { uri: posterUrl, cacheKey: `film-still-${cacheKey}` } : { uri: posterUrl }}
        recyclingKey={cacheKey}
        contentFit="cover"
        style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, opacity: dim ? 0.38 : 1 }}
      />
    );
  }
  return (
    <View
      testID={`${testID}-fallback`}
      style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: FILM.plate }}
      className="items-center justify-center"
    >
      <View className="flex-row items-center" style={{ gap: Math.round(tileSize * 0.2) }}>
        <AthleteTile name={me.name} photoUrl={me.photoUrl} size={tileSize} />
        <Text className="font-display" style={{ color: FILM.redText, fontSize: Math.round(tileSize * 0.3) }}>
          VS
        </Text>
        <AthleteTile name={opponent?.name ?? "Opponent"} photoUrl={opponent?.photoUrl} size={tileSize} />
      </View>
      <Text
        numberOfLines={2}
        className="font-mono-medium text-center"
        style={{ marginTop: 12, paddingHorizontal: 12, fontSize: 9, letterSpacing: 2, color: FILM.text2 }}
      >
        {fallbackLabel}
      </Text>
    </View>
  );
}
