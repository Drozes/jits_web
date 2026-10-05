import * as React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FilmBackButton } from "@/components/film-room/film-back-button";
import { FilmStatusPlate } from "@/components/video-status/film-status-plate";
import type { MatchVideoStatus } from "@jits/shared/api/match-video-status";
import type { FilmStatusView } from "@/lib/video/film-status";
import { usePalette } from "@/lib/theme/palette";
import { TRACKING, typeStep } from "@/lib/typography";

/** "M. Reyes vs D. Okafor" from the competitors' angle rows (the timekeeper has no participant row). */
export function timekeeperMatchTitle(status: MatchVideoStatus): string {
  const names = status.angles.filter((a) => a.role === "competitor").map((a) => a.recorder_name_short).filter(Boolean);
  return names.length === 2 ? `${names[0]} vs ${names[1]}` : "Match film";
}

/**
 * The match page as the TIMEKEEPER sees it (record only, deck 4b / 11): the
 * timekeeper has no participant row, so `get_match_details` refuses them;
 * `get_match_video_status` admits them and is their surface (contract
 * 11.1.3). Film, never highlights: just the Film status plate, whose ready
 * rows open the player. The timekeeper's push (`timekeeper_film_ready`)
 * lands here.
 */
export function TimekeeperFilm({ matchId, status, view, onWatch }: { matchId: string; status: MatchVideoStatus; view: FilmStatusView; onWatch: (videoId: string) => void }) {
  const insets = useSafeAreaInsets();
  const p = usePalette();
  return (
    <ScrollView testID="timekeeper-film" contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 32 }}>
      <View style={{ paddingHorizontal: 4, height: 48, justifyContent: "center" }}>
        <FilmBackButton label="Go back" fallback="/" color={p.text} />
      </View>
      <View style={{ paddingHorizontal: 16, gap: 16 }}>
        <Text accessibilityRole="header" className="font-heading uppercase" style={[typeStep("callout"), { letterSpacing: TRACKING.caps, color: p.text }]}>
          {timekeeperMatchTitle(status)}
        </Text>
        <FilmStatusPlate matchId={matchId} view={view} onWatch={onWatch} />
      </View>
    </ScrollView>
  );
}
