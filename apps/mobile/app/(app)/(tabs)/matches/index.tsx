import * as React from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useProfileData } from "@/lib/profile/use-profile-data";
import { useRefetchOnUploadSettled } from "@/lib/profile/use-my-match-videos";
import { useRefetchOnRefocus } from "@/lib/cache/use-refocus-refetch";
import { useMatchExitCount } from "@/lib/arena/arena-store";
import { matchDetailHref } from "@/lib/match-detail/href";
import { useMatchLibrary } from "@/lib/film-room/use-match-library";
import { useFilmRoomPhases } from "@/lib/film-room/use-film-room-phases";
import { useSeenMatches } from "@/lib/film-room/seen-store";
import { applyFilter, buildRows, NO_FILTER, opponentsOf, recordOf, type LibraryFilter, type LibraryRow } from "@/lib/film-room/rows";
import { recordStrip } from "@/lib/film-room/format";
import { usePalette } from "@/lib/theme/palette";
import { useMatchesRefresh } from "@/lib/matches/use-matches-refresh";
import { TabHeader } from "@/components/layout/tab-header";
import { OpponentPicker } from "@/components/film-room/opponent-picker";
import { FilmRoomEmpty, FilmRoomError, ListFooter, MonthHeader } from "@/components/film-room/film-room-states";
import { MatchesListHeader } from "@/components/matches/matches-list-header";
import { POSTER_GRID_LAYOUT, type MatchListLayout } from "@/components/matches/match-list-layout";

/**
 * How the feed draws a match. Wave 2 swaps this for the full-width
 * `MatchFeedCard` layout (jits-a4fw.4); see `MatchListLayout`.
 */
const LAYOUT: MatchListLayout = POSTER_GRID_LAYOUT;

/**
 * The Matches tab (spec specs/matches-tab/spec.md section 6): every match
 * the athlete has fought, newest first, grouped by month, with result and
 * opponent filters. It replaced the pushed Film Room screen, whose list
 * logic moved here unchanged. Pages through `get_my_match_library` via its
 * (next_before, next_before_id) cursor.
 *
 * Since Profile dropped its Film Room preview, this tab is the only reader of
 * the `match-library:<id>` cache, so its first open after launch is a cold
 * load (skeleton) and every later one paints warm from the cache.
 */
export default function MatchesScreen() {
  const { athlete } = useRequireAthlete();
  const router = useRouter();
  const p = usePalette();
  const library = useMatchLibrary(athlete?.id);
  const { history } = useProfileData(athlete?.id, athlete?.primary_gym_id);
  const seen = useSeenMatches();
  const [filter, setFilter] = React.useState<LibraryFilter>(NO_FILTER);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const hasMore = library.hasMore;
  // The server's Film status for the newest matches (badge priority, deck 9).
  // Passing the items as the reload token re-reads phases on every refresh.
  const phases = useFilmRoomPhases(library.items, library.items, athlete?.id ?? null);
  const ids = React.useMemo(() => library.items.map((i) => i.match_id), [library.items]);
  useRefetchOnUploadSettled(ids, library.revalidate);
  useRefetchOnRefocus(library.revalidate, useMatchExitCount());

  // Pull to refresh re-reads the library (the phases follow its items); the
  // reel lane joins here when the carousel lands (spec 6.1, AC 2.3). The
  // spinner and the C-E2 toast follow the athlete's own pull only.
  const { refreshing, onRefresh } = useMatchesRefresh(library.refresh, library.isValidating, library.refreshError);

  const opponents = React.useMemo(() => opponentsOf(library.items), [library.items]);
  const visible = React.useMemo(() => applyFilter(library.items, filter), [library.items, filter]);
  const rows = React.useMemo(() => buildRows(visible, LAYOUT.perRow), [visible]);
  const filtered = filter.outcome !== "all" || !!filter.opponentId;
  const opponentName = opponents.find((o) => o.id === filter.opponentId)?.name ?? null;
  const viewerId = athlete?.id ?? null;
  const viewerName = athlete?.display_name ?? "You";
  const viewerPhoto = athlete?.profile_photo_url ?? null;
  // Stable props so memoized cards skip unrelated re-renders.
  const viewer = React.useMemo(() => ({ name: viewerName, photoUrl: viewerPhoto }), [viewerName, viewerPhoto]);
  const open = React.useCallback((matchId: string) => router.push(matchDetailHref(matchId)), [router]);

  const renderRow = React.useCallback(
    ({ item: row }: { item: LibraryRow }) => {
      // The oldest loaded month may continue on the next page: no count yet.
      if (row.type === "month") return <MonthHeader label={row.label} count={row.last && hasMore ? null : row.count} />;
      return (
        <View className="flex-row" style={{ gap: 16, marginBottom: 16 }}>
          {row.items.map((m) => (
            <React.Fragment key={m.match_id}>
              {LAYOUT.renderMatch(m, {
                viewer,
                viewerId,
                seen: !seen.ready || seen.isSeen(m.match_id),
                phase: phases[m.match_id] ?? null,
                onOpen: open,
              })}
            </React.Fragment>
          ))}
          {LAYOUT.perRow === 2 && row.items.length === 1 ? <View className="flex-1" /> : null}
        </View>
      );
    },
    [viewer, viewerId, seen, open, hasMore, phases],
  );

  const header = (
    <MatchesListHeader
      record={recordStrip(recordOf(history), athlete?.current_elo)}
      // The "Your highlights" reel carousel slot (jits-a4fw.4), empty until it lands.
      carousel={null}
      filter={filter}
      opponentName={opponentName}
      onOutcome={(outcome) => setFilter((f) => ({ ...f, outcome }))}
      onOpenOpponents={() => setPickerOpen(true)}
      skeleton={library.isLoading ? <LAYOUT.Skeleton /> : null}
    />
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
    <View testID="matches-screen" className="flex-1 bg-surface">
      <TabHeader title="Matches" />
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
        contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={p.text3} />
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
