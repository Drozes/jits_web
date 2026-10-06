import * as React from "react";
import { AccessibilityInfo, ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { NO_MATCH_COPY, angleSyncExact, buildKeyMoments, formatClock, isNoMatch, translateAngleTime } from "@jits/shared/utils";
import { HarnessMarker } from "@/components/match-detail/harness-marker";
import { useSuppressUploadStrip } from "@/lib/video/upload-strip-visibility";
import { VideoStatePanel } from "@/components/match-detail/video-state-panel";
import { ForceDarkTheme } from "@/lib/theme/force-dark-theme";
import { FilmScrim } from "@/components/film-room/film-scrim";
import { FilmBackButton } from "@/components/film-room/film-back-button";
import { AngleSwitcher, angleText, type AngleOption } from "@/components/film-room/angle-switcher";
import { SwitchOverlay } from "@/components/film-room/switch-overlay";
import { AngleViewStack } from "@/components/film-room/angle-view-stack";
import { SyncingPill } from "@/components/film-room/syncing-pill";
import { SeekBar } from "@/components/film-room/seek-bar";
import { Transport, nextSpeed } from "@/components/film-room/player-controls";
import { MomentStepper } from "@/components/film-room/moment-stepper";
import { playbackAngleOf } from "@/lib/video/playback-angle";
import { isMultiAnglePlayerEnabled } from "@/lib/video/multi-angle/flag";
import { MultiAnglePlayerBody } from "@/components/film-room/multi-angle/multi-angle-player-body";
import { useVideoPlayback, type SwitchState } from "@/lib/match-detail/use-video-playback";
import { useMatchDetail } from "@/lib/match-detail/use-match-detail";
import { useAngleAnalyses } from "@/lib/film-room/use-angle-analyses";
import { useReduceMotion } from "@/lib/motion";
import { ANGLE_LABEL, couldNotLoadAngle, switchAnnouncement } from "@/lib/video/video-status-copy";
import { shortName } from "@/lib/film-room/format";
import { ON_MEDIA } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";

/** A moment stays "current" (chip lit) this long after its time. */
const CURRENT_HOLD_S = 10;

/**
 * Full-screen playback of one match video with the Film Room controls: seek
 * bar with a marker per key moment, the key moment stepper (times only), ±10 s, speed, and the angle switcher when both athletes recorded.
 * `?t=<seconds>` starts playback there (key moments link in with it).
 *
 * An angle switch keeps the screen and the telemetry session; the route
 * params follow along (`setParams`) only so the URL names what is on screen;
 * nothing is keyed on them. The engine (`playback.switchState.mode`) runs it
 * one of two ways:
 *
 * - keep_watching (jits-xfvd.19): the outgoing angle keeps playing, with its
 *   audio, while the new one loads in the second player underneath and gets
 *   in step; then `AngleViewStack` crossfades (dips, for an approximate
 *   angle). The bottom cluster (clock, seek bar, key moments) is live and
 *   flips at the crossfade, with the route. An abandoned switch leaves the
 *   outgoing angle playing and, for a failure, shows the "Could not load" tag.
 * - in_place (jits-xfvd.16, the fallback): a still of the outgoing frame
 *   covers the player (`SwitchOverlay`) while the one player loads the new
 *   angle, the bottom cluster holds the outgoing angle as it was at the tap,
 *   and a failed switch returns to the previous angle with the tag.
 *
 * Either way every angle chip is LOCKED from the tap until the switch lands
 * and settles or is abandoned: the tapped chip is selected and busy, the
 * others disabled and dimmed, and their taps are only counted in telemetry.
 * "Syncing angle" shows after 200 ms (`SyncingPill`).
 *
 * `useVideoPlayback` signs a 1-hour URL (normalized MP4 preferred), re-signs
 * silently once when the player errors and resumes where it was. The player is
 * expo-video (jits-n2im.19), linked in the field build since the reels, so
 * this screen ships over OTA (no new native module). The poster covers the
 * frame until the current item has drawn one. Each viewing session sends one
 * playback telemetry event (jits-n2im.21).
 *
 * The `video-player-state` marker exposes the phase to the match-loop harness
 * as "Video state: <state>".
 */
export default function MatchVideoScreen() {
  const { id, t, approx } = useLocalSearchParams<{ id: string; t?: string; approx?: string }>();
  const start = t != null && Number.isFinite(Number(t)) ? Number(t) : null;
  // Full-screen video: no app-wide upload strip over it (jits-n2im.2).
  useSuppressUploadStrip({ kind: "all" });
  // The multi-angle player (one player per angle) is a dev-flag prototype.
  if (isMultiAnglePlayerEnabled()) return <MultiAnglePlayerBody id={id} start={start} />;
  // NOT keyed by id: an angle switch must keep the screen and the player.
  return <PlayerBody id={id} start={start} approximate={approx === "1"} />;
}


/** How long the "not synced" note stays up after an angle switch lands. */
const APPROX_NOTE_MS = 5000;
/** How long the "Could not load" tag stays up after a failed switch (contract 4.6). */
const FAILURE_TAG_MS = 4000;

/** What the bottom cluster shows while a switch is pending: the outgoing angle at the tap. */
interface ChromeSnapshot {
  id: string;
  positionS: number;
  durationS: number;
  /** The outgoing angle's exact time at the tap, for the route on a restore. */
  fromT: number;
  /** The route's `approx` for the outgoing angle. */
  approx: "0" | "1";
}

/** "Your angle" / "M. Park's angle": an angle as a heading (the landing announcement). */
function angleHeading(v: AngleOption | undefined, opponentName?: string | null): string {
  return v ? angleText(v, opponentName) : "Angle";
}

/** "your angle" / "M. Park's angle": an angle mid-sentence (the failure tag). */
function angleRef(v: AngleOption | undefined, opponentName?: string | null): string {
  if (!v) return "that angle";
  return v.is_mine ? ANGLE_LABEL.mineRef : angleText(v, opponentName);
}

function PlayerBody({ id, start, approximate }: { id: string | undefined; start: number | null; approximate: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const playback = useVideoPlayback(id, start);
  const { phase, source, stateLabel, retry, positionS, durationS, playing, seek, toggle, telemetry } = playback;
  const sw = playback.switchState;
  const activeId = playback.activeId;
  const details = useMatchDetail(source?.matchId ?? undefined);
  // The note's start time: an approximate switch landing restarts its 5 s.
  const [approxAt, setApproxAt] = React.useState<number | null>(approximate ? Date.now() : null);
  // A note that follows a switch landing is already spoken by the landing
  // announcement: only the note of an open with ?approx=1 is a live region
  // (otherwise Android reads it twice).
  const [approxLive, setApproxLive] = React.useState(approximate);
  // The Syncing pill is on screen (including its fade-out). The note waits
  // for it to go, so the two never overlap in their shared slot, and its 5 s
  // start when it appears (P-AS-01/04).
  const [pillUp, setPillUp] = React.useState(false);
  const [noteQueued, setNoteQueued] = React.useState(false);
  React.useEffect(() => {
    if (!noteQueued || pillUp) return;
    setNoteQueued(false);
    setApproxLive(false);
    setApproxAt(Date.now());
  }, [noteQueued, pillUp]);
  const showApprox = approxAt != null && sw.phase !== "pending" && !pillUp;

  React.useEffect(() => {
    if (approxAt == null) return;
    const timer = setTimeout(() => setApproxAt(null), APPROX_NOTE_MS);
    return () => clearTimeout(timer);
  }, [approxAt]);

  const duration = durationS || source?.durationSeconds || 0;
  const view = details.state === "ready" ? details.data : null;
  // One telemetry session per screen: its angle is the one it opened on.
  const entryId = playback.entryId;
  // An outside navigation reusing the screen starts its own note state
  // from its own `approx` param (review m2).
  const approxEntryRef = React.useRef(entryId);
  React.useEffect(() => {
    if (approxEntryRef.current === entryId) return;
    approxEntryRef.current = entryId;
    setApproxLive(approximate);
    setApproxAt(approximate ? Date.now() : null);
  }, [entryId, approximate]);
  const entryAngle = view?.videos.find((v) => v.id === entryId);
  const angleMeta = entryAngle ? playbackAngleOf(entryAngle) : null;
  const angleCount = view ? view.videos.length : null;
  React.useEffect(() => {
    if (angleMeta) telemetry.setMeta({ angle: angleMeta, angleCount });
  }, [telemetry, angleMeta, angleCount]);
  // Sign every other playable angle as soon as the match is known, so a
  // switch does not wait on the sign round trip.
  const playableIds = view
    ? view.videos.filter((v) => v.playability == null || v.playability === "playable").map((v) => v.id).join(",")
    : "";
  const { presign } = playback;
  React.useEffect(() => {
    if (playableIds) presign(playableIds.split(","));
  }, [presign, playableIds]);
  // Every angle's breakdown is read up front (the one on screen first, even
  // before the match loads), so the chrome swaps in one render at landing.
  const analysisIds = React.useMemo(
    () => [activeId ?? "", ...(playableIds ? playableIds.split(",") : [])].filter(Boolean),
    [activeId, playableIds],
  );
  const analyses = useAngleAnalyses(analysisIds);

  // While an in_place switch is pending, the bottom cluster stays on the
  // outgoing angle as it was at the tap (contract 06 4.5); it swaps to the
  // new angle's live values in one render at landing. A keep-watching switch
  // needs no snapshot: activeId and the front player stay on the outgoing
  // angle until the crossfade, so the live chrome flips there (contract 07
  // D1). The transport stays live.
  const [snapshot, setSnapshot] = React.useState<ChromeSnapshot | null>(null);
  // The route's `approx` for each angle this screen switched to, so a restore
  // to a superseded switch's angle puts back what the route said for it.
  const approxByIdRef = React.useRef<Record<string, "0" | "1">>({});
  const frozen = sw.phase === "pending" && sw.mode !== "keep_watching" ? snapshot : null;
  // The lock (owner 2026-10-06): no chip switches from the tap until idle.
  const locked = sw.phase !== "idle";
  // The route follows activeId: at the tap for in_place (activeId moves
  // there, with the tap's time), at the crossfade for keep_watching (with the
  // landed time). An abandoned switch never moves it. The pending move is
  // keyed by the seq the tap's switch gets (the engine's seq + 1) and the
  // screen's entry, so it can never apply to another switch or recording.
  const routeRef = React.useRef<{ id: string; t: number; approx: "0" | "1"; seq: number; entryId: string | undefined } | null>(null);
  const { currentTimeNow } = playback;
  const failedSeq = sw.failed?.seq ?? null;
  React.useEffect(() => {
    const next = routeRef.current;
    if (!next) return;
    // Another recording opened, or a later switch began: this move is stale.
    if (entryId !== next.entryId || sw.seq > next.seq) {
      routeRef.current = null;
      return;
    }
    // The tap's switch has not reached the state yet (or was rejected).
    if (sw.seq < next.seq) return;
    if (activeId === next.id) {
      routeRef.current = null;
      const at = sw.mode === "keep_watching" ? currentTimeNow() : next.t;
      router.setParams({ id: next.id, t: at.toFixed(3), approx: next.approx });
      return;
    }
    // Ended without activeId reaching the target (abandoned or failed, even
    // pending to idle in one batch): the route stays.
    if (sw.phase === "idle" || failedSeq === next.seq) routeRef.current = null;
  }, [activeId, sw.seq, sw.phase, sw.mode, failedSeq, entryId, currentTimeNow, router]);
  const chromeId = frozen ? frozen.id : activeId;
  const chromePositionS = frozen ? frozen.positionS : positionS;
  const chromeDuration = frozen ? frozen.durationS : duration;
  const analysis = analyses.analysisFor(chromeId);

  // A video with no match in it has no moments to mark (jr_be-0qf).
  const noMatch = isNoMatch(analysis);
  const moments = React.useMemo(
    () => (analysis && !noMatch ? buildKeyMoments(analysis, view?.match ?? null, chromeDuration || null) : []),
    [analysis, noMatch, view?.match, chromeDuration],
  );
  const current = [...moments].reverse().find((m) => m.t <= chromePositionS + 0.25 && chromePositionS - m.t < CURRENT_HOLD_S);

  const angleOf = (videoId: string | null | undefined) => view?.videos.find((v) => v.id === videoId);
  const opponentName = view?.opponent?.display_name;
  const failureTag = useSwitchFeedback(sw, phase === "failed", {
    headingOf: (videoId) => angleHeading(angleOf(videoId), opponentName),
    refOf: (videoId) => angleRef(angleOf(videoId), opponentName),
    onApproximateLanding: () => setNoteQueued(true),
    onRestore: (restoreId) => {
      // The hook returned to the previous angle without touching the route:
      // put the route back on it (contract 3.5, 4.6). After a superseded
      // switch (A to B pending, then C fails) the angle returned to is B, not
      // the tap snapshot's A: take a fresh snapshot of B at the restore time,
      // so the frozen chrome and the route both say B.
      let snap = snapshot;
      if (!snap || snap.id !== restoreId) {
        const t = playback.currentTimeNow();
        snap = { id: restoreId, positionS: t, durationS: duration, fromT: t, approx: approxByIdRef.current[restoreId] ?? "0" };
        setSnapshot(snap);
      }
      router.setParams({ id: restoreId, t: snap.fromT.toFixed(3), approx: snap.approx });
    },
  });
  const onPillShown = React.useCallback(() => telemetry.switchPillShown(), [telemetry]);

  const title = view
    ? `${shortName(view.me.display_name)} vs ${shortName(view.opponent?.display_name)}`
    : "Match film";

  const topBar = (
    <View className="flex-row items-center" style={{ position: "absolute", left: 4, right: 16, top: insets.top + 8, height: 44, gap: 6 }}>
      <FilmBackButton label="Go back" icon="close" fallback="/" color={ON_MEDIA.white} />
      <Text numberOfLines={1} className="flex-1 font-heading uppercase" style={[typeStep("callout"), { letterSpacing: TRACKING.caps, color: ON_MEDIA.white }]}>
        {title}
      </Text>
    </View>
  );

  return (
    // Full-screen video: dark in both app themes. ForceDarkTheme pins the
    // themed pieces drawn over it (VideoStatePanel) to the dark tokens.
    <ForceDarkTheme style={{ backgroundColor: ON_MEDIA.black }}>
      <StatusBar style="light" />
      {phase === "ready" && source ? (
        <>
          {/* The row read and the sign both succeeded, so the recording
              exists: a player error is an expired URL or the network
              (useVideoPlayback re-signs). */}
          <AngleViewStack
            players={playback.players}
            frontSlot={playback.frontSlot}
            switchState={sw}
            onSlotFirstFrame={playback.onSlotFirstFrame}
            posterUrl={source.posterUrl ?? null}
            frameShown={playback.frameShown}
            reduceMotion={reduceMotion}
          />
          {/* In_place only: the outgoing frame, held while the next angle loads (jits-xfvd.16). */}
          <SwitchOverlay switchState={sw} reduceMotion={reduceMotion} />
          <FilmScrim stops={[[0, 0.75], [1, 0]]} style={{ left: 0, right: 0, top: 0, height: insets.top + 150 }} />
          <FilmScrim stops={[[0, 0], [1, 0.9]]} style={{ left: 0, right: 0, bottom: 0, height: "45%" }} />
          {topBar}
          {view && view.videos.length > 1 && activeId ? (
            <View style={{ position: "absolute", left: 16, right: 16, top: insets.top + 60 }}>
              <AngleSwitcher
                variant="film"
                angles={view.videos}
                activeId={activeId}
                opponentName={opponentName}
                // The tapped angle while pending (an in_place restore: the
                // angle coming back); during the landing the landed one is
                // selected and the rest stay locked until idle (D4).
                busyId={sw.phase === "pending" ? sw.targetId : null}
                locked={locked}
                onIgnoredTap={telemetry.switchTapIgnored}
                onSelect={(other) => {
                  if (other === activeId) return;
                  // Defensive: the switcher never selects while locked.
                  if (locked) {
                    telemetry.switchTapIgnored();
                    return;
                  }
                  // Offsets come with the match (get_match_details, jr_be
                  // 20261005100400; primary = 0). The position is the
                  // player's own, carried in fractional seconds: flooring it
                  // threw away up to 999 ms of a 20 to 40 ms audio sync.
                  // Exact only when both ends are the primary or audio
                  // matched: a clock offset can be seconds out.
                  const from = view.videos.find((v) => v.id === activeId);
                  const to = view.videos.find((v) => v.id === other);
                  const fromT = playback.currentTimeNow();
                  const moved = translateAngleTime(fromT, from?.sync_offset_ms, to?.sync_offset_ms);
                  const exact = moved.synced && angleSyncExact(from) && angleSyncExact(to);
                  // The frozen chrome if the engine runs this switch in_place.
                  setSnapshot({ id: activeId, positionS, durationS: duration, fromT, approx: approximate ? "1" : "0" });
                  approxByIdRef.current[other] = exact ? "0" : "1";
                  // The route moves when activeId does (the effect above).
                  routeRef.current = { id: other, t: moved.t, approx: exact ? "0" : "1", seq: sw.seq + 1, entryId };
                  // The offsets let the engine map the two angles' times
                  // continuously (keep_watching); without them it runs in_place.
                  playback.switchAngle(other, moved.t, {
                    approximate: !exact,
                    offsets: { fromMs: from?.sync_offset_ms ?? null, toMs: to?.sync_offset_ms ?? null },
                  });
                  // The note shows when an approximate switch lands, not at the tap.
                  setApproxAt(null);
                  setNoteQueued(false);
                }}
              />
            </View>
          ) : null}
          {/* One slot under the switcher (insets.top + 112): the Syncing pill,
              the failure tag or the approximate note, never two at once. The
              note waits for the pill's fade-out; a failure removes the pill
              at once and shows the tag from the moment of failure. */}
          <View testID="player-switch-slot" pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, top: insets.top + 112, alignItems: "center" }}>
            {failureTag ? (
              <View testID="player-switch-failed">
                <Text className="font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING.caps, color: ON_MEDIA.text2, backgroundColor: ON_MEDIA.badge, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2 }, TABULAR]}>
                  {failureTag}
                </Text>
              </View>
            ) : showApprox ? (
              <View testID="player-approx-note" accessibilityLiveRegion={approxLive ? "polite" : "none"}>
                <Text className="font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING.caps, color: ON_MEDIA.text2, backgroundColor: ON_MEDIA.badge, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2 }, TABULAR]}>
                  Angles aren't synced; position is approximate
                </Text>
              </View>
            ) : null}
            <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, alignItems: "center" }}>
              <SyncingPill switchState={sw} reduceMotion={reduceMotion} onShown={onPillShown} onVisibleChange={setPillUp} />
            </View>
          </View>
          <View style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 24, gap: 14 }}>
            {noMatch ? (
              <View testID="player-no-match" className="self-start" style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 2, backgroundColor: ON_MEDIA.badge, maxWidth: "100%" }}>
                <Text className="font-body-medium" style={[typeStep("body"), { lineHeight: 16, color: ON_MEDIA.text }]}>
                  {NO_MATCH_COPY.short}
                </Text>
              </View>
            ) : null}
            <View style={{ gap: 6 }}>
              <SeekBar positionS={chromePositionS} durationS={chromeDuration} moments={moments} onSeek={seek} />
              <View className="flex-row justify-between">
                <Text testID="player-time" className="font-mono-bold" style={[typeStep("small"), { color: ON_MEDIA.white }, TABULAR]}>
                  {`${formatClock(chromePositionS)} / ${formatClock(chromeDuration)}`}
                </Text>
                {moments.length > 0 ? (
                  <Text className="font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: ON_MEDIA.text2 }, TABULAR]}>
                    {`${moments.length} KEY MOMENT${moments.length === 1 ? "" : "S"}`}
                  </Text>
                ) : null}
              </View>
            </View>
            <Transport playing={playing} speed={playback.rate} onToggle={toggle} onSkip={(d) => seek(positionS + d)} onSpeed={() => playback.setRate(nextSpeed)} />
            <MomentStepper moments={moments} positionS={chromePositionS} currentT={current?.t ?? null} onJump={(tt) => { seek(tt); playback.setPlaying(true); }} />
          </View>
        </>
      ) : phase === "loading" || phase === "ready" ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={ON_MEDIA.text2} />
          {topBar}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <VideoStatePanel kind={phase} onRetry={retry} onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
          {topBar}
        </View>
      )}
      <HarnessMarker testID="video-player-state" label={`Video state: ${stateLabel}`} />
    </ForceDarkTheme>
  );
}

