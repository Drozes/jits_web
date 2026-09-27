import * as React from "react";
import { Share, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Film, RotateCcw, Share2, TrendingUp } from "lucide-react-native";
import { toast } from "@/components/ui/toast";
import { exitMatchTo } from "@/lib/match-flow/exit-to";
import { matchDetailHref } from "@/lib/match-detail/href";
import { ARENA_HREF } from "@/lib/arena/constants";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
import { useMatchSyncContext, useStepMatchSync } from "@/lib/match-flow/match-sync-context";
import { rankStripText, useRankChange, useVerdictVideos } from "@/lib/match-flow/use-verdict-data";
import type { UploadBannerState } from "@/lib/video/upload-banner-state";
import { buildShareText, buildShareUrl } from "@jits/shared/utils";
import { UploadProgressBanner } from "../upload-progress-banner";
import { usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS, TABULAR } from "../fight/fight-tokens";
import { FightButton, Mono, RatingBlock, deltaColor, formatSignedDelta, shortName } from "../fight/fight-ui";
import { Confetti, RiseIn, SlamIn, TickingRating } from "./celebration";
import { HERO_HEIGHT, VerdictHero } from "./verdict-hero";
import { ThemedStatusBar } from "@/lib/theme/themed-status-bar";
import { useScrolledPast } from "../wizard-scroll";

/**
 * The Arena with the opponent to run it back against (jits-00fr). Navigated
 * with exitMatchTo, never a push: the match screen must unmount. `send`
 * asks the Arena to send the challenge itself once the opponent is back in
 * the lobby (see `useRematchAutoSend`): sending from here, while they are
 * still on their own verdict, gets it declined as busy by their app.
 */
export function rematchHref(opponentId: string, opts: { send?: boolean } = {}): string {
  return `${ARENA_HREF}?rematch=${encodeURIComponent(opponentId)}${opts.send ? "&send=1" : ""}`;
}

/** While the opponent's confirmation is missing, re-read the match this often. */
export const VERDICT_DISPUTE_POLL_MS = 15_000;
/** ...this many times (10 minutes); the row listener and foreground cover the rest. */
export const VERDICT_DISPUTE_POLL_LIMIT = 40;

export interface VerdictAthlete {
  athlete_id: string;
  display_name: string;
  elo_before?: number | null;
  elo_after?: number | null;
  elo_delta?: number | null;
  current_elo?: number | null;
  weight_division_gap?: number | null;
}

interface VerdictStepProps {
  matchId: string;
  exitHref: string;
  exitLabel: string;
  matchType: "ranked" | "casual";
  matchStatus: string;
  outcome: "win" | "loss" | "draw" | null;
  me: VerdictAthlete;
  opponent: VerdictAthlete;
  submissionName: string | null;
  finishTimeSeconds: number | null;
  /** This phone's recording / upload, from the match-keyed store. */
  upload: UploadBannerState;
  /** This phone's clip landed; re-reads the match's videos for the still. */
  uploadedVideoId: string | null;
  /** Athletes with a confirmation row (from the wizard's reconciler). */
  confirmedAthleteIds?: string[];
}

/**
 * Step 8, the verdict. A win celebrates (confetti, the verdict slams in, the
 * rating ticks, the rank strip rises); a loss is calm and makes the rematch
 * the red CTA. Two primary actions plus a small row; the opening still (or
 * the athletes, until it exists) as the hero; this phone's upload as a card.
 *
 * A recorder reaches this before the opponent has confirmed (auto-confirm,
 * B2), and the opponent may still dispute. So the verdict listens for
 * match_disputed and, while the opponent's confirmation is missing on a
 * completed match, re-reads the match on a bounded poll; a dispute turns it
 * into the calm DISPUTED verdict (no celebration, no rank strip).
 */
