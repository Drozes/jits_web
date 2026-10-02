/**
 * The Arena's Mat Board pieces (spec arena-live-chip section 6): control bar,
 * strips, Closest Match card and On The Mat rows.
 * Presentational only; the screen decides what shows with the rules in
 * `lib/arena/mat-board.ts`.
 *
 * Brand: one Signal Red CTA per surface, no shadows, radius 2 to 4. Motion
 * (Motion Rule, DESIGN.md): a new incoming challenge strip's bottom edge
 * cools from hot (the challenge afterglow, `afterglow-edge.tsx`); nothing
 * else here moves.
 *
 * Match-loop harness contract (tools/match-loop/sim/screens.ts), keep exact:
 * the live segments `Go live` / `Go offline`, every challenge button
 * `Challenge <name>` (the Closest Match one adds the hint `Closest match`),
 * the waiting strip's StaticText `Waiting for <name>` and `Cancel challenge`.
 */
import { Pressable, Text, View } from "react-native";
import { haptics } from "@/lib/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Avatar32, MetaTag } from "@/components/ui/elo-system";
import { cn } from "@/lib/cn";
import { MAX_SCALE, OutlineAction, StripShell } from "@/components/arena/strip-primitives";
import { AfterglowEdge } from "@/components/arena/afterglow-edge";
import type { ArenaCompetitor } from "@/lib/arena/use-arena-roster";
import {
  formatCountdown,
  spokenCountdown,
  useFreshCountdown,
} from "@/lib/arena/fresh-countdown";
import { useViewerStakes } from "@/lib/match-flow/use-viewer-stakes";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** What a countdown counts down to: a challenge's live window. */
export interface CountdownSource {
  createdAt?: string | null;
  expiresAt?: string | null;
}

/**
 * A ticking countdown as its own text node: `format` turns the `m:ss` (or
 * null, window unknown) into what shows, and null renders nothing. Never
 * shrinks (spec 4.2: a name truncates first, a countdown never does), and
 * VoiceOver reads it as `8 minutes 12 seconds left`.
 */
export function CountdownText({
  source,
  active,
  format,
  testID,
  className,
}: {
  source: CountdownSource | null;
  active: boolean;
  format: (countdown: string | null) => string | null;
  testID?: string;
  className: string;
}) {
  // The chip's and the sheet's ticker, so all read the same `m:ss`.
  const left = useFreshCountdown(source, active);
  const countdown = left === null ? null : formatCountdown(left);
  const text = format(countdown);
  if (!text) return null;
  return (
    <Text
      testID={testID}
      numberOfLines={1}
      accessibilityLabel={left === null ? undefined : `${spokenCountdown(left)} left`}
      maxFontSizeMultiplier={MAX_SCALE}
      className={cn("shrink-0", className)}
      style={TABULAR}
    >
      {text}
    </Text>
  );
}

/** A light acknowledgement on the one tap that sends something to someone. */
function tapHaptic(): void {
  void haptics.press();
}

/** `+32`, `−14`, `±0` (U+2212 minus, the mockup's). */
export function formatGap(diff: number): string {
  if (diff > 0) return `+${diff}`;
  if (diff < 0) return `−${Math.abs(diff)}`;
  return "±0";
}

/** The gap read aloud: `plus 40`, `minus 12`, `even`. */
export function spokenGap(diff: number): string {
  if (diff > 0) return `plus ${diff}`;
  if (diff < 0) return `minus ${Math.abs(diff)}`;
  return "even";
}

/**
 * What VoiceOver reads for an On The Mat row's profile button: every fact
 * the row shows (AC-A4), `Alex, ELO 1412, plus 40 vs you, 185 pounds`.
 * The Challenge button keeps its own `Challenge <name>` label.
 */
export function matRowLabel(
  displayName: string,
  currentElo: number,
  eloDiff: number,
  weight: number | null | undefined,
): string {
  const parts = [displayName, `ELO ${currentElo}`, `${spokenGap(eloDiff)} vs you`];
  if (weight) parts.push(`${weight} pounds`);
  return parts.join(", ");
}

