import * as React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OpponentLinkRow } from "@/components/match-detail/opponent-link-row";
import { MatchDetailError, MatchDetailSkeleton, MatchNoVideo } from "@/components/match-detail/match-detail-states";
import { HighlightSection } from "@/components/match-detail/highlight/highlight-section";
import { HarnessMarker } from "@/components/match-detail/harness-marker";
import { HERO_HEIGHT, MatchHero } from "@/components/match-detail/match-hero";
import { MatchVerdict } from "@/components/match-detail/match-verdict";
import { AiBreakdown } from "@/components/match-detail/ai-breakdown";
import { KeyMoments } from "@/components/match-detail/key-moments";
import { FilmAngles } from "@/components/match-detail/film-angles";
import { FilmBackButton } from "@/components/film-room/film-back-button";
import { AngleSwitcher } from "@/components/film-room/angle-switcher";
import { useMatchDetail } from "@/lib/match-detail/use-match-detail";
import { useMatchFilm } from "@/lib/match-detail/use-match-film";
import { deriveFilmSection } from "@/lib/match-detail/film-section";
import { MatchUploadCard } from "@/components/match-detail/match-upload-card";
import { useRefetchOnUploadSettled } from "@/lib/profile/use-my-match-videos";
import { markMatchSeen } from "@/lib/film-room/seen-store";
import { videoHref } from "@/lib/film-room/href";
import { usePalette } from "@/lib/theme/palette";
import { ThemedStatusBar } from "@/lib/theme/themed-status-bar";
import { angleWatchable, localAngleJob } from "@/lib/video/angle-status";
import { useFilmStatus } from "@/lib/video/use-film-status";
import { useAuth } from "@/lib/auth/hooks";
import { useShowAnalysisLabels } from "@/lib/video/use-show-analysis-labels";
import { deriveUploadBannerState, showRecorderBanner } from "@/lib/video/upload-banner-state";
import { useSuppressUploadStrip } from "@/lib/video/upload-strip-visibility";
import { FilmStatusPlate } from "@/components/video-status/film-status-plate";
import { TimekeeperFilm } from "@/components/match-detail/timekeeper-film";
import { watchLabel } from "@/components/match-detail/film-angles";
import type { FilmRow } from "@/lib/video/film-status";

/**
 * One past match, the Film Room's match page: the opening still with play,
 * the verdict and rating change, the AI breakdown of the selected angle, its
 * key moments (each opens the player at that second), technique tags (the
 * AI summary, move labels and tags for admins only, jits-xfvd.18), the
 * angle switcher when both athletes recorded, and the Film status plate
 * (jits-n2im.25): the canonical status of every angle, a Watch row per
 * ready angle, Try again for this phone's own upload. The video pushes
 * (film_ready, no_film, timekeeper_film_ready) route here and land on it.
 * The timekeeper, who has no participant row, gets the plate alone.
 *
 * This is a plain pushed screen, NOT the live match wizard (`match/[matchId]`):
 * it must never call `useArenaMatchScreen`, which takes the athlete offline
 * and suppresses challenge prompts. Reading an old match changes no presence.
 */
