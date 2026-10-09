import * as React from "react";
import { Share, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Film, Share2, TrendingUp, UserPlus } from "lucide-react-native";
import type { Href } from "expo-router";
import { useInvitesEnabled } from "@/lib/invites/use-invites-enabled";
import { toast } from "@/components/ui/toast";
import { exitMatchTo } from "@/lib/match-flow/exit-to";
import { matchDetailHref } from "@/lib/match-detail/href";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
import { useMatchSyncContext, useStepMatchSync } from "@/lib/match-flow/match-sync-context";
import { rankStripText, useRankChange, useVerdictVideos } from "@/lib/match-flow/use-verdict-data";
import type { UploadBannerState } from "@/lib/video/upload-banner-state";
import { isTerminalUploadClass } from "@/lib/video/upload-errors";
import { useUploadActions } from "@/lib/video/use-upload-actions";
import { showRecorderBanner } from "@/lib/video/upload-banner-state";
import { buildShareText, buildShareUrl } from "@jits/shared/utils";
import { UploadProgressBanner } from "../upload-progress-banner";
import { usePalette } from "@/lib/theme/palette";
import { typeSize, typeStep } from "@/lib/typography";
import { FIGHT_RADIUS } from "../fight/fight-tokens";
import { FightButton, Mono, shortName } from "../fight/fight-ui";
import { Confetti, RiseIn, SlamIn } from "./celebration";
import { RatingMoment } from "./rating-moment";
import { isResultFresh, usePlayOnce } from "@/components/ui/elo-system/play-once";
import { HERO_HEIGHT, VerdictHero } from "./verdict-hero";
import { ThemedStatusBar } from "@/lib/theme/themed-status-bar";
import { useScrolledPast } from "../wizard-scroll";
import { SummaryHighlightNote } from "../steps/summary-highlight-note";
import { VerdictAngleRows } from "./verdict-angle-rows";
import { FilmStatusPlate } from "@/components/video-status/film-status-plate";
import { useFilmStatus } from "@/lib/video/use-film-status";
import { useSuppressUploadStrip } from "@/lib/video/upload-strip-visibility";
import { HERO_CAPTION } from "@/lib/video/video-status-copy";
import { videoHref } from "@/lib/film-room/href";
import { noteRatingWatched } from "@/lib/rating/header-elo";

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
  /**
   * The result's type when known (the broadcast or the reconciler); else
   * a named submission counts as one.
   */
  resultType?: "submission" | "draw" | null;
  /** `matches.completed_at`: an old result does not celebrate. */
  completedAt?: string | null;
}

/**
 * Step 8, the verdict. A win celebrates (confetti, the verdict slams in, the
 * rating rolls, the rank strip rises); a loss is calm. Every outcome gets
 * the same actions (P-Verdict, jits-02vo.8): Watch film, Back to Arena, and
 * Share match as one full-width tertiary row. Running it back is an
 * ordinary Arena challenge, never a shortcut here. The opening still (or the
 * athletes, until it exists) as the hero; this phone's upload as a card.
 *
 * A recorder reaches this before the opponent has confirmed (auto-confirm,
 * B2), and the opponent may still dispute. So the verdict listens for
 * match_disputed and, while the opponent's confirmation is missing on a
 * completed match, re-reads the match on a bounded poll; a dispute turns it
 * into the calm DISPUTED verdict (no celebration, no rank strip).
 */
