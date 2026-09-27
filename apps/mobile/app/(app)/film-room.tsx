import * as React from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useProfileData } from "@/lib/profile/use-profile-data";
import { useRefetchOnUploadSettled } from "@/lib/profile/use-my-match-videos";
import { useRefetchOnRefocus } from "@/lib/cache/use-refocus-refetch";
import { useMatchExitCount } from "@/lib/arena/arena-store";
import { matchDetailHref } from "@/lib/match-detail/href";
import { useMatchLibrary } from "@/lib/film-room/use-match-library";
import { useSeenMatches } from "@/lib/film-room/seen-store";
import { applyFilter, buildRows, NO_FILTER, opponentsOf, recordOf, type LibraryFilter, type LibraryRow } from "@/lib/film-room/rows";
import { recordStrip } from "@/lib/film-room/format";
import { TABULAR, usePalette } from "@/lib/theme/palette";
import { ThemedStatusBar } from "@/lib/theme/themed-status-bar";
import { FilmBackButton } from "@/components/film-room/film-back-button";
import { FilterChips } from "@/components/film-room/filter-chips";
import { OpponentPicker } from "@/components/film-room/opponent-picker";
import { LibraryPoster } from "@/components/film-room/library-poster";
import { FilmRoomEmpty, FilmRoomError, FilmRoomSkeleton, ListFooter, MonthHeader } from "@/components/film-room/film-room-states";

/**
 * The Film Room: every match the athlete has fought, newest first, as a
 * poster grid grouped by month, with result and opponent filters. Reached
 * from Profile. Pages through `get_my_match_library` via its (next_before, next_before_id) cursor.
 *
 * A plain pushed screen: like match detail it never touches live state.
 */
export default function FilmRoomScreen() {
  const { athlete } = useRequireAthlete();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const p = usePalette();
  const library = useMatchLibrary(athlete?.id);
  const { history } = useProfileData(athlete?.id, athlete?.primary_gym_id);
  const seen = useSeenMatches();
  const [filter, setFilter] = React.useState<LibraryFilter>(NO_FILTER);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const hasMore = library.hasMore;
  const ids = React.useMemo(() => library.items.map((i) => i.match_id), [library.items]);
  useRefetchOnUploadSettled(ids, library.revalidate);
  useRefetchOnRefocus(library.revalidate, useMatchExitCount());

  const opponents = React.useMemo(() => opponentsOf(library.items), [library.items]);
  const visible = React.useMemo(() => applyFilter(library.items, filter), [library.items, filter]);
  const rows = React.useMemo(() => buildRows(visible), [visible]);
  const filtered = filter.outcome !== "all" || !!filter.opponentId;
  const opponentName = opponents.find((o) => o.id === filter.opponentId)?.name ?? null;
  const viewerName = athlete?.display_name ?? "You";
  const viewerPhoto = athlete?.profile_photo_url ?? null;
  // Stable props so memoized posters skip unrelated re-renders.
  const viewer = React.useMemo(() => ({ name: viewerName, photoUrl: viewerPhoto }), [viewerName, viewerPhoto]);
  const open = React.useCallback((matchId: string) => router.push(matchDetailHref(matchId)), [router]);

  const renderRow = React.useCallback(
    ({ item: row }: { item: LibraryRow }) => {
      // The oldest loaded month may continue on the next page: no count yet.
      if (row.type === "month") return <MonthHeader label={row.label} count={row.last && hasMore ? null : row.count} />;
      return (
        <View className="flex-row" style={{ gap: 16, marginBottom: 16 }}>
          {row.items.map((m) => (
            <LibraryPoster
              key={m.match_id}
              item={m}
              viewer={viewer}
              seen={!seen.ready || seen.isSeen(m.match_id)}
              onOpen={open}
            />
          ))}
          {row.items.length === 1 ? <View className="flex-1" /> : null}
        </View>
      );
    },
    [viewer, seen, open, hasMore],
  );

  const header = (
    <View>
      <View className="flex-row items-center" style={{ gap: 8, height: 44 }}>
        <View style={{ marginLeft: -12 }}>
          <FilmBackButton label="Go back" fallback="/(app)/(tabs)/profile" color={p.text} />
        </View>
        <Text accessibilityRole="header" className="font-display text-ink" style={{ fontSize: 40, lineHeight: 44, letterSpacing: 0.8, paddingTop: 4 }}>
          FILM ROOM
        </Text>
      </View>
      <Text testID="film-room-record" className="font-mono-medium" style={[{ marginTop: 6, marginBottom: 18, fontSize: 11, letterSpacing: 1.68, color: p.text2 }, TABULAR]}>
        {recordStrip(recordOf(history), athlete?.current_elo)}
      </Text>
      <FilterChips
        filter={filter}
        opponentName={opponentName}
        onOutcome={(outcome) => setFilter((f) => ({ ...f, outcome }))}
        onOpenOpponents={() => setPickerOpen(true)}
      />
      {library.isLoading ? <FilmRoomSkeleton /> : null}
    </View>
  );

  const empty = library.isLoading ? null : library.error ? (
    <FilmRoomError onRetry={library.refresh} />
  ) : (
    <FilmRoomEmpty
      filtered={filtered}
      onClear={() => setFilter(NO_FILTER)}
      onLoadOlder={library.hasMore && !library.loadingMore ? library.loadMore : undefined}
    />
  );

  return (
    <View testID="film-room-screen" className="flex-1 bg-surface">
      <ThemedStatusBar />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          rows.length > 0 ? <ListFooter loadingMore={library.loadingMore} moreError={library.moreError} onRetry={library.loadMore} /> : null
        }
        onEndReached={library.hasMore && !library.moreError ? library.loadMore : undefined}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}
        refreshControl={
          <RefreshControl refreshing={library.isValidating && !library.isLoading} onRefresh={library.refresh} tintColor={p.text2} />
        }
      />
      <OpponentPicker
        visible={pickerOpen}
        opponents={opponents}
        selectedId={filter.opponentId}
        onSelect={(opponentId) => {
          setFilter((f) => ({ ...f, opponentId }));
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}
