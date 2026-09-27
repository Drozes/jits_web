import * as React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { getInitials } from "@jits/shared/utils";
import { athletePhotoSource } from "@/lib/athlete-photo";
import { FILM } from "@/lib/film-room/film-palette";

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
  const src = athletePhotoSource(photoUrl);
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: 2,
        borderWidth: 1,
        borderColor: FILM.strong,
        backgroundColor: FILM.panel,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {src ? (
        <Image source={{ uri: src }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      ) : (
        <Text className="font-heading text-ink" style={{ fontSize: Math.round(size * 0.33), letterSpacing: 1 }}>
          {getInitials(name || "?")}
        </Text>
      )}
    </View>
  );
}