export function VerdictStep(props: VerdictStepProps) {
  const p = usePalette();
  const { matchId, exitHref, exitLabel, matchStatus, outcome, me, opponent, submissionName, finishTimeSeconds, upload, uploadedVideoId, confirmedAthleteIds = [], resultType = null, completedAt = null } = props;
  const router = useRouter();
  const invitesOn = useInvitesEnabled();
  const insets = useSafeAreaInsets();
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

  const win = !disputed && outcome === "win";

  // The whole celebration (confetti, slam, roll, tap, rank strip) plays ONCE
  // per result: the first time this match's verdict is seen, on any launch,
  // and only while the result is fresh (decided here, on mount).
  const play = usePlayOnce(`verdict:${matchId}`, !disputed && isResultFresh(matchId, completedAt));
  const submission = resultType != null ? resultType === "submission" : submissionName != null;
  const loss = !disputed && outcome === "loss";

  const videos = useVerdictVideos(matchId, me.athlete_id, uploadedVideoId);
  // The Film block (jits-n2im.25): the same plate and strings as match
  // detail. It replaces the upload card, the angle rows and the highlight
  // note; the wave 2 pieces stand in only while the status is unavailable.
  const filmStatus = useFilmStatus(matchId, me.athlete_id, videos.playable);
  const fsView = filmStatus.view;
  useSuppressUploadStrip({ kind: "match", matchId });
  const rank = useRankChange(matchId, win);
  const rankText = win ? rankStripText(rank, shortName) : null;

  // Every match is ranked (casual was retired).
  const eloBefore = me.elo_before ?? null;
  // The stamped post-match rating only: before the refresh lands,
  // current_elo is still the PRE-match rating and would read as no change.
  const eloAfter = me.elo_after ?? null;
  const eloDelta = me.elo_delta ?? null;
  const gap = me.weight_division_gap ?? 0;
  // The athlete saw this rating land here: the header does not roll it again
  // when the auth row catches up after the exit (jits-1ez5.4).
  React.useEffect(() => {
    if (eloAfter != null && !disputed) noteRatingWatched(me.athlete_id, eloAfter);
  }, [me.athlete_id, eloAfter, disputed]);

  const verdict = disputed ? "DISPUTED" : win ? "YOU WON" : loss ? "YOU LOST" : outcome === "draw" ? "DRAW" : "MATCH RECORDED";
  const verdictColor = outcome === "draw" && !disputed ? p.amber : p.text;
  const how = [submissionName ? `by ${submissionName}` : null, finishTimeSeconds != null ? formatElapsed(finishTimeSeconds) : null]
    .filter(Boolean)
    .join(" \u00b7 ");
  const oppShort = shortName(opponent.display_name);

  const uploadBusy = upload.kind === "uploading" || upload.kind === "stopping";
  // A paused or failed UPLOAD (not a recorder failure, which has no class)
  // can still deliver the film: it is expected, never "no film" (jits-n2im.4
  // item 3). A terminal one cannot, so it is not.
  const uploadOwed =
    upload.kind === "paused" || (upload.kind === "error" && upload.errorClass != null && !isTerminalUploadClass(upload.errorClass));
  const hasServerVideo = videos.hasVideo || uploadedVideoId != null;
  const filmExpected = hasServerVideo || uploadBusy || uploadOwed || (fsView != null && fsView.phase !== "no_film" && fsView.rows.length > 0);
  const statusCaption = fsView
    ? fsView.phase === "no_film"
      ? HERO_CAPTION.noFilm
      : fsView.phaseKey === "no_video_yet"
        ? HERO_CAPTION.noVideoYet
        : null
    : null;
  // Deck rule 4 (overrides the bead's "disabled while uploading"): nothing
  // offers playback of an angle that is not ready. "Open match" (always
  // enabled: the match page has the upload card and its Try again) until an
  // angle can play, then "Watch film".
  // Rule 4 reads PLAYABLE (coordinator 2026-10-05): Watch film as soon as an
  // angle has bytes the player can open, the same set the Film block plays.
  const canWatch = fsView ? fsView.playableVideoIds.length > 0 : videos.hasPlayable;
  const watchLabel = canWatch ? "Watch film" : "Open match";
  const uploadActions = useUploadActions(matchId);
  const watch = () => router.push(matchDetailHref(matchId));
  const back = () => exitMatchTo(router, exitHref);

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


  return (
    <View style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}>
      <ThemedStatusBar overMedia={!!videos.posterUrl && !pastHero} />
      <VerdictHero
        posterUrl={videos.posterUrl}
        posterKey={videos.posterKey}
        left={outcome === "loss" ? opponent.display_name : me.display_name}
        right={outcome === "loss" ? me.display_name : opponent.display_name}
        upload={upload}
        filmExpected={filmExpected}
        hasServerVideo={hasServerVideo}
        statusCaption={statusCaption}
        topInset={insets.top}
      />
      {win ? <Confetti play={play} /> : null}
      <View style={{ paddingHorizontal: 16, marginTop: videos.posterUrl ? -72 : 24, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <SlamIn animate={win && play}>
            <Text testID="summary-verdict" className="font-display" style={[
                typeSize(win ? "display-96" : "display-80"),
                // The SlamIn verdict (Adding Flare) keeps its tuned line box and 1px tracking.
                { lineHeight: win ? 88 : 72, letterSpacing: 1, color: verdictColor },
              ]}>
              {verdict}
            </Text>
          </SlamIn>
          {how ? (
            <Text className="font-body-medium" style={[typeStep("subhead"), { color: win ? p.text : p.text2 }]}>
              {loss ? `${how} · vs ${oppShort}` : how}
            </Text>
          ) : null}
          {loss && how ? null : <Mono size="caption" spacing="caps-l">{`VS ${oppShort.toUpperCase()}`}</Mono>}
          {disputed ? (
            <Text testID="summary-disputed-note" className="font-body" style={[typeStep("callout"), { color: p.text2 }]}>
              An admin will review it. Your rating change stands until they do.
            </Text>
          ) : null}
        </View>

        {eloAfter != null ? (
          <RatingMoment
            play={play}
            outcome={outcome}
            disputed={disputed}
            submission={submission}
            before={eloBefore}
            after={eloAfter}
            delta={eloDelta}
          />
        ) : null}

        {rankText ? (
          <RiseIn play={play}>
            <View
              testID="verdict-rank-strip"
              style={{ height: 40, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: p.winRule, borderRadius: FIGHT_RADIUS.plate }}
            >
              <TrendingUp size={16} color={p.win} />
              <Mono size="caption" spacing="caps-l" color={p.text}>
                {rankText}
              </Mono>
            </View>
          </RiseIn>
        ) : null}

        {gap > 0 ? (
          <Mono size="micro" spacing="caps">{`${gap} weight ${gap > 1 ? "classes" : "class"} apart. Heavier athlete’s ELO was adjusted.`}</Mono>
        ) : null}

        {fsView ? (
          <>
            {/* Recorder-only states the Film block has no row for: the
                camera still finishing, a camera failure, a short clip. */}
            {showRecorderBanner(upload) ? <UploadProgressBanner {...upload} onRetry={uploadActions.retry} onDiscard={uploadActions.discard} /> : null}
            <FilmStatusPlate matchId={matchId} view={fsView} variant="verdict" testID="verdict-film" onWatch={(id) => router.push(videoHref(id))} />
          </>
        ) : (
          <>
            {upload.kind !== "hidden" ? (
              <UploadProgressBanner {...upload} onRetry={uploadActions.retry} onDiscard={uploadActions.discard} />
            ) : null}

            {/* The other athlete's angle, live (jits-n2im.12). */}
            <VerdictAngleRows videos={videos.others} opponentName={opponent.display_name} />

            {/* A reel is on its way when THIS phone's clip landed or is still
                uploading (spec 015 section 16.6.4; the pre-redesign summary's
                videoId || videoPending). Not on a disputed result: the match is
                under admin review, so no reel is promised. */}
            <SummaryHighlightNote hasVideo={(uploadedVideoId != null || uploadBusy || uploadOwed) && !disputed} />
          </>
        )}

        <View style={{ gap: 12 }}>
          <FightButton
            testID="summary-watch-film"
            variant="primary"
            label={watchLabel}
            onPress={watch}
            // "Open match" carries no film icon (deck nit 2).
            icon={canWatch ? (c) => <Film size={16} color={c} /> : undefined}
          />
          <FightButton testID="summary-exit" variant="secondary" label={exitLabel} onPress={back} />
          {outcome && !disputed ? (
            <FightButton
              testID="summary-share"
              variant="ghost"
              label="Share match"
              onPress={() => void share()}
              height={44}
              icon={(c) => <Share2 size={16} color={c} />}
            />
          ) : null}
          {/* Invites (jr_be spec 016): leaves the match like every exit. */}
          {invitesOn && outcome && !disputed ? (
            <FightButton
              testID="summary-invite"
              variant="ghost"
              label="Know someone who'd beat you? Invite them."
              onPress={() => exitMatchTo(router, "/invite?from=verdict" as Href)}
              height={44}
              icon={(c) => <UserPlus size={16} color={c} />}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}
