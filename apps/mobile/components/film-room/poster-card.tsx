import * as React from "react";
import { Pressable, Text, View } from "react-native";
import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import { ON_MEDIA, TABULAR, usePalette, type Palette } from "@/lib/theme/palette";
import { cardLine, outcomeLetter, outcomeWord, shortDate, shortName } from "@/lib/film-room/format";
import { statusBadgeLabel, uploadingLabel, type CardStatus } from "@/lib/film-room/card-status";
import { OpeningStill, type StillAthlete } from "./opening-still";
import { FilmScrim } from "./film-scrim";
import { FilmBadge, toneFor } from "./status-badge";

type Letter = "W" | "L" | "D";
interface CardInk {
  name: string;
  text: string;
  text2: string;
  outcome: Record<Letter, string>;
  tagBorder: Record<Letter, string>;
  tagFill: string | undefined;
}

/** Over a photo: the bottom lines sit on the black scrim, on-film colors in both themes. */
const ON_PHOTO: CardInk = {
  name: ON_MEDIA.white,
  text: ON_MEDIA.text,
  text2: ON_MEDIA.text2,
  outcome: { W: ON_MEDIA.win, L: ON_MEDIA.red, D: ON_MEDIA.text },
  tagBorder: { W: ON_MEDIA.win, L: ON_MEDIA.redRule, D: ON_MEDIA.strong },
  tagFill: ON_MEDIA.tag,
};

/** No still: no scrim, the bottom lines sit on the themed plate. */
function onPlate(p: Palette): CardInk {
  return {
    name: p.text,
    text: p.text,
    text2: p.text2,
    outcome: { W: p.win, L: p.red, D: p.text },
    tagBorder: { W: p.win, L: p.red, D: p.strong },
    tagFill: undefined,
  };
}

interface PosterCardProps {
  item: MatchLibraryItem;
  status: CardStatus;
  viewer: StillAthlete;
  onPress: () => void;
  /** Profile preview tiles keep the harness id `past-video-row-<matchId>`. */
  testID?: string;
  /** Overrides the composed label (the Profile preview keeps the harness copy). */
  accessibilityLabel?: string;
  /** "compact" (the 120 pt Profile preview) uses short badge labels. */
  variant?: "grid" | "compact";
}

/** Short badge copy for the narrow Profile preview tiles. */
export function compactBadgeLabel(status: CardStatus): string | null {
  switch (status.kind) {
    case "failed":
      return "FAILED";
    case "analyzing":
      return status.total ? `${status.done ?? 0}/${status.total}` : "ANALYZING";
    case "new":
      return "NEW";
    case "ready":
      return "READY";
    default:
      return null;
  }
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
 * and a top-right badge column (status, DISPUTED, angles) stacked so no two
 * badges share a row even on a narrow card.
 */
export const PosterCard = React.memo(function PosterCard({ item, status, viewer, onPress, testID, accessibilityLabel, variant = "grid" }: PosterCardProps) {
  const p = usePalette();
  const compact = variant === "compact";
  const letter = outcomeLetter(item.outcome);
  const poster = item.videos.find((v) => v.poster_url) ?? null;
  const uploading = status.kind === "uploading";
  const badge = compact ? compactBadgeLabel(status) : statusBadgeLabel(status);
  const disputed = item.status === "disputed";
  const angles = item.videos.length > 1 ? (compact ? `${item.videos.length}×` : `${item.videos.length} ANGLES`) : null;
  const opp = shortName(item.opponent?.display_name);
  const line = cardLine(item);
  const date = shortDate(item.completed_at);
  const progress = uploading && status.progress != null ? Math.min(1, Math.max(0, status.progress)) : null;
  const c = poster ? ON_PHOTO : onPlate(p);

  return (
    <Pressable
      testID={testID ?? `film-card-${item.match_id}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [`${outcomeWord(item.outcome)} vs ${opp}`, date, line, statusBadgeLabel(status) ?? (uploading ? uploadingLabel(progress) : null), disputed ? "disputed" : null]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      className="flex-1 overflow-hidden active:opacity-80"
      style={{ aspectRatio: 3 / 4, borderRadius: 3, borderWidth: 1, borderColor: p.hairline, backgroundColor: p.plate }}
    >
      <OpeningStill
        posterUrl={poster?.poster_url ?? null}
        // The storage path, not the video id: a new poster gets a new key.
        cacheKey={poster?.thumbnail_key ?? undefined}
        me={viewer}
        opponent={item.opponent ? { name: item.opponent.display_name, photoUrl: item.opponent.profile_photo_url } : null}
        fallbackLabel={fallbackLabel(item, status)}
        tileSize={40}
        dim={uploading}
      />
      {poster ? <FilmScrim testID="film-card-scrim" stops={[[0, 0], [1, 0.88]]} style={{ left: 0, right: 0, bottom: 0, height: "58%" }} /> : null}

      {badge || disputed || angles ? (
        <View testID="film-card-badges" style={{ position: "absolute", top: 8, right: 8, left: 8, alignItems: "flex-end", gap: 4 }}>
          {badge ? <FilmBadge testID="film-card-badge" label={badge} tone={toneFor(status)} /> : null}
          {disputed ? <FilmBadge testID="film-card-disputed" label="DISPUTED" tone="amber" /> : null}
          {angles ? <FilmBadge testID="film-card-angles" label={angles} tone="outline" /> : null}
        </View>
      ) : null}
      {uploading && poster ? (
        // On the dimmed photo: the amber badge carries its own dark backing.
        <View testID="film-card-uploading" style={{ position: "absolute", left: 10, right: 10, top: "38%", alignItems: "center", gap: 6 }}>
          <FilmBadge label={uploadingLabel(progress)} tone="amber" />
        </View>
      ) : null}
      {uploading && progress != null ? (
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, backgroundColor: poster ? ON_MEDIA.track : p.track }}>
          <View testID="film-card-progress" style={{ width: `${Math.round(progress * 100)}%`, height: 3, backgroundColor: poster ? ON_MEDIA.amber : p.amber }} />
        </View>
      ) : null}

      <View style={{ position: "absolute", left: 10, right: 10, bottom: 10, gap: 6 }}>
        <View className="flex-row items-center" style={{ gap: 7, minWidth: 0 }}>
          {letter ? (
            <View
              style={{ height: 20, minWidth: 20, paddingHorizontal: 5, borderRadius: 2, borderWidth: 1, borderColor: c.tagBorder[letter], backgroundColor: c.tagFill, alignItems: "center", justifyContent: "center" }}
            >
              <Text className="font-mono-bold" style={{ fontSize: 11, color: c.outcome[letter] }}>
                {letter}
              </Text>
            </View>
          ) : null}
          <Text numberOfLines={1} className="flex-1 font-heading uppercase" style={{ fontSize: 13, letterSpacing: 0.52, color: c.name }}>
            {opp}
          </Text>
        </View>
        <View className="flex-row items-center justify-between" style={{ gap: 6 }}>
          <Text numberOfLines={1} className="font-mono-bold" style={[{ fontSize: 11, letterSpacing: 0.4, color: letter ? c.outcome[letter] : c.text }, TABULAR]}>
            {line}
          </Text>
          <Text className="font-mono-medium" style={[{ fontSize: 10, letterSpacing: 1.2, color: c.text2 }, TABULAR]}>
            {date}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});
