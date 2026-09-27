import * as React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OpponentLinkRow } from "@/components/match-detail/opponent-link-row";
import { MatchDetailError, MatchDetailSkeleton, MatchNoVideo } from "@/components/match-detail/match-detail-states";
import { HarnessMarker } from "@/components/match-detail/harness-marker";
import { MatchHero } from "@/components/match-detail/match-hero";
import { MatchVerdict } from "@/components/match-detail/match-verdict";
import { AiBreakdown } from "@/components/match-detail/ai-breakdown";
import { KeyMoments } from "@/components/match-detail/key-moments";
import { FilmAngles } from "@/components/match-detail/film-angles";
import { FilmSurface } from "@/components/film-room/film-surface";
import { FilmBackButton } from "@/components/film-room/film-back-button";
import { AngleSwitcher } from "@/components/film-room/angle-switcher";
import { useMatchDetail } from "@/lib/match-detail/use-match-detail";
import { useMatchFilm } from "@/lib/match-detail/use-match-film";
import { markMatchSeen } from "@/lib/film-room/seen-store";
import { videoHref } from "@/lib/film-room/href";
import { FILM } from "@/lib/film-room/film-palette";

/**
 * One past match, the Film Room's match page: the opening still with play,
 * the verdict and rating change, the AI breakdown of the selected angle, its
 * key moments (each opens the player at that second), technique tags, the
 * angle switcher when both athletes recorded, and a Watch row per recording.
 *
 * This is a plain pushed screen, NOT the live match wizard (`match/[matchId]`):
 * it must never call `useArenaMatchScreen`, which takes the athlete offline
 * and suppresses challenge prompts. Reading an old match changes no presence.
 */
export default function MatchDetailScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, data, error, refreshing, refetch } = useMatchDetail(matchId);
  const film = useMatchFilm(state === "ready" ? data : null, matchId ?? "");

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

  return (
    <FilmSurface>
      {state === "ready" && data ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={FILM.text2} />}
        >
          <MatchHero
            posterUrl={active?.poster_url ?? null}
            posterKey={active?.id}
            me={{ name: data.me.display_name, photoUrl: data.me.profile_photo_url }}
            opponent={data.opponent ? { name: data.opponent.display_name, photoUrl: data.opponent.profile_photo_url } : null}
            fallbackLabel={film.fallbackLabel}
            ranked={data.match.match_type === "ranked"}
            clockSeconds={data.match.duration_seconds}
            onPlay={active && active.playability !== "processing" ? () => play(active.id) : null}
          />
          <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 20 }}>
            <MatchVerdict view={data} />
            {data.videos.length > 1 && active ? (
              <AngleSwitcher
                angles={data.videos}
                activeId={active.id}
                opponentName={data.opponent?.display_name}
                onSelect={film.setActiveId}
              />
            ) : null}
            {film.phase ? <AiBreakdown phase={film.phase} onRetry={film.retryAnalysis} /> : null}
            {active ? (
              <KeyMoments
                moments={film.moments}
                durationS={active.duration_seconds}
                tags={film.tags}
                onJump={(t) => play(active.id, t)}
              />
            ) : null}
            {data.videos.length > 0 ? (
              <FilmAngles videos={data.videos} opponentName={data.opponent?.display_name ?? null} onWatch={(id) => play(id)} />
            ) : (
              <MatchNoVideo />
            )}
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
            <FilmBackButton label="Go back" fallback="/" color={FILM.text} />
          </View>
          {state === "error" ? (
            <MatchDetailError code={error?.code ?? "UNKNOWN"} onBack={goBack} onRetry={refetch} />
          ) : (
            <MatchDetailSkeleton />
          )}
        </View>
      )}
      <HarnessMarker testID="match-detail-screen" label={label} />
    </FilmSurface>
  );
}
