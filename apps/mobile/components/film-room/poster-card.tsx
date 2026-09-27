import * as React from "react";
import { Pressable, Text, View } from "react-native";
import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import { FILM, TABULAR } from "@/lib/film-room/film-palette";
import { cardLine, outcomeLetter, outcomeWord, shortDate, shortName } from "@/lib/film-room/format";
import { statusBadgeLabel, uploadingLabel, type CardStatus } from "@/lib/film-room/card-status";
import { OpeningStill, type StillAthlete } from "./opening-still";
import { FilmScrim } from "./film-scrim";
import { FilmBadge, toneFor } from "./status-badge";

const OUTCOME_COLOR = { W: FILM.win, L: FILM.redText, D: FILM.text } as const;
const TAG_BORDER = { W: FILM.win, L: "rgba(240,85,107,0.7)", D: FILM.strong } as const;

interface PosterCardProps {
  item: MatchLibraryItem;
  status: CardStatus;
  viewer: StillAthlete;
  onPress: () => void;
  /** Profile preview tiles keep the harness id `past-video-row-<matchId>`. */
  testID?: string;
  /** Overrides the composed label (the Profile preview keeps the harness copy). */
  accessibilityLabel?: string;
}

function fallbackLabel(item: MatchLibraryItem, status: CardStatus): string {
  if (status.kind === "uploading") return uploadingLabel(status.progress);
  if (item.videos.length === 0) return "NO FILM RECORDED";
  if (status.kind === "failed") return "FILM FAILED TO PROCESS";
  return "STILL ARRIVES AFTER UPLOAD";
}

/**
 * One match in the Film Room grid (3:4): opening still or avatar plate,
 * bottom scrim, W/L/D tag, opponent, rating change and finish time, date,
 * the status badge top right and "2 ANGLES" top left.
 */
export function PosterCard({ item, status, viewer, onPress, testID, accessibilityLabel }: PosterCardProps) {
  const letter = outcomeLetter(item.outcome);
  const poster = item.videos.find((v) => v.poster_url) ?? null;
  const uploading = status.kind === "uploading";
  const badge = statusBadgeLabel(status);
  const opp = shortName(item.opponent?.display_name);
  const line = cardLine(item);
  const date = shortDate(item.completed_at);
  const progress = uploading && status.progress != null ? Math.min(1, Math.max(0, status.progress)) : null;

  return (
    <Pressable
      testID={testID ?? `film-card-${item.match_id}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [`${outcomeWord(item.outcome)} vs ${opp}`, date, line, badge ?? (uploading ? uploadingLabel(progress) : null)]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      className="flex-1 overflow-hidden active:opacity-80"
      style={{ aspectRatio: 3 / 4, borderRadius: 3, borderWidth: 1, borderColor: FILM.hairline, backgroundColor: FILM.plate }}
    >
      <OpeningStill
        posterUrl={poster?.poster_url ?? null}
        cacheKey={poster?.video_id}
        me={viewer}
        opponent={item.opponent ? { name: item.opponent.display_name, photoUrl: item.opponent.profile_photo_url } : null}
        fallbackLabel={fallbackLabel(item, status)}
        tileSize={40}
        dim={uploading}
      />
      <FilmScrim stops={[[0, 0], [1, 0.88]]} style={{ left: 0, right: 0, bottom: 0, height: "58%" }} />

      {item.videos.length > 1 ? (
        <FilmBadge testID="film-card-angles" label={`${item.videos.length} ANGLES`} tone="outline" style={{ position: "absolute", top: 8, left: 8 }} />
      ) : null}
      {badge ? (
        <FilmBadge testID="film-card-badge" label={badge} tone={toneFor(status)} style={{ position: "absolute", top: 8, right: 8 }} />
      ) : null}
      {uploading && poster ? (
        <View testID="film-card-uploading" style={{ position: "absolute", left: 10, right: 10, top: "38%", alignItems: "center", gap: 6 }}>
          <Text className="font-mono-bold" style={{ fontSize: 10, letterSpacing: 2.2, color: FILM.amber }}>
            {uploadingLabel(progress)}
          </Text>
        </View>
      ) : null}
      {uploading && progress != null ? (
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, backgroundColor: FILM.track }}>
          <View testID="film-card-progress" style={{ width: `${Math.round(progress * 100)}%`, height: 3, backgroundColor: FILM.amber }} />
        </View>
      ) : null}

      <View style={{ position: "absolute", left: 10, right: 10, bottom: 10, gap: 6 }}>
        <View className="flex-row items-center" style={{ gap: 7, minWidth: 0 }}>
          {letter ? (
            <View
              style={{ height: 20, minWidth: 20, paddingHorizontal: 5, borderRadius: 2, borderWidth: 1, borderColor: TAG_BORDER[letter], backgroundColor: FILM.tag, alignItems: "center", justifyContent: "center" }}
            >
              <Text className="font-mono-bold" style={{ fontSize: 11, color: OUTCOME_COLOR[letter] }}>
                {letter}
              </Text>
            </View>
          ) : null}
          <Text numberOfLines={1} className="flex-1 font-heading uppercase" style={{ fontSize: 13, letterSpacing: 0.52, color: FILM.white }}>
            {opp}
          </Text>
        </View>
        <View className="flex-row items-center justify-between" style={{ gap: 6 }}>
          <Text numberOfLines={1} className="font-mono-bold" style={[{ fontSize: 11, letterSpacing: 0.4, color: letter ? OUTCOME_COLOR[letter] : FILM.text }, TABULAR]}>
            {line}
          </Text>
          <Text className="font-mono-medium" style={[{ fontSize: 10, letterSpacing: 1.2, color: FILM.text2 }, TABULAR]}>
            {date}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
