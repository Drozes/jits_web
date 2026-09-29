/**
 * The live incoming challenge prompt.
 *
 * A bottom sheet rather than a plate in the list: it has to be answerable
 * wherever the athlete happens to be, on any tab, because being live persists
 * across the app. Mounted once, app-wide, by `<ArenaBootstrap />`.
 *
 * It cannot be swiped away (AC-S7): a swipe is too easy to make by accident
 * for something that decides a match. There are three explicit exits:
 *  - Accept and Decline send the challenger a real answer;
 *  - Later minimizes the prompt into the header chip (`! ALEX · 8:41`) and
 *    sends NOTHING: the challenge stays pending and the challenger keeps
 *    seeing WAITING (AC-S4). The chip brings it back up.
 * Accept, Decline and Later ignore taps for `PROMPT_INPUT_GUARD_MS` after the
 * prompt appears (AC-S3), so a finger already on its way to a button on the
 * screen underneath cannot answer a challenge the athlete never saw. The
 * guard runs for exactly 600ms from the moment the sheet is presented, and
 * the buttons are disabled for it, so a dropped tap does not show pressed
 * feedback either.
 *
 * The prompt clears itself (the owner passes `challenge={null}`) when the
 * challenger cancels, when the 10-minute live window counted down here
 * passes, or when the challenger leaves the lobby (AC-S5); those rules live
 * in `use-arena-challenge.ts`.
 */