export function MatSectionLabel({ label, right }: { label: string; right?: string }) {
  return (
    <View className="mb-1 flex-row items-baseline justify-between">
      <Text
        maxFontSizeMultiplier={MAX_SCALE}
        className="font-heading text-[10px] text-ink-3 uppercase tracking-caps-xl"
      >
        {label}
      </Text>
      {right ? (
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-mono-bold text-[10px] text-ink-2 uppercase"
          style={TABULAR}
        >
          {right}
        </Text>
      ) : null}
    </View>
  );
}


// ---------------------------------------------------------------------------
// Control bar
// ---------------------------------------------------------------------------

interface ControlBarProps {
  isLive: boolean;
  /** The live switch guard: saving or cooling down. Both segments disable. */
  locked: boolean;
  /** A transition is in flight (announced as busy). */
  saving: boolean;
  /** `12 ON MAT · 7 IN BAND`, or `CONNECTING`. */
  counts: string;
  /** Explicit, never a toggle: a stale `isLive` must not flip the athlete. */
  onGoLive: () => void;
  onGoOffline: () => void;
}

/**
 * Sticky, 56pt: `[OFFLINE | ● LIVE]` and the lobby counts (AC-A1). Only the
 * segment that would change state carries an action label, so exactly one
 * `Go live` or `Go offline` button is on screen (the harness taps it).
 */
