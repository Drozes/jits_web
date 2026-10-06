import * as React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { usePalette } from "@/lib/theme/palette";
import { AthleteTile } from "./athlete-tile";
import { nearestStep, TABULAR, TRACKING, typeSize, typeStep } from "@/lib/typography";

export interface StillAthlete {
  name: string;
  photoUrl?: string | null;
}

interface OpeningStillProps {
  /** Signed poster (slicer thumbnail); null shows the fallback plate. */
  posterUrl: string | null;
  /**
   * Stable cache key so a re-signed URL does not flash: the poster's storage
   * path (thumbnail key), so a regenerated poster gets a new key.
   */
  cacheKey?: string;
  me: StillAthlete;
  opponent: StillAthlete | null;
  /** Fallback caption, e.g. "STILL ARRIVES AFTER UPLOAD" or "UPLOADING 64%". */
  fallbackLabel: string;
  tileSize: number;
  /** Dim the poster (opacity only) while an upload is in progress. */
  dim?: boolean;
  testID?: string;
  /** Extra content under the fallback caption (the Matches card's recording helper). */
  footer?: React.ReactNode;
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
  footer = null,
}: OpeningStillProps) {
  const p = usePalette();
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
      style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: p.plate }}
      className="items-center justify-center"
    >
      <View className="flex-row items-center" style={{ gap: Math.round(tileSize * 0.2) }}>
        <AthleteTile name={me.name} photoUrl={me.photoUrl} size={tileSize} />
        <Text className="font-display" style={[typeSize(nearestStep(tileSize * 0.3)), { color: p.red }]}>
          VS
        </Text>
        <AthleteTile name={opponent?.name ?? "Opponent"} photoUrl={opponent?.photoUrl} size={tileSize} />
      </View>
      <Text
        numberOfLines={2}
        className="font-mono-medium text-center"
        style={[typeStep("micro"), { marginTop: 12, paddingHorizontal: 12, letterSpacing: TRACKING["caps-l"], color: p.text2 }, TABULAR]}
      >
        {fallbackLabel}
      </Text>
      {footer}
    </View>
  );
}
