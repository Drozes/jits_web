/**
 * The live incoming challenge prompt.
 *
 * A centered modal over a dimmed backdrop (jits-02vo.3, board
 * P-Challenge-Sheet) rather than a plate in the list: it has to be answerable
 * wherever the athlete happens to be, on any tab, because being live persists
 * across the app. Mounted once, app-wide, by `<ArenaBootstrap />`. The card is
 * inset 16pt from each side, about 75% of the window tall (633 of 844 on the
 * board), radius 8, with its content centered inside it and scrolling on a
 * small phone at a large text size rather than clipping Accept and Decline.
 *
 * It cannot be dismissed by accident (AC-S7): a backdrop tap does nothing and
 * Android back does nothing. There are three explicit exits:
 *  - Accept and Decline send the challenger a real answer;
 *  - Later minimizes the prompt into the header chip (`! ALEX · 8:41`) and
 *    sends NOTHING: the challenge stays pending and the challenger keeps
 *    seeing WAITING (AC-S4). The chip brings it back up.
 * Accept, Decline and Later ignore taps for `PROMPT_INPUT_GUARD_MS` after the
 * prompt appears (AC-S3), so a finger already on its way to a button on the
 * screen underneath cannot answer a challenge the athlete never saw. The
 * guard runs for exactly 600ms from the moment the prompt is shown, and the
 * buttons are disabled for it, so a dropped tap does not show pressed
 * feedback either.
 *
 * The prompt clears itself (the owner passes `challenge={null}`) when the
 * challenger cancels, when the 10-minute live window counted down here
 * passes, or when the challenger leaves the lobby (AC-S5); those rules live
 * in `use-arena-challenge.ts`.
 *
 * Feedback stays visible over it. A React Native Modal is its own native
 * presentation (a presented view controller on iOS, a Dialog window on
 * Android), so it sits ABOVE the root `<Toaster />` and `<OfflineBanner />`
 * in `app/_layout.tsx`. While the prompt is up it mounts its own copy of
 * both: react-native-toast-message routes `toast.*` to the newest mounted
 * host, so a toast raised while the prompt is open (a failed Decline, which
 * keeps the prompt up; an outgoing challenge ending) lands on top of the
 * card, and the offline banner explains a failure there too. Both unmount
 * the moment the challenge clears, so toasts go back to the root host
 * before the card has finished fading out. A toast raised in the same flow
 * that clears the prompt (a failed Accept) first lands on the in-modal host;
 * `ModalToaster` re-shows it on the root host as it unmounts, so it is not
 * lost with the prompt.
 *
 * The file keeps its `-sheet` name (and the component its `Sheet` name) so
 * the bootstrap, the mocks in other suites and the CHANGELOG stay valid.
 */