export function MatControlBar({
  isLive,
  locked,
  saving,
  counts,
  onGoLive,
  onGoOffline,
}: ControlBarProps) {
  const segment = (live: boolean) => {
    const selected = isLive === live;
    const disabled = selected || locked;
    return (
      <PressableScale
        testID={live ? "arena-segment-live" : "arena-segment-offline"}
        accessibilityRole="button"
        accessibilityLabel={
          selected ? (live ? "You are live" : "You are offline") : live ? "Go live" : "Go offline"
        }
        accessibilityState={{ selected, disabled, busy: saving && !selected }}
        onPress={live ? onGoLive : onGoOffline}
        disabled={disabled}
        hitSlop={{ top: 6, bottom: 6 }}
        className={cn(
          "h-8 flex-row items-center gap-1.5 px-3",
          selected ? "bg-surface-4" : "active:bg-surface-3",
        )}
        style={!selected && locked ? { opacity: 0.6 } : undefined}
      >
        {live ? (
          <View
            className={cn("h-1.5 w-1.5 rounded-full", selected ? "bg-positive" : "bg-ink-3")}
          />
        ) : null}
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className={cn(
            "font-heading text-[10px] uppercase tracking-caps",
            selected ? (live ? "text-positive" : "text-ink") : "text-ink-3",
          )}
        >
          {live ? "Live" : "Offline"}
        </Text>
      </PressableScale>
    );
  };

  return (
    <View
      testID="arena-control-bar"
      className="h-14 flex-row items-center gap-3 border-b border-hairline bg-surface-2 px-4"
    >
      <View className="flex-row overflow-hidden rounded-xs border border-hairline-strong">
        {segment(false)}
        {segment(true)}
      </View>
      <Text
        testID="arena-mat-counts"
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SCALE}
        className="ml-auto shrink font-mono-bold text-[10px] text-ink-2 uppercase"
        style={TABULAR}
      >
        {counts}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Challenge strip
// ---------------------------------------------------------------------------


/**
 * The strip's words: a head that may shrink and truncate (the name goes
 * first), then the countdown in its own node that never shrinks (spec 4.2),
 * then, with `count` over 1, the others counted (`· +2`, never shrinks).
 */
function StripLine({
  head,
  headAccessibilityLabel,
  source,
  active,
  countdownTestID,
  count = 1,
}: {
  head: string;
  /** Overrides what VoiceOver reads for the head (the harness contract). */
  headAccessibilityLabel?: string;
  source: CountdownSource | null;
  active: boolean;
  countdownTestID?: string;
  /** Fresh challenges this strip stands for; the first owns the head. */
  count?: number;
}) {
  const more = count - 1;
  return (
    <View className="flex-1 flex-row items-center">
      <Text
        numberOfLines={1}
        accessibilityLabel={headAccessibilityLabel}
        maxFontSizeMultiplier={MAX_SCALE}
        className="shrink font-mono-bold text-[11px] text-ink uppercase"
        style={TABULAR}
      >
        {head}
      </Text>
      <CountdownText
        testID={countdownTestID}
        source={source}
        active={active}
        format={(c) => (c ? ` · ${c}` : null)}
        className="font-mono-bold text-[11px] text-ink uppercase"
      />
      {more > 0 ? (
        <Text
          testID="arena-strip-tail"
          numberOfLines={1}
          accessibilityLabel={`plus ${more} more`}
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-mono-bold text-[11px] text-ink uppercase"
          style={TABULAR}
        >
          {` · +${more}`}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * `ALEX WANTS TO ROLL · 8:41` + OPEN. With several fresh challenges the
 * first challenger keeps the head (the countdown and OPEN are theirs) and
 * the rest are counted after it, as the sheet does: `ALEX WANTS TO ROLL ·
 * 8:41 · +2`.
 */
export function IncomingStrip({
  challengeId,
  name,
  count,
  source,
  active,
  onOpen,
}: {
  /** The challenge in hand: its afterglow cools once per id. */
  challengeId?: string | null;
  name: string;
  count: number;
  /** The challenge whose live window the countdown shows. */
  source: CountdownSource | null;
  /** Tick while true (the tab is focused). */
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <StripShell
      rail="red"
      testID="arena-strip-incoming"
      edge={<AfterglowEdge challengeId={challengeId} createdAt={source?.createdAt} />}
    >
      <StripLine
        head={`${name} wants to roll`}
        source={source}
        active={active}
        countdownTestID="arena-strip-countdown"
        count={count}
      />
      <OutlineAction label="Open" accessibilityLabel="Open challenge" onPress={onOpen} />
    </StripShell>
  );
}

/**
 * `WAITING · ALEX · 8:12` + Cancel. The head is read as `Waiting for Alex`
 * (harness contract, exact), and the countdown as its own element
 * (`8 minutes 12 seconds left`), so VoiceOver hears both.
 */
export function WaitingStrip({
  name,
  source,
  active,
  onCancel,
  disabled,
}: {
  name: string;
  source: CountdownSource | null;
  active: boolean;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <StripShell rail="neutral" testID="arena-strip-waiting">
      <StripLine
        head={`Waiting · ${name}`}
        headAccessibilityLabel={`Waiting for ${name}`}
        source={source}
        active={active}
        countdownTestID="arena-strip-countdown"
      />
      <OutlineAction
        label="Cancel"
        accessibilityLabel="Cancel challenge"
        onPress={onCancel}
        disabled={disabled}
      />
    </StripShell>
  );
}

/**
 * A fresh challenge opened from its push while offline (AC-A8): going live
 * is how it gets answered, so this go-live is the surface's red CTA while it
 * shows (the Closest Match button demotes).
 */
export function OfferStrip({
  challengeId,
  name,
  count = 1,
  source,
  active,
  onGoLive,
  disabled,
}: {
  /** The offered challenge: its afterglow cools once per id. */
  challengeId?: string | null;
  name: string;
  /** This challenge plus the other fresh on-mat ones (`· +N`). */
  count?: number;
  source: CountdownSource | null;
  active: boolean;
  onGoLive: () => void;
  disabled: boolean;
}) {
  return (
    <StripShell
      rail="red"
      testID="arena-strip-offer"
      edge={<AfterglowEdge challengeId={challengeId} createdAt={source?.createdAt} />}
    >
      <StripLine
        head={`${name} wants to roll`}
        source={source}
        active={active}
        countdownTestID="arena-strip-countdown"
        count={count}
      />
      <PressableScale
        testID="arena-offer-go-live"
        accessibilityRole="button"
        accessibilityLabel={`Go live to answer ${name}`}
        accessibilityState={{ disabled }}
        onPress={onGoLive}
        disabled={disabled}
        hitSlop={{ top: 8, bottom: 8 }}
        className="h-8 justify-center rounded-xs bg-cta px-3 active:bg-cta-hover"
        style={disabled ? { opacity: 0.6 } : undefined}
      >
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-heading text-[11px] text-ink-on-cta uppercase tracking-caps"
        >
          Go live
        </Text>
      </PressableScale>
    </StripShell>
  );
}

/**
 * Fresh challenges whose challenger is off the mat (spec 14, "Arena tab red
 * count"): the tab and bell count them but nothing can answer them yet, so a
 * neutral rail and no action.
 */
export function AwayStrip({
  name,
  count,
  source,
  active,
}: {
  name: string;
  count: number;
  source: CountdownSource | null;
  active: boolean;
}) {
  return (
    <StripShell rail="neutral" testID="arena-strip-away">
      <StripLine
        head={`${name} wants to roll`}
        source={source}
        active={active}
        count={count}
      />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SCALE}
        className="font-mono-bold text-[10px] text-ink-3 uppercase"
      >
        Not on the mat
      </Text>
    </StripShell>
  );
}

/** `RESULT TO CONFIRM` + Confirm (opens the match). */
export function ConfirmStrip({
  opponentName,
  onConfirm,
}: {
  opponentName: string | null;
  onConfirm: () => void;
}) {
  return (
    <StripShell rail="neutral" testID="arena-strip-confirm">
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SCALE}
        className="flex-1 font-mono-bold text-[11px] text-ink uppercase"
        style={TABULAR}
      >
        {opponentName ? `Result to confirm · vs ${opponentName}` : "Result to confirm"}
      </Text>
      {/* The header chip's CONFIRM segment has the same label on this tab:
          the hint tells the two apart for VoiceOver. */}
      <OutlineAction
        label="Confirm"
        accessibilityLabel="Confirm result"
        accessibilityHint={
          opponentName ? `Opens your match against ${opponentName}` : "Opens the match to confirm"
        }
        onPress={onConfirm}
      />
    </StripShell>
  );
}

// ---------------------------------------------------------------------------
// Closest Match
// ---------------------------------------------------------------------------

interface ClosestMatchProps {
  athlete: ArenaCompetitor | null;
  /** The empty state's line; null shows none (the error plate says it). */
  emptyText?: string | null;
  kind: "challenge" | "go-live" | "none";
  red: boolean;
  disabled: boolean;
  viewer: { elo: number | null; weight: number | null };
  onChallenge: () => void;
  onGoLive: () => void;
}

/**
 * The live athlete nearest the viewer's rating, their stakes, and the
 * surface's single red CTA (AC-A3). Nobody to suggest shows an empty state,
 * with `GO LIVE TO ROLL` under it while offline.
 */
export function ClosestMatchCard({
  athlete,
  emptyText = "Nobody else on the mat",
  kind,
  red,
  disabled,
  viewer,
  onChallenge,
  onGoLive,
}: ClosestMatchProps) {
  const stakes = useViewerStakes(
    !!athlete,
    viewer.elo,
    athlete?.currentElo ?? null,
    viewer.weight,
    athlete?.weight ?? null,
  );

  if (!athlete || kind === "none") {
    return (
      <View
        testID="arena-closest-empty"
        className="gap-2.5 rounded-md border border-hairline bg-surface-2 px-3 py-3"
      >
        <MatSectionLabel label="Closest match" />
        {emptyText ? (
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-mono-bold text-[11px] text-ink-3 uppercase"
          >
            {emptyText}
          </Text>
        ) : null}
        {kind === "go-live" ? (
          <ClosestCtaButton
            kind="go-live"
            name={null}
            red={red}
            disabled={disabled}
            onChallenge={onChallenge}
            onGoLive={onGoLive}
          />
        ) : null}
      </View>
    );
  }

  const name = athlete.displayName;
  const facts = [
    String(athlete.currentElo),
    `${formatGap(athlete.eloDiff)} vs you`,
    athlete.weight ? `${athlete.weight} lbs` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      testID="arena-closest"
      className="gap-2.5 rounded-md border border-hairline bg-surface-2 px-3 py-3"
    >
      <MatSectionLabel
        label="Closest match"
        right={viewer.elo != null ? `You ${viewer.elo}` : undefined}
      />
      <View className="flex-row items-center gap-3">
        <Avatar32 name={name} photoUrl={athlete.profilePhotoUrl ?? null} />
        <View className="flex-1">
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-heading text-[14px] text-ink"
          >
            {name}
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-0.5 font-mono text-[11px] text-ink-2"
            style={TABULAR}
          >
            {facts}
          </Text>
          {stakes ? (
            <Text
              testID="arena-closest-stakes"
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="mt-0.5 font-mono-bold text-[11px] text-ink-2 uppercase"
              style={TABULAR}
            >
              {`Win ${formatGap(stakes.challenger_win)} · Loss ${formatGap(stakes.challenger_loss)}`}
            </Text>
          ) : null}
        </View>
      </View>
      <ClosestCtaButton
        kind={kind}
        name={name}
        red={red}
        disabled={disabled}
        onChallenge={onChallenge}
        onGoLive={onGoLive}
      />
    </View>
  );
}

/** The Closest Match button: `CHALLENGE <NAME>` live, `GO LIVE TO ROLL` offline. */
function ClosestCtaButton({
  kind,
  name,
  red,
  disabled,
  onChallenge,
  onGoLive,
}: {
  kind: "challenge" | "go-live";
  name: string | null;
  red: boolean;
  disabled: boolean;
  onChallenge: () => void;
  onGoLive: () => void;
}) {
  const label = kind === "challenge" && name ? `Challenge ${name}` : "Go live to roll";
  return (
    <PressableScale
      testID="arena-closest-cta"
      accessibilityRole="button"
      accessibilityLabel={label}
      // The same label as the athlete's own ROLL row: the hint tells them apart.
      accessibilityHint="Closest match"
      accessibilityState={{ disabled }}
      onPress={() => {
        if (kind === "challenge") {
          tapHaptic();
          onChallenge();
        } else {
          onGoLive();
        }
      }}
      disabled={disabled}
      className={cn(
        "h-11 items-center justify-center rounded-sm px-4",
        red ? "bg-cta active:bg-cta-hover" : "border border-hairline-strong active:bg-surface-4",
      )}
      style={disabled ? { opacity: 0.6 } : undefined}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_SCALE}
        className={cn(
          "font-heading text-[12px] uppercase tracking-caps",
          red ? "text-ink-on-cta" : "text-ink",
        )}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// On The Mat
// ---------------------------------------------------------------------------

/** What an On The Mat row offers on the right; decided by the screen. */
export type MatRowAction =
  /** Live and challengeable: outline ROLL. */
  | { kind: "roll" }
  /** The viewer is offline: a muted ROLL that takes them live. */
  | { kind: "go-live" }
  /** My outgoing challenge to them: `SENT 8:12` instead of ROLL. */
  | { kind: "sent"; source: CountdownSource | null; active: boolean }
  /** A challenge is pending between us (either direction). */
  | { kind: "pending" }
  /** I am at the server's 3 pending outgoing cap. */
  | { kind: "capped" }
  /**
   * Online & close (within 2 km, not on my mat): no ROLL, a challenge would
   * fail the proximity gate. A neutral hint instead, never red.
   */
  | { kind: "not-on-mat" };

interface MatRowProps {
  competitor: ArenaCompetitor;
  action: MatRowAction;
  disabled: boolean;
  onRoll: () => void;
  onGoLive: () => void;
  onOpenProfile: () => void;
  /** A friend (jr_be spec 016): FRIEND badge; the Arena sorts friends first. */
  isFriend?: boolean;
  /**
   * Online & close only: the distance band as shown (`< 500 m`) and as
   * spoken (`under 500 meters`). Never a number.
   */
  band?: { label: string; spoken: string } | null;
}

/**
 * 48pt: avatar, name, ELO, signed gap vs you (state coloured), weight, and
 * the action (AC-A4).
 */
export function MatRow({
  competitor,
  action,
  disabled,
  onRoll,
  onGoLive,
  onOpenProfile,
  isFriend = false,
  band = null,
}: MatRowProps) {
  const { displayName, currentElo, eloDiff, weight } = competitor;
  return (
    <View
      testID={`arena-mat-row-${competitor.id}`}
      className="min-h-[48px] flex-row items-center gap-3 border-b border-l-2 border-b-hairline border-l-positive py-1.5 pl-2"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${isFriend ? "Friend, " : ""}${matRowLabel(displayName, currentElo, eloDiff, weight)}${band ? `, ${band.spoken}` : ""}`}
        onPress={onOpenProfile}
        className="flex-1 flex-row items-center gap-3"
      >
        <Avatar32 name={displayName} photoUrl={competitor.profilePhotoUrl ?? null} />
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="shrink font-heading text-[13px] text-ink"
            >
              {displayName}
            </Text>
            {isFriend ? (
              <Text
                testID={`arena-friend-badge-${competitor.id}`}
                maxFontSizeMultiplier={MAX_SCALE}
                className="rounded-xs border border-hairline-strong px-1 font-heading text-[9px] uppercase tracking-caps-l text-ink-2"
              >
                Friend
              </Text>
            ) : null}
          </View>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-0.5 font-mono text-[11px] text-ink-2"
            style={TABULAR}
          >
            {`${currentElo} · `}
            <Text
              testID={`arena-mat-gap-${competitor.id}`}
              // Data, not state: never red (spec 3, "Red never decorates
              // data"), nor green (green means live). Ink, like the mockup.
              className="font-mono-bold text-ink-2"
            >
              {formatGap(eloDiff)}
            </Text>
            {weight ? ` · ${weight} lbs` : ""}
          </Text>
        </View>
      </Pressable>

      <View className="shrink-0 flex-row items-center gap-2">
        {band ? (
          <Text
            testID={`arena-close-band-${competitor.id}`}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-mono-bold text-[11px] text-ink-2"
            style={TABULAR}
            // Already part of the row's label.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {band.label}
          </Text>
        ) : null}
        {action.kind === "roll" ? (
          <OutlineAction
            label="Roll"
            accessibilityLabel={`Challenge ${displayName}`}
            disabled={disabled}
            onPress={() => {
              tapHaptic();
              onRoll();
            }}
          />
        ) : null}
        {action.kind === "go-live" ? (
          <OutlineAction
            label="Roll"
            accessibilityLabel={`Go live to challenge ${displayName}`}
            disabled={disabled}
            dim
            onPress={onGoLive}
          />
        ) : null}
        {action.kind === "sent" ? (
          <CountdownText
            testID={`arena-mat-sent-${competitor.id}`}
            source={action.source}
            active={action.active}
            format={(c) => (c ? `Sent ${c}` : "Sent")}
            className="font-mono-bold text-[11px] text-ink-3 uppercase"
          />
        ) : null}
        {action.kind === "pending" ? <MetaTag>Pending</MetaTag> : null}
        {action.kind === "capped" ? <MetaTag>3 out</MetaTag> : null}
        {action.kind === "not-on-mat" ? (
          <Text
            testID={`arena-not-on-mat-${competitor.id}`}
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-heading text-[9px] uppercase tracking-caps-l text-ink-3"
          >
            Not on your mat
          </Text>
        ) : null}
      </View>
    </View>
  );
}
