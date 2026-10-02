import * as React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { getInitials } from "@jits/shared/utils";
import { athletePhotoSource } from "@/lib/athlete-photo";
import { usePalette } from "@/lib/theme/palette";
import { TRACKING, nearestStep, typeSize } from "@/lib/typography";

interface AthleteTileProps {
  name: string;
  photoUrl?: string | null;
  size: number;
}

/**
 * A square athlete plate for the opening-still fallback: photo when there is
 * one, else initials in DM Sans on the panel color, 1 px strong border.
 */
export function AthleteTile({ name, photoUrl, size }: AthleteTileProps) {
  const p = usePalette();
  const src = athletePhotoSource(photoUrl);
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: 2,
        borderWidth: 1,
        borderColor: p.strong,
        backgroundColor: p.panel,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {src ? (
        <Image source={{ uri: src }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      ) : (
        <Text className="font-heading text-ink" style={[typeSize(nearestStep(size * 0.33)), { letterSpacing: TRACKING.caps }]}>
          {getInitials(name || "?")}
        </Text>
      )}
    </View>
  );
}
