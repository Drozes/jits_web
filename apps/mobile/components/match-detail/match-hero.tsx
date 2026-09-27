import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Play } from "lucide-react-native";
import { formatClock } from "@jits/shared/utils";
import { FILM, TABULAR } from "@/lib/film-room/film-palette";
import { OpeningStill, type StillAthlete } from "@/components/film-room/opening-still";
import { FilmScrim } from "@/components/film-room/film-scrim";
import { FilmBackButton } from "@/components/film-room/film-back-button";

export const HERO_HEIGHT = 300;

interface MatchHeroProps {
  posterUrl: string | null;
  posterKey?: string;
  me: StillAthlete;
  opponent: StillAthlete | null;
  fallbackLabel: string;
  ranked: boolean;
  /** Clock shown bottom right (match clock), seconds. */
  clockSeconds: number | null;
  /** Null when nothing can play yet (no video, or still uploading). */
  onPlay: (() => void) | null;
}

/** Opening still with scrims, back, RANKED tag, play, and the clock. */
export function MatchHero({ posterUrl, posterKey, me, opponent, fallbackLabel, ranked, clockSeconds, onPlay }: MatchHeroProps) {
  const insets = useSafeAreaInsets();
  const tagStyle = { height: 24, paddingHorizontal: 8, borderRadius: 2, borderWidth: 1, borderColor: FILM.strong, backgroundColor: FILM.tag, justifyContent: "center" as const };
  return (
    <View testID="match-hero" style={{ height: HERO_HEIGHT + insets.top, overflow: "hidden", backgroundColor: FILM.plate }}>
      <OpeningStill posterUrl={posterUrl} cacheKey={posterKey} me={me} opponent={opponent} fallbackLabel={fallbackLabel} tileSize={88} testID="match-hero-still" />
      <FilmScrim stops={[[0, 0.7], [1, 0]]} style={{ left: 0, right: 0, top: 0, height: 120 + insets.top }} />
      <FilmScrim color={FILM.bg} stops={[[0, 0], [1, 0.95]]} style={{ left: 0, right: 0, bottom: 0, height: 110 }} />

      <View style={{ position: "absolute", left: 4, top: insets.top + 6 }}>
        <FilmBackButton label="Go back" fallback="/(app)/film-room" color={FILM.white} testID="match-back" />
      </View>
      <View style={[tagStyle, { position: "absolute", right: 16, top: insets.top + 16 }]}>
        <Text className="font-mono-medium" style={{ fontSize: 10, letterSpacing: 2.52, color: "rgba(255,255,255,0.85)" }}>
          {ranked ? "RANKED" : "CASUAL"}
        </Text>
      </View>

      {onPlay ? (
        <Pressable
          testID="match-hero-play"
          accessibilityRole="button"
          accessibilityLabel="Play match film"
          onPress={onPlay}
          className="items-center justify-center active:opacity-80"
          style={{ position: "absolute", alignSelf: "center", top: insets.top + HERO_HEIGHT / 2 - 36, width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: FILM.strong, backgroundColor: "rgba(13,15,20,0.72)" }}
        >
          <View style={{ marginLeft: 4 }}>
            <Play size={28} color={FILM.white} fill={FILM.white} />
          </View>
        </Pressable>
      ) : null}

      {posterUrl ? (
        <View style={[tagStyle, { position: "absolute", left: 16, bottom: 16, height: 22 }]}>
          <Text className="font-mono-medium" style={{ fontSize: 10, letterSpacing: 1.68, color: "rgba(255,255,255,0.85)" }}>
            OPENING STILL
          </Text>
        </View>
      ) : null}
      {clockSeconds ? (
        <View style={{ position: "absolute", right: 16, bottom: 16, height: 22, paddingHorizontal: 7, borderRadius: 2, backgroundColor: FILM.badge, justifyContent: "center" }}>
          <Text className="font-mono-bold" style={[{ fontSize: 11, letterSpacing: 0.8, color: FILM.white }, TABULAR]}>
            {formatClock(clockSeconds)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