/**
 * The screen's side of an angle switch's state changes (contract 4.5, 4.6),
 * each once per switch (seq):
 * - landing of a switch (not a restore): one announcement; an approximate
 *   one also queues the 5 s note (shown once the Syncing pill is gone);
 * - a restore after a failure: the route goes back to the restored angle;
 * - a failure: one announcement and the "Could not load" tag, for
 *   `FAILURE_TAG_MS` from the failure (gone at once on the next switch).
 * Returns the failure tag's text while it is up, else null.
 */
function useSwitchFeedback(
  sw: SwitchState,
  playbackFailed: boolean,
  on: {
    headingOf: (videoId: string | null) => string;
    refOf: (videoId: string) => string;
    onApproximateLanding: () => void;
    onRestore: (restoreId: string) => void;
  },
): string | null {
  const onRef = React.useRef(on);
  onRef.current = on;
  const landedSeqRef = React.useRef(0);
  const restoredSeqRef = React.useRef(0);
  const failedSeqRef = React.useRef(0);
  const [tag, setTag] = React.useState<{ seq: number; text: string; until: number } | null>(null);

  React.useEffect(() => {
    if (sw.phase !== "landing" || landedSeqRef.current === sw.seq) return;
    landedSeqRef.current = sw.seq;
    // A restore landing is the old angle coming back: the failure already spoke.
    if (sw.restoring || sw.failed?.seq === sw.seq) return;
    if (sw.approximate) onRef.current.onApproximateLanding();
    AccessibilityInfo.announceForAccessibility(switchAnnouncement(onRef.current.headingOf(sw.targetId), sw.approximate));
  }, [sw.phase, sw.seq, sw.restoring, sw.failed, sw.approximate, sw.targetId]);

  React.useEffect(() => {
    if (!sw.restoring || !sw.targetId || restoredSeqRef.current === sw.seq) return;
    restoredSeqRef.current = sw.seq;
    onRef.current.onRestore(sw.targetId);
  }, [sw.restoring, sw.targetId, sw.seq]);

  const failed = sw.failed;
  React.useEffect(() => {
    if (!failed || failedSeqRef.current === failed.seq) return;
    // The restore failed too: the retry panel replaces the player, so the
    // tag is neither shown nor spoken.
    if (playbackFailed) return;
    failedSeqRef.current = failed.seq;
    const until = failed.at + FAILURE_TAG_MS;
    if (until <= Date.now()) return;
    const text = couldNotLoadAngle(onRef.current.refOf(failed.targetId));
    AccessibilityInfo.announceForAccessibility(text);
    setTag({ seq: failed.seq, text, until });
  }, [failed, playbackFailed]);

  React.useEffect(() => {
    if (!tag) return;
    const timer = setTimeout(() => setTag(null), Math.max(0, tag.until - Date.now()));
    return () => clearTimeout(timer);
  }, [tag]);

  return tag && failed?.seq === tag.seq && !playbackFailed ? tag.text : null;
}