export function VerdictStep(props: VerdictStepProps) {
  const p = usePalette();
  const { matchId, exitHref, exitLabel, matchType, matchStatus, outcome, me, opponent, submissionName, finishTimeSeconds, upload, uploadedVideoId, confirmedAthleteIds = [] } = props;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rematching, setRematching] = React.useState(false);
  const [disputedHere, setDisputedHere] = React.useState(false);
  const { reconcileNow } = useMatchSyncContext();
  // Light status bar over the still's dark top scrim until the page scrolls
  // to where the bottom scrim is solid; then it follows the app theme.
  const pastHero = useScrolledPast(HERO_HEIGHT - 75 - insets.top);

  const opponentConfirmed = confirmedAthleteIds.includes(opponent.athlete_id);
  const disputed = matchStatus === "disputed" || disputedHere;
  const awaitingOpponent = !disputed && matchStatus === "completed" && !opponentConfirmed;

  useStepMatchSync({
    matchId,
    enabled: !disputed,
    onMatchDisputed: (athleteId) => {
      if (athleteId === me.athlete_id) return;
      setDisputedHere(true);
      toast.info({ text1: "Result disputed", description: `${opponent.display_name} disputed the result. An admin will review it.` });
      reconcileNow();
    },
  });

  // Bounded poll while the opponent could still dispute (a missed broadcast).
  const pollsRef = React.useRef(0);
  React.useEffect(() => {
    if (!awaitingOpponent) return;
    if (pollsRef.current >= VERDICT_DISPUTE_POLL_LIMIT) return;
    const id = setInterval(() => {
      pollsRef.current += 1;
      reconcileNow();
      if (pollsRef.current >= VERDICT_DISPUTE_POLL_LIMIT) clearInterval(id);
    }, VERDICT_DISPUTE_POLL_MS);
    return () => clearInterval(id);
  }, [awaitingOpponent, reconcileNow]);

  const ranked = matchType === "ranked";
  const win = !disputed && outcome === "win";
  const loss = !disputed && outcome === "loss";

  const videos = useVerdictVideos(matchId, me.athlete_id, uploadedVideoId);
  const rank = useRankChange(matchId, ranked && win);
  const rankText = win ? rankStripText(rank, shortName) : null;

  const eloBefore = ranked ? (me.elo_before ?? null) : null;
  // The stamped post-match rating only: before the refresh lands,
  // current_elo is still the PRE-match rating and would read as no change.
  const eloAfter = ranked ? (me.elo_after ?? null) : null;
  const eloDelta = ranked ? (me.elo_delta ?? null) : null;
  const gap = ranked ? (me.weight_division_gap ?? 0) : 0;

  const verdict = disputed ? "DISPUTED" : win ? "YOU WON" : loss ? "YOU LOST" : outcome === "draw" ? "DRAW" : "MATCH RECORDED";
  const verdictColor = outcome === "draw" && !disputed ? p.amber : p.text;
  const how = [submissionName ? `by ${submissionName}` : null, finishTimeSeconds != null ? formatElapsed(finishTimeSeconds) : null]
    .filter(Boolean)
    .join(" \u00b7 ");
  const oppShort = shortName(opponent.display_name);

  const uploadBusy = upload.kind === "uploading" || upload.kind === "stopping";
  const filmExpected = videos.hasVideo || uploadBusy || uploadedVideoId != null;
  const watchLabel = filmExpected ? "Watch film" : "Match details";
  const watch = () => router.push(matchDetailHref(matchId));
  const back = () => exitMatchTo(router, exitHref);

  function rematch() {
    if (rematching) return;
    setRematching(true);
    // The Arena sends it once the opponent is back in the lobby (and takes
    // this athlete live if they are not), then says so.
    exitMatchTo(router, rematchHref(opponent.athlete_id, { send: true }));
  }

  async function share() {
    if (!outcome) return;
    const url = buildShareUrl("match", matchId);
    // The rating line only once the stamped rating is in (never the
    // pre-match current_elo).
    const text = buildShareText({
      type: "match-result",
      data: { outcome, elo: eloAfter, eloDelta: eloAfter != null ? eloDelta : null },
    });
    try {
      // The link once, in the message: iOS appends a separate `url` to the
      // message, which showed it twice.
      await Share.share({ title: "ELO RATED match", message: `${text}\n${url}` });
    } catch {
      toast.error("Could not share this match");
    }
  }

  const rematchButton = (primary: boolean) =>
    disputed ? null : (
      <FightButton
        testID="summary-rematch"
        variant={primary ? "primary" : "ghost"}
        accessibilityLabel={`Rematch ${opponent.display_name}`}
        label={`Rematch ${oppShort}`}
        busy={rematching}
        onPress={rematch}
        height={primary ? 56 : 44}
        icon={(c) => <RotateCcw size={16} color={c} />}
        style={primary ? undefined : { flex: 1, paddingHorizontal: 4 }}
      />
    );
  const watchButton = (primary: boolean) => (
    <FightButton
      testID="summary-watch-film"
      variant={primary ? "primary" : "secondary"}
      label={watchLabel}
      disabled={uploadBusy}
      onPress={watch}
      icon={(c) => <Film size={16} color={c} />}
      trailing={uploadBusy && !primary ? <Mono color={p.amber}>PROCESSING</Mono> : undefined}
    />
  );

  return (
    <View style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}>
      <ThemedStatusBar overMedia={!!videos.posterUrl && !pastHero} />
      <VerdictHero
        matchType={matchType}
        posterUrl={videos.posterUrl}
        posterKey={videos.posterKey}
        left={outcome === "loss" ? opponent.display_name : me.display_name}
        right={outcome === "loss" ? me.display_name : opponent.display_name}
        upload={upload}
        filmExpected={filmExpected}
        topInset={insets.top}
      />
      {win ? <Confetti /> : null}
      <View style={{ paddingHorizontal: 16, marginTop: videos.posterUrl ? -72 : 24, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <SlamIn animate={win}>
            <Text testID="summary-verdict" className="font-display" style={{ fontSize: win ? 96 : 80, lineHeight: win ? 88 : 72, letterSpacing: 1, color: verdictColor }}>
              {verdict}
            </Text>
          </SlamIn>
          {how ? (
            <Text className="font-body-medium" style={{ fontSize: 16, color: win ? p.text : p.text2 }}>
              {loss ? `${how} · vs ${oppShort}` : how}
            </Text>
          ) : null}
          {loss && how ? null : <Mono size={11} spacing={1.68}>{`VS ${oppShort.toUpperCase()}`}</Mono>}
          {disputed ? (
            <Text testID="summary-disputed-note" className="font-body" style={{ fontSize: 14, color: p.text2 }}>
              An admin will review it. Your rating change stands until they do.
            </Text>
          ) : null}
        </View>

        {ranked && eloAfter != null ? (
          <RatingBlock
            before={eloBefore}
            after={eloAfter}
            delta={eloDelta}
            ratingNode={<TickingRating before={disputed ? null : eloBefore} after={eloAfter} />}
            deltaNode={
              eloDelta != null && eloDelta !== 0 ? (
                <Text testID="summary-elo-delta" className="font-mono-bold" style={[{ fontSize: 26, color: outcome === "draw" ? p.amber : deltaColor(eloDelta, p) }, TABULAR]}>
                  {formatSignedDelta(eloDelta)}
                </Text>
              ) : null
            }
          />
        ) : null}

        {rankText ? (
          <RiseIn>
            <View
              testID="verdict-rank-strip"
              style={{ height: 40, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: p.winRule, borderRadius: FIGHT_RADIUS.plate }}
            >
              <TrendingUp size={16} color={p.win} />
              <Mono size={11} spacing={1.68} color={p.text}>
                {rankText}
              </Mono>
            </View>
          </RiseIn>
        ) : null}

        {gap > 0 ? (
          <Mono size={10} spacing={1.2}>{`${gap} weight ${gap > 1 ? "classes" : "class"} apart. Heavier athlete’s ELO was adjusted.`}</Mono>
        ) : null}

        {upload.kind !== "hidden" ? <UploadProgressBanner {...upload} /> : null}

        {loss ? (
          <Text className="font-body" style={{ fontSize: 15, color: p.text }}>
            Run it back?
          </Text>
        ) : null}

        <View style={{ gap: 12 }}>
          {loss ? (
            <>
              {rematchButton(true)}
              {watchButton(false)}
              <FightButton testID="summary-exit" variant="ghost" label={exitLabel} onPress={back} height={44} />
            </>
          ) : (
            <>
              {watchButton(true)}
              <FightButton testID="summary-exit" variant="secondary" label={exitLabel} onPress={back} />
              {disputed ? null : (
                <View style={{ flexDirection: "row", gap: 12 }}>
                  {rematchButton(false)}
                  {outcome ? (
                    <FightButton
                      testID="summary-share"
                      variant="ghost"
                      label="Share match"
                      onPress={() => void share()}
                      height={44}
                      icon={(c) => <Share2 size={16} color={c} />}
                      style={{ flex: 1, paddingHorizontal: 4 }}
                    />
                  ) : null}
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );
}
