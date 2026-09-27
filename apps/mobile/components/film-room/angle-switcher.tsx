import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { FILM } from "@/lib/film-room/film-palette";
import { shortName } from "@/lib/film-room/format";

export interface AngleOption {
  id: string;
  is_mine: boolean;
  uploaded_by_name: string | null;
}

/** "YOUR ANGLE" / "M. PARK'S ANGLE" */
export function angleName(v: AngleOption, opponentName?: string | null): string {
  if (v.is_mine) return "YOUR ANGLE";
  return `${shortName(v.uploaded_by_name ?? opponentName ?? "Opponent").toUpperCase()}'S ANGLE`;
}

interface AngleSwitcherProps {
  angles: AngleOption[];
  activeId: string;
  opponentName?: string | null;
  onSelect: (id: string) => void;
  /** "plate" on the match page, "film" over video in the player. */
  variant?: "plate" | "film";
}

/**
 * Two-segment switch between the athletes' recordings of one match. Renders
 * nothing with fewer than two angles.
 */
export function AngleSwitcher({ angles, activeId, opponentName, onSelect, variant = "plate" }: AngleSwitcherProps) {
  if (angles.length < 2) return null;
  return (
    <View
      testID="angle-switcher"
      accessibilityRole="tablist"
      accessibilityLabel="Camera angle"
      className="flex-row"
      style={{ gap: 8 }}
    >
      {angles.map((a) => {
        const on = a.id === activeId;
        const label = angleName(a, opponentName);
        return (
          <Pressable
            key={a.id}
            testID={`angle-${a.id}`}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(a.id)}
            className="flex-1 items-center justify-center"
            style={{
              height: 44,
              borderRadius: 2,
              borderWidth: 1,
              borderColor: on ? FILM.text : FILM.strong,
              backgroundColor: on ? FILM.text : variant === "film" ? FILM.tag : FILM.glass,
            }}
          >
            <Text numberOfLines={1} className="font-mono-bold" style={{ fontSize: 11, letterSpacing: 1.2, color: on ? FILM.ink : FILM.white }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