import * as React from "react";
import { Keyboard, Modal, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import type { IncomingChallenge } from "@/lib/arena/use-arena-challenge";
import { PROMPT_INPUT_GUARD_MS } from "@/lib/arena/constants";
import {
  formatCountdown,
  spokenCountdown,
  useFreshCountdown,
} from "@/lib/arena/fresh-countdown";
import { useViewerStakes, viewerStakesKey } from "@/lib/match-flow/use-viewer-stakes";
import { useModalPresentWatchdog } from "@/lib/updates/use-modal-present-watchdog";
import type { EloStakes } from "@jits/shared/types/composites";
import { FIGHT_RADIUS } from "@/components/match-flow/fight/fight-tokens";
import { ON_MEDIA, usePalette } from "@/lib/theme/palette";
import { TABULAR, TYPE_SCALE, typeStep } from "@/lib/typography";
import { InitialsBlock, Mono, StakesStrip, shortName } from "@/components/match-flow/fight/fight-ui";
import { StatePressable } from "@/components/ui/state-pressable";
import { PressableScale } from "@/components/ui/pressable-scale";
import { SteelSheen } from "@/components/ui/steel-sheen";
import { duration, easing, haptics, useModalAnimation, useReduceMotion } from "@/lib/motion";
import { ModalToaster } from "@/components/ui/toast";
import { OfflineBanner } from "@/components/offline-banner";

/**
 * No text on the prompt grows past this Dynamic Type multiple. The card has a
 * fixed height; the content scrolls inside it when it must, but uncapped text
 * would still overflow the header row and spill labels out of the
 * fixed-height buttons. Every label is also one line.
 */
const MAX_FONT_SCALE = 1.3;

/** The card's share of the window height: 633 of 844 on the board. */
export const PROMPT_HEIGHT_RATIO = 0.75;
/** The card's inset from each side of the window (board: 16px). */
export const PROMPT_SIDE_INSET = 16;
/** The card's corner radius: the brand cap for modals. */
export const PROMPT_RADIUS = 8;
/** The backdrop: the one modal scrim (`on-media-scrim`), the same in both themes. */
export const PROMPT_BACKDROP = ON_MEDIA.scrim;
/**
 * Room kept clear above and below the card inside the safe area, so on a
 * short window (landscape iPad split view, a very large inset) the 75% card
 * never runs under the status bar or the home indicator.
 */
const PROMPT_MIN_VERTICAL_MARGIN = 16;

/**
 * The card height for a window: 75% of it, clamped so it always fits inside
 * the safe area with a margin. 844pt (iPhone 14/15): 633. 667pt (iPhone SE):
 * 500. 932pt (Pro Max): 699.
 */
export function promptCardHeight(
  windowHeight: number,
  insets: { top: number; bottom: number },
): number {
  const available = windowHeight - insets.top - insets.bottom - 2 * PROMPT_MIN_VERTICAL_MARGIN;
  return Math.max(0, Math.min(Math.round(windowHeight * PROMPT_HEIGHT_RATIO), available));
}

// Deliberately a no-op: Android back (and iOS's modal close request) must not
// dismiss a prompt that decides a match (AC-S7).
const blockClose = () => {};

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * The accept sweep (Motion Rule, Moment, registry row "Accept sweep"): the
 * fill crosses the Accept button left to right in this long, then one glint
 * passes. Cosmetic only: the accept call has already been made.
 */
export const ACCEPT_SWEEP_MS = 260;
/** The accept glint's band width before the skew. */
const GLINT_WIDTH = 24;

/**
 * The live window (AC-S1): m:ss until 10 minutes after the challenge was
 * created. Its own memoized component so the once-a-second tick re-renders
 * this one line, not the whole prompt. Never truncated: it does not shrink,
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

/** What the card shows: frozen while the modal fades out after a null. */
interface Shown {
  challenge: IncomingChallenge;
  stakes: EloStakes | null;
  moreCount: number;
  viewerElo: number | null;
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
  const p = usePalette();
  // "Sheet / modal present": fades in, appears in place under Reduce Motion.
  const animationType = useModalAnimation("fade");
  const { height: windowHeight } = useWindowDimensions();
  // Read the context directly rather than useSafeAreaInsets(), which throws
  // without a provider; the app mounts one, so this is only a safety net.
  const insets = React.useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const cardHeight = promptCardHeight(windowHeight, insets);

  // Later passes challenge=null, which resets the stakes read below. Keep the
  // last stakes read so reopening from the chip shows the strip at once
  // instead of the fallback line followed by the strip. The cache is keyed on
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

  // React Native keeps rendering a Modal's children while it fades out after
  // visible turns false. The last committed content is kept for that fade so
  // the card does not go blank (or swap its strip for the fallback line) on
  // its way out. Written from an effect, like the stakes cache, and only
  // read while there is no challenge.
  const [lastShown, setLastShown] = React.useState<Shown | null>(null);
  const viewerElo = viewer?.elo ?? null;
  React.useEffect(() => {
    if (!challenge) return;
    setLastShown((prev) =>
      prev &&
      prev.challenge === challenge &&
      prev.stakes === stakes &&
      prev.moreCount === moreCount &&
      prev.viewerElo === viewerElo
        ? prev
        : { challenge, stakes, moreCount, viewerElo },
    );
  }, [challenge, stakes, moreCount, viewerElo]);
  const shown: Shown | null = challenge
    ? { challenge, stakes, moreCount, viewerElo }
    : lastShown;

  const visible = challenge !== null;
  // iOS presents a Modal exactly once and silently gives up when another
  // view controller is already up (the live menu popover, a select, the
  // profile-setup modal screen). The watchdog remounts it until onShow
  // confirms it is really on screen (same hook as the critical-update gate).
  const { modalKey, onShow: watchdogOnShow } = useModalPresentWatchdog(visible);

  // The prompt can appear on any tab, so it buzzes once per challenge (a
  // Warning notification: it wants an answer). Keyed by id so a re-render
  // with the same challenge never buzzes twice.
  const buzzedIdRef = React.useRef<string | null>(null);
  // The challenge this athlete tapped Accept on. The button keeps its
  // "Accepted" fill through the fade-out; a new appearance (a new challenge,
  // or the same one shown again) starts unaccepted.
  const [acceptedId, setAcceptedId] = React.useState<string | null>(null);
  // The input guard (AC-S3) runs for exactly PROMPT_INPUT_GUARD_MS from each
  // APPEARANCE: a new challenge, or the same one brought back up from the
  // chip after Later. A re-render with the same challenge while it is showing
  // does not restart it, and neither does onShow for an ordinary present (the
  // signed-off AC-S3 counts from the prompt appearing, not from the fade-in
  // settling). The one exception is a present iOS refused: the watchdog's
  // remount is then the real appearance, so its onShow re-arms the guard.
  const shownIdRef = React.useRef<string | null>(null);
  const appearedAtRef = React.useRef(0);
  const armedKeyRef = React.useRef(modalKey);
  const modalKeyRef = React.useRef(modalKey);
  modalKeyRef.current = modalKey;
  // Mirrors the guard as state so the buttons are `disabled` for it (no
  // pressed feedback on a tap that will be dropped). One timer per stamp.
  const [guardActive, setGuardActive] = React.useState(false);
  const guardTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const armGuard = React.useCallback(() => {
    appearedAtRef.current = Date.now();
    armedKeyRef.current = modalKeyRef.current;
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
        setAcceptedId(null);
        // A focused field's keyboard is its own window on iOS and would stay
        // above the Modal, covering Decline, Accept and Later on a small
        // phone. The prompt has no inputs, so the keyboard just goes away.
        Keyboard.dismiss();
      }
      if (buzzedIdRef.current !== challenge.challengeId) {
        buzzedIdRef.current = challenge.challengeId;
        // The ONE challengeArrived haptic in the app (Motion Rule): nothing
        // else buzzes for a new challenge.
        void haptics.challengeArrived();
      }
    } else {
      shownIdRef.current = null;
    }
  }, [challenge, armGuard]);

  const handleShow = React.useCallback(() => {
    watchdogOnShow();
    if (modalKeyRef.current !== armedKeyRef.current) armGuard();
  }, [watchdogOnShow, armGuard]);

  /** Wrap an answer so taps inside the input guard are dropped, not queued. */
  const guarded = React.useCallback(
    (action: (() => void) | undefined) => () => {
      if (!action) return;
      if (Date.now() - appearedAtRef.current < PROMPT_INPUT_GUARD_MS) return;
      action();
    },
    [],
  );

  // No answers from a card that is fading out after its challenge cleared.
  const inputDisabled = busy || guardActive || !visible;

  // Accept: the answer goes out FIRST and at once; the haptic and the sweep
  // are cosmetic and never delay it. `accept` replaces `press` here.
  const challengeId = challenge?.challengeId ?? null;
  const handleAccept = React.useCallback(() => {
    onAccept();
    void haptics.accept();
    setAcceptedId(challengeId);
  }, [onAccept, challengeId]);
  const accepted = shown !== null && acceptedId === shown.challenge.challengeId;

  // A failed accept: the answer settled (busy true to false) and the same
  // challenge is still up (use-arena-challenge's "stop" path and its
  // no-current-challenge return keep the prompt). The button goes back to
  // Accept, with its sheen, so the athlete can answer again.
  const wasBusyRef = React.useRef(busy);
  React.useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = busy;
    if (wasBusy && !busy && challengeId !== null && acceptedId === challengeId) {
      setAcceptedId(null);
    }
  }, [busy, challengeId, acceptedId]);

  return (
    <Modal
      key={modalKey}
      visible={visible}
      transparent
      animationType={animationType}
      statusBarTranslucent
      // Never dismissed by the system: Android back and the iOS close
      // request both do nothing (AC-S7).
      onRequestClose={blockClose}
      onShow={handleShow}
      supportedOrientations={["portrait", "landscape"]}
    >
      {/* The backdrop is a plain View with no press handler: a tap outside
          the card does nothing. It still takes the touch, so nothing on the
          screen underneath can be pressed through it. */}
      <View
        testID="challenge-prompt-backdrop"
        style={{
          flex: 1,
          backgroundColor: PROMPT_BACKDROP,
          justifyContent: "center",
          paddingHorizontal: PROMPT_SIDE_INSET,
        }}
      >
        {shown ? (
          <View
            testID="challenge-prompt-card"
            // A card fading out after its challenge cleared is not the prompt
            // any more: hide it from VoiceOver (and from the match-loop
            // harness, which reads the same accessibility tree) so its title
            // does not count as a prompt still up.
            accessibilityElementsHidden={!visible}
            importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
            style={{
              height: cardHeight,
              borderRadius: PROMPT_RADIUS,
              borderWidth: 1,
              borderColor: p.strong,
              // Follows the app theme: the theme's plate, with the stakes
              // strip inside on the page color.
              backgroundColor: p.plate,
              overflow: "hidden",
            }}
          >
            <ScrollView
              testID="challenge-prompt-scroll"
              bounces={false}
              showsVerticalScrollIndicator={false}
              // Centered while it fits; scrolls (never clips the actions)
              // once an SE at a large text size runs out of room.
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: "center",
                paddingHorizontal: 16,
                paddingVertical: 24,
              }}
            >
              <View
                testID="challenge-prompt"
                style={{ gap: 28 }}
                // The prompt demands an answer: keep VoiceOver focus inside
                // it rather than wandering to the screen behind the modal.
                accessibilityViewIsModal
              >
                <PromptHeader challenge={shown.challenge} />
                <PromptChallenger challenge={shown.challenge} />

                {shown.stakes ? (
                  <View style={{ gap: 8 }}>
                    <Mono color={p.text3} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`YOUR STAKES${shown.viewerElo != null ? ` · ${shown.viewerElo}` : ""}`}</Mono>
                    <StakesStrip
                      testID="challenge-prompt-stakes"
                      win={shown.stakes.challenger_win}
                      draw={shown.stakes.challenger_draw}
                      loss={shown.stakes.challenger_loss}
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
                    style={[typeStep("body"), { color: p.text2 }]}
                  >
                    Accept and you both drop straight into the match.
                  </Text>
                )}

                {shown.moreCount > 0 ? (
                  <Text
                    testID="challenge-prompt-more"
                    numberOfLines={1}
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    className="font-body"
                    style={[typeStep("body"), { color: p.text }]}
                  >
                    {`+${shown.moreCount} more`}
                  </Text>
                ) : null}

                <PromptActions
                  busy={busy}
                  disabled={inputDisabled}
                  accepted={accepted}
                  onAccept={guarded(handleAccept)}
                  onDecline={guarded(onDecline)}
                  onLater={onLater ? guarded(onLater) : undefined}
                />
              </View>
            </ScrollView>
          </View>
        ) : null}
      </View>
      {/* Feedback over the prompt: see the header comment. Mounted only
          while there is a challenge, never during the fade-out. */}
      {visible ? <OfflineBanner /> : null}
      {visible ? <ModalToaster /> : null}
    </Modal>
  );
}