export default function MatchDetailScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const p = usePalette();
  // The hero's top scrim is dark: light status bar until the hero has
  // mostly scrolled away (its last 50 pt fade into the page).
  const [pastHero, setPastHero] = React.useState(false);
  const { state, data, error, refreshing, refetch } = useMatchDetail(matchId);
  const film = useMatchFilm(state === "ready" ? data : null, matchId ?? "");
  // AI move labels, technique tags and the summary are admin-only (jits-xfvd.18).
  const showLabels = useShowAnalysisLabels();
  // The canonical Film status (jits-n2im.25). Until it has loaded, or if
  // the status read fails, the wave 2 rows below stand in.
  const { athlete } = useAuth();
  // Playability is the playback query's (wave 2 `angleWatchable`): an angle
  // plays once it has bytes, whatever its analysis is doing.
  const playable = React.useMemo(
    () => (state === "ready" && data ? new Map(data.videos.filter(angleWatchable).map((v) => [v.id, v.duration_seconds])) : null),
    [state, data],
  );
  const filmStatus = useFilmStatus(matchId, athlete?.id, playable);
  const fsView = filmStatus.view;
  // The wave 2 film rows stand in when the status could not be read.
  const legacyFilm = !fsView && !filmStatus.loading;
  useSuppressUploadStrip(matchId ? { kind: "match", matchId } : null);
  // An angle the server newly calls ready (analysed) brings a poster and a
  // breakdown: re-read the match.
  const readyKey = filmStatus.status ? filmStatus.status.angles.filter((a) => a.state === "ready").map((a) => a.video_id).join(",") : null;
  // Seeded by the first status read (no extra get_match_details on open).
  const lastReady = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (readyKey == null) return;
    const prev = lastReady.current;
    lastReady.current = readyKey;
    if (prev != null && prev !== readyKey) refetch();
  }, [readyKey, refetch]);
  // The row lands when the upload settles, usually while this page is open:
  // re-read then instead of waiting for a focus or a pull (jits-n2im.4).
  const settledIds = React.useMemo(() => (matchId ? [matchId] : []), [matchId]);
  useRefetchOnUploadSettled(settledIds, refetch);
  // Pull-to-refresh also re-reads (and if needed re-signs) the highlight cards.
  const [highlightReload, setHighlightReload] = React.useState(0);
  const onRefresh = React.useCallback(() => {
    refetch();
    setHighlightReload((n) => n + 1);
  }, [refetch]);

  React.useEffect(() => {
    if (state === "ready" && data) markMatchSeen(data.match.id);
  }, [state, data]);

  const goBack = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  const label =
    state === "ready" && data
      ? `Match detail vs ${data.opponent?.display_name ?? "Opponent"}`
      : "Match detail";

  const play = (videoId: string, t?: number) => router.push(videoHref(videoId, t));
  const active = film.active;
  const section = deriveFilmSection(film.localUpload, state === "ready" && data ? data.videos.length : 0);
  const rowWatchLabel = (row: FilmRow) => {
    const v = data?.videos.find((x) => x.id === row.videoId);
    return v ? watchLabel(v.angle_label) : `Watch ${row.label.toLowerCase()}`;
  };

  // The timekeeper: get_match_details refuses them, the status admits them.
  // While the status read is still out, keep the skeleton (no error flash).
  const awaitingRole = state === "error" && error?.code === "NOT_PARTICIPANT" && filmStatus.loading;
  if (state === "error" && error?.code === "NOT_PARTICIPANT" && fsView?.role === "timekeeper" && filmStatus.status && matchId) {
    return (
      <View className="flex-1 bg-surface">
        <ThemedStatusBar />
        <TimekeeperFilm matchId={matchId} status={filmStatus.status} view={fsView} onWatch={(id) => play(id)} />
        <HarnessMarker testID="match-detail-screen" label="Match detail, timekeeper" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <ThemedStatusBar overMedia={state === "ready" && !!data && !pastHero} />
      {state === "ready" && data ? (
        <ScrollView
          scrollEventThrottle={32}
          onScroll={(e) => {
            const past = e.nativeEvent.contentOffset.y > HERO_HEIGHT - 50;
            if (past !== pastHero) setPastHero(past);
          }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={p.text2} />}
        >
          <MatchHero
            posterUrl={active?.poster_url ?? null}
            posterKey={active?.thumbnail_key ?? undefined}
            me={{ name: data.me.display_name, photoUrl: data.me.profile_photo_url }}
            opponent={data.opponent ? { name: data.opponent.display_name, photoUrl: data.opponent.profile_photo_url } : null}
            fallbackLabel={film.fallbackLabel}
            playHint={film.playHint}
            clockSeconds={data.match.duration_seconds}
            onPlay={active && angleWatchable(active) ? () => play(active.id) : null}
          />
          <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 20 }}>
            <MatchVerdict view={data} />
            {fsView ? (
              <FilmStatusPlate matchId={data.match.id} view={fsView} onWatch={(id) => play(id)} watchLabel={rowWatchLabel} />
            ) : null}
            {/* What the plate has no row for: a landed clip that stops before the end. */}
            {fsView && film.localUpload && showRecorderBanner(deriveUploadBannerState("idle", null, film.localUpload)) ? (
              <MatchUploadCard matchId={data.match.id} entry={film.localUpload} />
            ) : null}
            {data.videos.length > 1 && active ? (
              <AngleSwitcher
                angles={data.videos}
                bestId={fsView ? fsView.bestVideoId : undefined}
                activeId={active.id}
                opponentName={data.opponent?.display_name}
                onSelect={film.setActiveId}
              />
            ) : null}
            {film.phase ? <AiBreakdown phase={film.phase} onRetry={film.retryAnalysis} showLabels={showLabels} /> : null}
            {active ? (
              <KeyMoments
                moments={film.moments}
                durationS={active.duration_seconds}
                tags={film.tags}
                showLabels={showLabels}
                recordedSubmission={data.match.submission_name}
                onJump={(t) => play(active.id, t)}
              />
            ) : null}
            {legacyFilm && section.upload && film.localUpload ? <MatchUploadCard matchId={data.match.id} entry={film.localUpload} /> : null}
            {legacyFilm && section.films ? (
              <FilmAngles
                videos={data.videos}
                opponentName={data.opponent?.display_name ?? null}
                onWatch={(id) => play(id)}
                local={localAngleJob(film.localUpload)}
              />
            ) : null}
            {legacyFilm && section.noVideo ? <MatchNoVideo /> : null}
            {/* The viewer's own reel of each recording, under the film. */}
            <HighlightSection videos={data.videos} reloadToken={highlightReload} />
            {data.opponent ? (
              <OpponentLinkRow
                opponent={data.opponent}
                onPress={() => router.push(`/(app)/athlete/${data.opponent!.athlete_id}`)}
              />
            ) : null}
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <View style={{ paddingHorizontal: 4, height: 48, justifyContent: "center" }}>
            <FilmBackButton label="Go back" fallback="/" color={p.text} />
          </View>
          {state === "error" && !awaitingRole ? (
            <MatchDetailError code={error?.code ?? "UNKNOWN"} onBack={goBack} onRetry={refetch} />
          ) : (
            <MatchDetailSkeleton />
          )}
        </View>
      )}
      <HarnessMarker testID="match-detail-screen" label={label} />
    </View>
  );
}