import * as React from "react";
import { Text, View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackgroundProps,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import type { IncomingChallenge } from "@/lib/arena/use-arena-challenge";
import { PROMPT_INPUT_GUARD_MS } from "@/lib/arena/constants";
import {
  formatCountdown,
  spokenCountdown,
  useFreshCountdown,
} from "@/lib/arena/fresh-countdown";
import { useViewerStakes, viewerStakesKey } from "@/lib/match-flow/use-viewer-stakes";
import type { EloStakes } from "@jits/shared/types/composites";
import { FIGHT_RADIUS } from "@/components/match-flow/fight/fight-tokens";
import { usePalette } from "@/lib/theme/palette";
import { InitialsBlock, KindTag, Mono, StakesStrip, shortName } from "@/components/match-flow/fight/fight-ui";
import { StatePressable } from "@/components/ui/state-pressable";

/**
 * The sheet's background, WITHOUT gorhom's default accessibility. The stock
 * `BottomSheetBackground` is an `accessible` element labelled "Bottom Sheet"
 * with role "adjustable": a meaningless stop for VoiceOver on a sheet that
 * cannot be dragged. Purely visual here. The stock one also rounds to 15px;
 * the brand cap for modals is 8px.
 */
function PromptBackground({ style, pointerEvents }: BottomSheetBackgroundProps) {
  return (
    <View
      pointerEvents={pointerEvents}
      accessible={false}
      importantForAccessibility="no"
      style={[style, { borderTopLeftRadius: 8, borderTopRightRadius: 8 }]}
    />
  );
}

/**
 * No text on the prompt grows past this Dynamic Type multiple. The sheet is a
 * fixed, non-scrolling block that cannot be swiped away, so on an iPhone SE at
 * the largest sizes uncapped text would overflow the header row, spill labels
 * out of the fixed-height buttons, and push Accept and Decline off screen,
 * leaving the prompt unanswerable. Every label is also one line.
 */
const MAX_FONT_SCALE = 1.3;

/**
 * The live window (AC-S1): m:ss until 10 minutes after the challenge was
 * created. Its own memoized component so the once-a-second tick re-renders
 * this one line, not the whole sheet. Never truncated: it does not shrink,
 * the label beside it does.
 *
 * Renders nothing when neither timestamp is known. Every source fills
 * `createdAt` (the realtime INSERT row, the pending read in recovery, and the
 * row read of an offer by id); only an offer by id whose row read FAILED has
 * neither, and then a blank is better than a made-up deadline. The server's
 * `expires_at` and the realtime status UPDATE still clear such a prompt.
 */
const PromptCountdown = React.memo(function PromptCountdown({
  createdAt,
  expiresAt,
}: {
  createdAt: string | null;
  expiresAt: string | null;
}) {
  const p = usePalette();
  const challenge = React.useMemo(() => ({ createdAt, expiresAt }), [createdAt, expiresAt]);
  const remainingMs = useFreshCountdown(challenge);
  if (remainingMs === null) return null;
  return (
    <Mono
      bold
      size={13}
      spacing={0.5}
      color={p.text}
      numberOfLines={1}
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      testID="challenge-prompt-countdown"
      accessibilityLabel={`${spokenCountdown(remainingMs)} left to answer`}
    >
      {`${formatCountdown(remainingMs)} LEFT`}
    </Mono>
  );
});

interface ChallengePromptSheetProps {
  challenge: IncomingChallenge | null;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  /**
   * "Later": minimize the prompt into the header chip. Sends nothing to the
   * challenger. Omitted: no Later button.
   */
  onLater?: () => void;
  /**
   * How many OTHER fresh challenges are waiting behind this one (the store's
   * incoming count minus the one shown). Above 0 the prompt says "+N more".
   */
  moreCount?: number;
  /**
   * The viewer's own rating and weight, for the stakes strip. Omitted (or a
   * missing rating): no strip. Arena challenges are ranked-only.
   */
  viewer?: { elo: number | null; weight: number | null };
}

export function ChallengePromptSheet({
  challenge,
  busy,
  onAccept,
  onDecline,
  onLater,
  moreCount = 0,
  viewer,
}: ChallengePromptSheetProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  const p = usePalette();
  // Later passes challenge=null, which resets the stakes read below. Keep the
  // last stakes read so reopening from the chip shows the strip at once
  // instead of the fallback line followed by the 64pt strip (the dynamically
  // sized sheet would change height while being read). The cache is keyed on
  // the four inputs the stakes were computed from, never on the challenge id:
  // useViewerStakes only returns stakes for its current inputs, and reuse
  // here requires the viewer's and the challenger's rating and weight to
  // match exactly, so one challenger's stakes can never show for another.
  const stakesKey = viewerStakesKey(
    viewer?.elo,
    challenge?.challengerElo,
    viewer?.weight,
    challenge?.challengerWeight,
  );
  // Held in state and written from an effect, never from render: a render
  // React throws away (concurrent rendering, StrictMode) must not leave its
  // value behind. The live read is used directly while it exists, so the
  // cache is only consulted after it has been committed.
  const [cached, setCached] = React.useState<{
    key: string;
    stakes: EloStakes;
  } | null>(null);
  const cacheHit = cached !== null && cached.key === stakesKey;
  // One calculate_elo_stakes read per set of inputs, viewer as "challenger"
  // (see useViewerStakes). Fails quietly: no strip. Skipped while a committed
  // read for the same inputs is cached: stakes are a pure function of those
  // four inputs, so a Later then reopen (or the same challenger again) does
  // not hit the network for numbers that cannot have changed.
  const liveStakes = useViewerStakes(
    !!challenge && viewer?.elo != null && !cacheHit,
    viewer?.elo,
    challenge?.challengerElo,
    viewer?.weight,
    challenge?.challengerWeight,
  );
  const hasChallenge = challenge !== null;
  React.useEffect(() => {
    if (!hasChallenge || !liveStakes) return;
    setCached((prev) =>
      prev && prev.key === stakesKey && prev.stakes === liveStakes
        ? prev
        : { key: stakesKey, stakes: liveStakes },
    );
  }, [hasChallenge, liveStakes, stakesKey]);
  const stakes =
    liveStakes ??
    (challenge && viewer?.elo != null && cacheHit ? cached.stakes : null);

  // Only dismiss a sheet this component presented and that has not closed
  // itself. dismiss() on a gorhom modal that was never presented (this
  // effect's first run, challenge=null, on every launch) leaves it stuck in
  // DISMISSING, and the next present() mounts the portal but never renders
  // it: the FIRST challenge after every launch was invisible. Same fix as
  // `notification-panel.tsx`.
  const presentedRef = React.useRef(false);
  // The prompt can appear on any tab, so it buzzes once per challenge (a
  // Warning notification: it wants an answer). Keyed by id so a re-render
  // with the same challenge never buzzes twice.
  const buzzedIdRef = React.useRef<string | null>(null);
  // The input guard (AC-S3) runs for exactly PROMPT_INPUT_GUARD_MS from each
  // APPEARANCE: a new challenge, or the same one brought back up from the
  // chip after Later. A re-render with the same challenge while it is showing
  // does not restart it. It is stamped when present() is called (and again
  // when a swallowed present() is re-issued from onDismiss, which is the
  // real appearance in that case). It is NOT restarted when gorhom reports
  // the sheet settled: the signed-off AC-S3 counts from the sheet appearing.
  const shownIdRef = React.useRef<string | null>(null);
  const appearedAtRef = React.useRef(0);
  // Set when this component asked for a dismiss that has not reported back.
  // If the athlete reopens from the chip (or a new challenge arrives) before
  // that dismiss finishes, the present() does NOT interrupt it: gorhom
  // (5.2.x) force-closes on dismiss, and snapToIndex returns early while a
  // forced close runs. The close then completes (onChange(-1)) and the modal
  // unmounts (onDismiss) with nothing on screen, although a challenge is
  // waiting. handleChange marks the sheet closed, and handleDismiss presents
  // it again once gorhom has finished unmounting it.
  const dismissPendingRef = React.useRef(false);
  const challengeRef = React.useRef(challenge);
  challengeRef.current = challenge;
  // Mirrors the guard as state so the buttons are `disabled` for it (no
  // pressed feedback on a tap that will be dropped). One timer per stamp.
  const [guardActive, setGuardActive] = React.useState(false);
  const guardTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const armGuard = React.useCallback(() => {
    appearedAtRef.current = Date.now();
    setGuardActive(true);
    if (guardTimerRef.current) clearTimeout(guardTimerRef.current);
    guardTimerRef.current = setTimeout(() => {
      guardTimerRef.current = null;
      setGuardActive(false);
    }, PROMPT_INPUT_GUARD_MS);
  }, []);
  React.useEffect(
    () => () => {
      if (guardTimerRef.current) clearTimeout(guardTimerRef.current);
    },
    [],
  );
  React.useEffect(() => {
    if (challenge) {
      if (shownIdRef.current !== challenge.challengeId) {
        shownIdRef.current = challenge.challengeId;
        armGuard();
      }
      ref.current?.present();
      presentedRef.current = true;
      if (buzzedIdRef.current !== challenge.challengeId) {
        buzzedIdRef.current = challenge.challengeId;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
          () => undefined,
        );
      }
    } else {
      shownIdRef.current = null;
      if (presentedRef.current) {
        ref.current?.dismiss();
        presentedRef.current = false;
        dismissPendingRef.current = true;
      }
    }
  }, [challenge, armGuard]);

  const handleChange = React.useCallback(
    (index: number) => {
      if (index === -1) {
        // Closed, including the close of a dismiss that a reopen asked to
        // override (see dismissPendingRef): that present() was dropped, so
        // the sheet is NOT up. Recording it closed keeps the next null from
        // dismissing an unmounting modal (which leaves gorhom stuck), and
        // handleDismiss brings the waiting challenge back up.
        dismissPendingRef.current = false;
        presentedRef.current = false;
        return;
      }
      dismissPendingRef.current = false;
    },
    [],
  );

  // gorhom has closed AND unmounted the modal (it calls onDismiss from its
  // unmount, after onChange(-1)). Normally that follows our own dismiss with
  // no challenge left. If a challenge is waiting, a present() was swallowed
  // by a dismiss still running, so present it now: it is a fresh appearance,
  // with its own input guard re-armed from this present().
  const handleDismiss = React.useCallback(() => {
    dismissPendingRef.current = false;
    // Not gated on presentedRef: a present() the effect made between the
    // close and this unmount (a new challenge arriving) was swallowed too.
    if (!challengeRef.current) return;
    armGuard();
    ref.current?.present();
    presentedRef.current = true;
  }, [armGuard]);

  /** Wrap an answer so taps inside the input guard are dropped, not queued. */
  const guarded = React.useCallback(
    (action: (() => void) | undefined) => () => {
      if (!action) return;
      if (Date.now() - appearedAtRef.current < PROMPT_INPUT_GUARD_MS) return;
      action();
    },
    [],
  );

  const inputDisabled = busy || guardActive;

  const meta = challenge
    ? [
        challenge.challengerElo != null ? `ELO ${challenge.challengerElo}` : null,
        challenge.challengerWeight != null
          ? `${challenge.challengerWeight} LBS`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <BottomSheetModal
      ref={ref}
      // Sized to its content (gorhom v5 dynamic sizing over a BottomSheetView)
      // rather than a percentage snap point: the prompt is a fixed, short
      // block, and a percentage either clips it on an SE or leaves dead
      // space on a Pro Max.
      enableDynamicSizing
      enablePanDownToClose={false}
      onChange={handleChange}
      onDismiss={handleDismiss}
      // ACCESSIBILITY (jits-ef2a). gorhom defaults the sheet's content
      // container to `accessible` with the label "Bottom Sheet", and an
      // accessible element is a LEAF to VoiceOver and to idb: everything
      // inside it, including Accept and Decline, collapsed into one opaque
      // "Bottom Sheet" stop. Turning that off exposes the real elements.
      accessible={false}
      backgroundComponent={PromptBackground}
      // Follows the app theme: the theme's plate (the same light value as the
      // shared Sheet's card token), with the plates inside on the page color.
      backgroundStyle={{ backgroundColor: p.plate, borderTopWidth: 1, borderColor: p.strong }}
      // The sheet cannot be swiped closed (AC-S7), so no grabber that invites
      // a swipe: the indicator is invisible. The handle itself stays (it is
      // the harness's secondary "Bottom sheet handle" visibility signal).
      handleIndicatorStyle={{ backgroundColor: p.strong, width: 40, opacity: 0 }}
    >
      <BottomSheetView>
        {challenge ? (
          <View
            testID="challenge-prompt"
            style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 34, gap: 16 }}
            // The prompt demands an answer: keep VoiceOver focus inside it
            // rather than wandering to the screen behind the sheet.
            accessibilityViewIsModal
          >
            <View
              testID="challenge-prompt-header"
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}
            >
              {/* The label is the part that gives way on a narrow screen at
                  a large text size; the countdown and the tag never shrink. */}
              <View
                testID="challenge-prompt-header-label"
                style={{ flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1, minWidth: 0 }}
              >
                {/* ink-3, not green: green is reserved for live status
                    (the header chip), and this label is not a status. */}
                <Mono
                  bold
                  testID="challenge-prompt-title"
                  color={p.text3}
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                >
                  INCOMING CHALLENGE
                </Mono>
              </View>
              <View
                testID="challenge-prompt-header-trailing"
                style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0 }}
              >
                <PromptCountdown
                  createdAt={challenge.createdAt ?? null}
                  expiresAt={challenge.expiresAt ?? null}
                />
                <KindTag kind="ranked" maxFontSizeMultiplier={MAX_FONT_SCALE} />
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <InitialsBlock
                name={challenge.challengerName}
                size={88}
                fontSize={30}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
              />
              <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
                <Text
                  testID="challenge-prompt-name"
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  className="font-display"
                  style={{ fontSize: 44, lineHeight: 42, color: p.text }}
                >
                  {shortName(challenge.challengerName)}
                </Text>
                {meta ? (
                  <Text
                    testID="challenge-prompt-meta"
                    numberOfLines={1}
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    className="font-mono"
                    style={{ fontSize: 13, color: p.text2, fontVariant: ["tabular-nums"] }}
                  >
                    {meta}
                  </Text>
                ) : null}
                <Text
                  testID="challenge-prompt-subtitle"
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  className="font-body"
                  style={{ fontSize: 13, color: p.text2 }}
                >
                  {`${shortName(challenge.challengerName)} is live in the Arena`}
                </Text>
              </View>
            </View>

            {stakes ? (
              <View style={{ gap: 8 }}>
                <Mono color={p.text3} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`YOUR STAKES${viewer?.elo != null ? ` \u00b7 ${viewer.elo}` : ""}`}</Mono>
                <StakesStrip
                  testID="challenge-prompt-stakes"
                  win={stakes.challenger_win}
                  draw={stakes.challenger_draw}
                  loss={stakes.challenger_loss}
                  height={64}
                  background={p.bg}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                />
              </View>
            ) : (
              <Text
                testID="challenge-prompt-fallback"
                numberOfLines={2}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                className="font-body"
                style={{ fontSize: 13, color: p.text2 }}
              >
                Accept and you both drop straight into the match.
              </Text>
            )}

            {moreCount > 0 ? (
              <Text
                testID="challenge-prompt-more"
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                className="font-body"
                style={{ fontSize: 13, color: p.text }}
              >
                {`+${moreCount} more`}
              </Text>
            ) : null}

            <View style={{ gap: 4 }}>
              {/* Thumb zone (AC-S2): 56pt, Decline 1/3 outline, Accept 2/3 in
                  Signal Red, the sheet's one red CTA. */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <StatePressable
                  testID="challenge-prompt-decline"
                  accessibilityRole="button"
                  accessibilityLabel="Decline challenge"
                  accessibilityState={{ disabled: inputDisabled }}
                  onPress={guarded(onDecline)}
                  disabled={inputDisabled}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 56,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: FIGHT_RADIUS.button,
                    borderWidth: 1,
                    borderColor: p.strong,
                    // A true outline (spec 5): transparent at rest, tinted
                    // only while pressed.
                    backgroundColor: pressed ? p.secondaryBgPressed : "transparent",
                    opacity: busy ? 0.6 : 1,
                  })}
                >
                  <Text
                    testID="challenge-prompt-decline-text"
                    numberOfLines={1}
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    className="font-heading uppercase"
                    style={{ fontSize: 14, letterSpacing: 1.12, color: p.text }}
                  >
                    Decline
                  </Text>
                </StatePressable>
                <StatePressable
                  testID="challenge-prompt-accept"
                  accessibilityRole="button"
                  accessibilityLabel="Accept challenge"
                  accessibilityState={{ disabled: inputDisabled }}
                  onPress={guarded(onAccept)}
                  disabled={inputDisabled}
                  style={({ pressed }) => ({
                    flex: 2,
                    height: 56,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: FIGHT_RADIUS.button,
                    backgroundColor: pressed ? p.ctaPressed : p.cta,
                    opacity: busy ? 0.6 : 1,
                  })}
                >
                  {/* Visible "ACCEPT" (spec 5); the harness and VoiceOver
                      keep the label "Accept challenge". */}
                  <Text
                    testID="challenge-prompt-accept-text"
                    numberOfLines={1}
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    className="font-heading uppercase"
                    style={{ fontSize: 14, letterSpacing: 1.12, color: p.onCta }}
                  >
                    Accept
                  </Text>
                </StatePressable>
              </View>
              {onLater ? (
                // A plain text button, not a swipe (AC-S7). Tucks the prompt
                // into the header chip and sends nothing (AC-S4).
                <StatePressable
                  testID="challenge-prompt-later"
                  accessibilityRole="button"
                  accessibilityLabel="Later"
                  accessibilityHint="Keeps this challenge in the header without answering it"
                  accessibilityState={{ disabled: inputDisabled }}
                  onPress={guarded(onLater)}
                  disabled={inputDisabled}
                  style={{ height: 44, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}
                >
                  <Text
                    testID="challenge-prompt-later-text"
                    numberOfLines={1}
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    className="font-heading"
                    style={{
                      fontSize: 14,
                      color: p.text2,
                      textDecorationLine: "underline",
                    }}
                  >
                    Later
                  </Text>
                </StatePressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}