function PromptHeader({ challenge }: { challenge: IncomingChallenge }) {
  const p = usePalette();
  return (
    <View
      testID="challenge-prompt-header"
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}
    >
      {/* The label is the part that gives way on a narrow screen at a large
          text size; the countdown never shrinks. */}
      <View
        testID="challenge-prompt-header-label"
        style={{ flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1, minWidth: 0 }}
      >
        {/* ink-3, not green: green is reserved for live status (the header
            chip), and this label is not a status. */}
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
      </View>
    </View>
  );
}

function PromptChallenger({ challenge }: { challenge: IncomingChallenge }) {
  const p = usePalette();
  const meta = [
    challenge.challengerElo != null ? `ELO ${challenge.challengerElo}` : null,
    challenge.challengerWeight != null ? `${challenge.challengerWeight} LBS` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
      <InitialsBlock
        name={challenge.challengerName}
        size={88}
        fontSize={TYPE_SCALE["headline-2xl"].fontSize}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
      />
      <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
        <Text
          testID="challenge-prompt-name"
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          className="font-display"
          style={[typeStep("display-44"), { lineHeight: 42, color: p.text }]}
        >
          {shortName(challenge.challengerName)}
        </Text>
        {meta ? (
          <Text
            testID="challenge-prompt-meta"
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            className="font-mono"
            style={[typeStep("body"), { color: p.text2 }, TABULAR]}
          >
            {meta}
          </Text>
        ) : null}
        <Text
          testID="challenge-prompt-subtitle"
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          className="font-body"
          style={[typeStep("body"), { color: p.text2 }]}
        >
          {`${shortName(challenge.challengerName)} is live in the Arena`}
        </Text>
      </View>
    </View>
  );
}

