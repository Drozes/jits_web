import * as React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { matchDetailHref } from "@/lib/match-detail/href";
import { FILM_ROOM_HREF } from "@/lib/film-room/href";
import { useMatchUploads } from "@/lib/film-room/use-match-uploads";
import { useSeenMatches } from "@/lib/film-room/seen-store";
import { MetaTag } from "@/components/ui/elo-system";
import { LibraryPoster } from "@/components/film-room/library-poster";
import type { StillAthlete } from "@/components/film-room/opening-still";

/** Posters in the preview row. */
export const PREVIEW_COUNT = 6;
const TILE_WIDTH = 120;

interface FilmRoomPreviewProps {
  /** First library page (newest first); undefined while cold-loading. */
  items: MatchLibraryItem[] | undefined;
  error: boolean;
  onRetry: () => void;
  viewer: StillAthlete;
}

/**
 * Profile's way into the Film Room (replaces "Past Match Videos"): an entry
 * row that opens the library, then the newest filmed matches as a
 * horizontally scrolling poster row. Each poster opens its match page and
 * keeps the harness contract of the old rows (`past-video-row-<matchId>`,
 * "Open match video vs <name>").
 */
export function FilmRoomPreview({ items, error, onRetry, viewer }: FilmRoomPreviewProps) {
  const router = useRouter();
  const tokens = useThemedTokens();
  // Stable props so the memoized posters only re-render when their own
  // match changes (an upload tick re-renders just that poster).
  const tile = React.useMemo(() => ({ name: viewer.name, photoUrl: viewer.photoUrl }), [viewer.name, viewer.photoUrl]);
  const open = React.useCallback((matchId: string) => router.push(matchDetailHref(matchId)), [router]);
  const seen = useSeenMatches();
  const filmed = React.useMemo(() => (items ?? []).slice(0, 20), [items]);
  const uploads = useMatchUploads(React.useMemo(() => filmed.map((i) => i.match_id), [filmed]));
  const preview = filmed
    .filter((i) => i.videos.length > 0 || uploads.has(i.match_id))
    .slice(0, PREVIEW_COUNT);

  return (
    <View className="gap-3">
      <MetaTag>Film Room</MetaTag>
      <Pressable
        testID="film-room-entry"
        accessibilityRole="button"
        accessibilityLabel="Open Film Room"
        onPress={() => router.push(FILM_ROOM_HREF as never)}
        className="flex-row items-center gap-3 bg-surface-3 border border-hairline-faint rounded-xs px-4 py-3 active:bg-surface-4"
      >
        <View className="flex-1 min-w-0">
          <Text className="font-heading text-callout text-ink uppercase tracking-caps">Film Room</Text>
          <Text className="font-body text-small text-ink-3">Every match, its film and the breakdown.</Text>
        </View>
        <View pointerEvents="none">
          <ChevronRight size={16} color={tokens.textSecondary} />
        </View>
      </Pressable>

      {error && items === undefined ? (
        <Pressable testID="past-videos-error" accessibilityRole="button" onPress={onRetry} className="bg-surface-3 border border-hairline-faint rounded-xs px-4 py-3 active:bg-surface-4">
          <Text className="font-body text-small text-ink-3">Couldn't load your film. Tap to retry.</Text>
        </Pressable>
      ) : preview.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          testID="film-room-preview"
          contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}
          style={{ marginHorizontal: -16 }}
        >
          {preview.map((item) => {
            const name = item.opponent?.display_name ?? "Opponent";
            return (
              <View key={item.match_id} style={{ width: TILE_WIDTH }}>
                <LibraryPoster
                  item={item}
                  viewer={tile}
                  variant="compact"
                  seen={!seen.ready || seen.isSeen(item.match_id)}
                  testID={`past-video-row-${item.match_id}`}
                  accessibilityLabel={`Open match video vs ${name}`}
                  onOpen={open}
                />
              </View>
            );
          })}
        </ScrollView>
      ) : items !== undefined ? (
        <View testID="past-videos-empty" className="bg-surface-3 border border-hairline-faint rounded-xs px-4 py-3">
          <Text className="font-body text-small text-ink-3">No match film yet. Record your next match to watch it here.</Text>
        </View>
      ) : null}
    </View>
  );
}
