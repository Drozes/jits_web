import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { TRACKING, typeStep } from "@/lib/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Play } from "lucide-react-native";
import { formatClock } from "@jits/shared/utils";
import { ON_MEDIA, TABULAR, usePalette } from "@/lib/theme/palette";
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
  /** Clock shown bottom right (match clock), seconds. */
  clockSeconds: number | null;
  /** Null when nothing can play yet (no video, or still uploading). */
  onPlay: (() => void) | null;
  /** Shown where the play button goes while the film cannot play yet. */
  playHint?: string | null;
}

/**
 * Opening still with scrims, back, play, and the clock (no match-kind tag:
 * every match is the same kind). The
 * chrome sits on the photo's scrims (ON_MEDIA); the bottom scrim fades into
 * the themed page.
 */
export function MatchHero({ posterUrl, posterKey, me, opponent, fallbackLabel, clockSeconds, onPlay, playHint = null }: MatchHeroProps) {
  const insets = useSafeAreaInsets();
  const p = usePalette();
  const tagStyle = { height: 24, paddingHorizontal: 8, borderRadius: 2, borderWidth: 1, borderColor: ON_MEDIA.strong, backgroundColor: ON_MEDIA.tag, justifyContent: "center" as const };
  return (
    <View testID="match-hero" style={{ height: HERO_HEIGHT + insets.top, overflow: "hidden", backgroundColor: p.plate }}>
      <OpeningStill posterUrl={posterUrl} cacheKey={posterKey} me={me} opponent={opponent} fallbackLabel={fallbackLabel} tileSize={88} testID="match-hero-still" />
      <FilmScrim stops={[[0, 0.7], [1, 0]]} style={{ left: 0, right: 0, top: 0, height: 120 + insets.top }} />
      <FilmScrim color={p.bg} stops={[[0, 0], [1, 0.95]]} style={{ left: 0, right: 0, bottom: 0, height: 110 }} />

      <View style={{ position: "absolute", left: 4, top: insets.top + 6 }}>
        <FilmBackButton label="Go back" fallback="/(app)/film-room" color={ON_MEDIA.white} testID="match-back" />
      </View>

      {onPlay ? (
        <Pressable
          testID="match-hero-play"
          accessibilityRole="button"
          accessibilityLabel="Play match film"
          onPress={onPlay}
          className="items-center justify-center active:opacity-80"
          style={{ position: "absolute", alignSelf: "center", top: insets.top + HERO_HEIGHT / 2 - 36, width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: ON_MEDIA.strong, backgroundColor: "rgba(13,15,20,0.72)" }}
        >
          <View style={{ marginLeft: 4 }}>
            <Play size={28} color={ON_MEDIA.white} fill={ON_MEDIA.white} />
          </View>
        </Pressable>
      ) : posterUrl && playHint ? (
        // A still over a film that cannot play yet: say why instead of a
        // silently missing play button (jits-n2im.4 item 5).
        <View
          testID="match-hero-play-hint"
          style={[tagStyle, { position: "absolute", alignSelf: "center", top: insets.top + HERO_HEIGHT / 2 - 12 }]}
        >
          <Text className="font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: ON_MEDIA.tagText }, TABULAR]}>
            {playHint}
          </Text>
        </View>
      ) : null}

      {posterUrl ? (
        <View style={[tagStyle, { position: "absolute", left: 16, bottom: 16, height: 22 }]}>
          <Text className="font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: ON_MEDIA.tagText }, TABULAR]}>
            OPENING STILL
          </Text>
        </View>
      ) : null}
      {clockSeconds ? (
        <View style={{ position: "absolute", right: 16, bottom: 16, height: 22, paddingHorizontal: 7, borderRadius: 2, backgroundColor: ON_MEDIA.badge, justifyContent: "center" }}>
          <Text className="font-mono-bold" style={[typeStep("caption"), { letterSpacing: TRACKING.loose, color: ON_MEDIA.white }, TABULAR]}>
            {formatClock(clockSeconds)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