function PromptActions({
  busy,
  disabled,
  accepted,
  onAccept,
  onDecline,
  onLater,
}: {
  busy: boolean;
  disabled: boolean;
  accepted: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onLater?: () => void;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 4 }}>
      {/* Thumb zone (AC-S2): 56pt, Decline 1/3 outline, Accept 2/3 in Signal
          Red, the prompt's one red CTA. */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <PressableScale
          testID="challenge-prompt-decline"
          accessibilityRole="button"
          accessibilityLabel="Decline challenge"
          accessibilityState={{ disabled }}
          onPress={onDecline}
          disabled={disabled}
          style={({ pressed }) => ({
            flex: 1,
            height: 56,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: FIGHT_RADIUS.button,
            borderWidth: 1,
            borderColor: p.strong,
            // A true outline (spec 5): transparent at rest, tinted only
            // while pressed.
            backgroundColor: pressed ? p.secondaryBgPressed : "transparent",
            opacity: busy ? 0.6 : 1,
          })}
        >
          <Text
            testID="challenge-prompt-decline-text"
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            className="font-heading uppercase tracking-caps"
            style={[typeStep("callout"), { color: p.text }]}
          >
            Decline
          </Text>
        </PressableScale>
        {/* Press scale, the accept sweep and the steel sheen (Motion Rule).
            The `accept` haptic fires from the sheet's accept handler, so no
            `haptic` prop here: one haptic per tap. */}
        <PressableScale
          testID="challenge-prompt-accept"
          accessibilityRole="button"
          accessibilityLabel="Accept challenge"
          // The label stays "Accept challenge" (the match-loop harness taps
          // it); VoiceOver hears "Accepted" as the value after the tap.
          accessibilityValue={accepted ? { text: "Accepted" } : undefined}
          accessibilityState={{ disabled }}
          onPress={onAccept}
          disabled={disabled}
          style={({ pressed }) => ({
            flex: 2,
            height: 56,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: FIGHT_RADIUS.button,
            // Clips the sweep, the glint and the sheen to the button.
            overflow: "hidden",
            backgroundColor: pressed && !accepted ? p.ctaPressed : p.cta,
            // Accepted stays at full strength while the answer is in flight.
            opacity: busy && !accepted ? 0.6 : 1,
          })}
        >
          <AcceptSweep accepted={accepted} fill={p.ctaPressed} />
          {/* Visible "ACCEPT", then "ACCEPTED" once tapped (spec 5); the
              harness and VoiceOver keep the label "Accept challenge". */}
          <Text
            testID="challenge-prompt-accept-text"
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            className="font-heading uppercase tracking-caps"
            style={[typeStep("callout"), { color: p.onCta }]}
          >
            {accepted ? "Accepted" : "Accept"}
          </Text>
          {/* Waiting on this athlete: the one sheened button on screen. */}
          <SteelSheen active={!disabled && !accepted} testID="challenge-prompt-accept-sheen" />
        </PressableScale>
      </View>
      {onLater ? (
        // A plain text button (AC-S7). Tucks the prompt into the header chip
        // and sends nothing (AC-S4).
        <StatePressable
          testID="challenge-prompt-later"
          accessibilityRole="button"
          accessibilityLabel="Later"
          accessibilityHint="Keeps this challenge in the header without answering it"
          accessibilityState={{ disabled }}
          onPress={onLater}
          disabled={disabled}
          style={{ height: 44, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}
        >
          <Text
            testID="challenge-prompt-later-text"
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            className="font-heading"
            style={[
              typeStep("callout"),
              {
                color: p.text2,
                textDecorationLine: "underline",
              },
            ]}
          >
            Later
          </Text>
        </StatePressable>
      ) : null}
    </View>
  );
}

