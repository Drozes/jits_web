import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Play } from "lucide-react-native";
import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import type { CardMedia } from "@/lib/film-room/card-media";
import { formatDuration } from "@/lib/film-room/format";
import { statusBadgeLabel, uploadingLabel, type CardStatus } from "@/lib/film-room/card-status";
import { CARD_CAPTION } from "@/lib/video/video-status-copy";
import { TRY_AGAIN_A11Y, TRY_AGAIN_LABEL } from "@/lib/video/use-upload-actions";
import { ON_MEDIA, usePalette } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { OpeningStill, type StillAthlete } from "@/components/film-room/opening-still";
import { FilmBadge, toneFor } from "@/components/film-room/status-badge";
import { Button } from "@/components/ui/elo-system/button";
import { drawsNoFilmCaption } from "@/lib/matches/feed-states";
import { FeedPoster } from "./feed-poster";

/** C-L7, only on a card whose match has no video rows at all. */
export const NO_FILM_CAPTION = "No film for this one";
/** C-L6, taught once per screen under the first C-L7 card. */
export const RECORDING_HELPER = "Turn on Record from my phone at face-off.";

/** The fallback art's caption (mono caps), or "" for none. */
export function feedFallbackCaption(item: MatchLibraryItem, status: CardStatus): string {
  if (drawsNoFilmCaption(item, status)) return NO_FILM_CAPTION.toUpperCase();
  switch (status.kind) {
    case "uploading":
    case "upload_failed":
    case "no_film":
      // The badge (and the track or Try again) already says it.
      return "";
    case "paused":
      return CARD_CAPTION.arrivesAfterUpload;
    case "processing":
      return "PROCESSING FILM";
    case "failed":
      return "FILM FAILED TO PROCESS";
    default:
      break;
  }
  // No rows yet but film is on its way (collecting, waiting, building).
  if (item.videos.length === 0) return CARD_CAPTION.arrivesAfterUpload;
  // Film is on the server and its still is not cut yet.
  return "PROCESSING FILM";
}

/**
 * The one top-left badge, by the deck priority (`statusBadgeLabel`, plus this
 * phone's upload %). A card with no video rows that draws C-L7 gets no
 * NO FILM badge: the two never stack (the badge is for cards WITH rows).
 */
export function feedBadgeLabel(item: Pick<MatchLibraryItem, "videos">, status: CardStatus): string | null {
  if (status.kind === "uploading") return uploadingLabel(status.progress);
  if (drawsNoFilmCaption(item, status)) return null;
  return statusBadgeLabel(status);
}

function sentence(caps: string): string {
  const lower = caps.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

interface MatchFeedMediaProps {
  item: MatchLibraryItem;
  status: CardStatus;
  media: CardMedia;
  viewer: StillAthlete;
  /** Opponent short name (`shortName`). */
  opp: string;
  /** Show C-L6 under C-L7 (the first no-film card on the screen only). */
  helper: boolean;
  onPress: () => void;
  onRetry?: () => void;
}

/**
 * The card's 16:9 media area (specs/matches-tab 6.2): the selected poster by
 * the crop rule, else the two-athlete fallback art; one status badge top
 * left; the duration chip and the play glyph only when the selected video is
 * playable. One Pressable that always opens match detail.
 */
export function MatchFeedMedia({ item, status, media, viewer, opp, helper, onPress, onRetry }: MatchFeedMediaProps) {
  const p = usePalette();
  const playable = media.playVideo != null;
  const duration = playable ? formatDuration(media.durationSeconds) : null;
  const badge = feedBadgeLabel(item, status);
  const caption = media.posterUrl ? "" : feedFallbackCaption(item, status);
  const noFilm = !media.posterUrl && drawsNoFilmCaption(item, status);
  const uploading = status.kind === "uploading";
  const progress = uploading && status.progress != null ? Math.min(1, Math.max(0, status.progress)) : null;
  const label = playable
    ? `Open match vs ${opp}${badge ? `, ${badge.toLowerCase()}` : ""}`
    : `${noFilm ? `${NO_FILM_CAPTION}. ` : badge ? `${sentence(badge)}. ` : ""}Open match vs ${opp}`;

  return (
    <Pressable
      testID={`film-card-media-${item.match_id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      accessibilityActions={onRetry ? [{ name: "retry", label: TRY_AGAIN_A11Y }] : undefined}
      onAccessibilityAction={onRetry ? (e) => {
        if (e.nativeEvent.actionName === "retry") onRetry();
      } : undefined}
      className="overflow-hidden active:opacity-80"
      style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 3, borderWidth: 1, borderColor: p.hairline, backgroundColor: p.plate }}
    >
      {media.posterUrl ? (
        <FeedPoster url={media.posterUrl} cacheKey={media.posterVideo?.thumbnail_key} width={media.posterWidth} height={media.posterHeight} dim={uploading} />
      ) : (
        <OpeningStill
          posterUrl={null}
          me={viewer}
          opponent={item.opponent ? { name: item.opponent.display_name, photoUrl: item.opponent.profile_photo_url } : null}
          fallbackLabel={caption}
          tileSize={40}
          footer={helper && noFilm ? (
            <Text testID="film-card-helper" className="font-body text-center" style={[typeStep("small"), { marginTop: 8, paddingHorizontal: 24, color: p.text2 }]}>
              {RECORDING_HELPER}
            </Text>
          ) : null}
        />
      )}
      {playable ? (
        <View testID="film-card-play" pointerEvents="none" style={{ position: "absolute", left: "50%", top: "50%", width: 48, height: 48, marginLeft: -24, marginTop: -24, borderRadius: 4, borderWidth: 1, borderColor: ON_MEDIA.strong, backgroundColor: ON_MEDIA.badge, alignItems: "center", justifyContent: "center" }}>
          <Play size={20} color={ON_MEDIA.white} fill={ON_MEDIA.white} style={{ marginLeft: 2 }} />
        </View>
      ) : null}
      {badge ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 8, left: 8 }}>
          <FilmBadge testID="film-card-badge" label={badge} tone={toneFor(status)} />
        </View>
      ) : null}
      {duration ? (
        <View testID="film-card-duration" pointerEvents="none" style={{ position: "absolute", right: 8, bottom: 8, height: 20, paddingHorizontal: 6, borderRadius: 2, justifyContent: "center", backgroundColor: ON_MEDIA.badge }}>
          <Text className="font-mono-bold" style={[typeStep("caption"), { letterSpacing: TRACKING.loose, color: ON_MEDIA.white }, TABULAR]}>
            {duration}
          </Text>
        </View>
      ) : null}
      {onRetry ? (
        // A real 44 pt control (deck convention 10); also an accessibility action on the media.
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 16, alignItems: "center" }}>
          <Button testID="film-card-retry" variant="secondary" height={44} label={TRY_AGAIN_LABEL} accessibilityLabel={TRY_AGAIN_A11Y} onPress={onRetry} />
        </View>
      ) : null}
      {progress != null ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: media.posterUrl ? ON_MEDIA.track : p.track }}>
          <View testID="film-card-progress" style={{ width: `${Math.round(progress * 100)}%`, height: 3, backgroundColor: media.posterUrl ? ON_MEDIA.amber : p.amber }} />
        </View>
      ) : null}
    </Pressable>
  );
}