/**
 * The accept sweep's fill and glint, drawn under the Accept label. The fill
 * (the lifted Signal Red, since the button is already Signal Red) scales
 * from the left edge to full width over `ACCEPT_SWEEP_MS`, then one white
 * glint crosses it, and both rest. Plays once, on the tap (accepted false to
 * true); a remount of an accepted button shows it filled and still. Reduce
 * Motion: filled at once, no glint.
 */
function AcceptSweep({ accepted, fill }: { accepted: boolean; fill: string }) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(accepted ? 1 : 0);
  // 0 parks the glint off the left edge, 1 is past the right edge.
  const glint = useSharedValue(0);
  const [width, setWidth] = React.useState(0);
  const wasAccepted = React.useRef(accepted);

  React.useEffect(() => {
    const was = wasAccepted.current;
    wasAccepted.current = accepted;
    if (!accepted) {
      progress.value = 0;
      glint.value = 0;
      return;
    }
    if (was) return;
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, { duration: ACCEPT_SWEEP_MS, easing: easing.brandOut });
    glint.value = withDelay(
      ACCEPT_SWEEP_MS,
      withTiming(1, { duration: duration.fast, easing: easing.brandOut }),
    );
  }, [accepted, reduceMotion, progress, glint]);

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));
  const glintStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -GLINT_WIDTH * 2 + glint.value * (width + GLINT_WIDTH * 3) },
      { skewX: "-20deg" },
    ],
  }));

  if (!accepted) return null;
  return (
    <View
      testID="challenge-prompt-accept-sweep"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
    >
      <Animated.View
        testID="challenge-prompt-accept-fill"
        style={[
          { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
          { backgroundColor: fill, transformOrigin: "left" },
          fillStyle,
        ]}
      />
      {reduceMotion ? null : (
        <Animated.View
          testID="challenge-prompt-accept-glint"
          style={[
            {
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: GLINT_WIDTH,
              backgroundColor: "rgba(255,255,255,0.35)",
            },
            glintStyle,
          ]}
        />
      )}
    </View>
  );
}
