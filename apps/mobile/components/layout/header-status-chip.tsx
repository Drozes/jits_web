/**
 * The header status chip (spec 4.2, 4.3): on every tab root, it says whether
 * the athlete is live, how many others are on the mat and whether someone
 * wants them, and goes live in one tap. What it shows is
 * `describeHeaderChip` (`lib/arena/header-chip-model.ts`); this component
 * reads the stores, ticks while a countdown shows on a focused screen, and
 * routes the tap. Pushed screens get the non-interactive `HeaderLiveDot`
 * instead (decision Q1).
 */
import * as React from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { NavigationContext } from "@react-navigation/native";
import { LiveDot } from "@/components/ui/elo-system/live-pill";
import {
  arenaActions,
  useArenaSelfId,
  useArenaState,
  useHasArenaController,
  useIncomingReopenSurface,
  useLiveSwitchDirection,
  useLiveSwitchPhase,
  type LiveSwitchDirection,
  type LiveSwitchPhase,
} from "@/lib/arena/arena-store";
import { ARENA_HREF } from "@/lib/arena/constants";
import { openMatchToConfirm } from "@/lib/arena/open-match-to-confirm";
import { useOnMatCount } from "@/lib/arena/use-lobby-presence";
import { useMatchToConfirm } from "@/lib/match-flow/active-match-store";
import { cn } from "@/lib/cn";
import { LiveMenuPopover } from "./live-menu-popover";
import {
  CHIP_HEIGHT,
  CHIP_MAX_WIDTH,
  CHIP_TARGET_HEIGHT,
  CONFIRM_COPY_COMPACT,
  FONT_PX,
  GLYPH_GAP,
  HEADER_CHIP_CONFIRM_TEST_ID,
  HEADER_CHIP_TEST_ID,
  LIVE_DOT_PX,
  SEGMENT_PAD_X,
  chipAccessibilityValue,
  describeHeaderChip,
  effectiveScale,
  layoutChip,
  statusPadRight,
  type ChipTone,
} from "@/lib/arena/header-chip-model";
import { msToNextSecond } from "@/lib/arena/fresh-countdown";

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

/**
 * Re-renders on each second boundary of the countdown (`remainingMs` null
 * means none). Re-armed whenever the delay changes, so a countdown replacing
 * another ticks on its own boundary; `tick` in the deps re-arms equal delays.
 */
function useCountdownTicker(remainingMs: number | null): void {
  const [tick, setTick] = React.useState(0);
  const delay = remainingMs === null ? null : msToNextSecond(remainingMs);
  React.useEffect(() => {
    if (delay === null) return;
    const id = setTimeout(() => setTick((n) => n + 1), delay);
    return () => clearTimeout(id);
  }, [delay, tick]);
}

/**
 * Whether the enclosing screen is focused; true outside a navigator. Every
 * tab root mounts its own chip, so the unfocused ones must not tick.
 * (`useIsFocused` throws outside a navigator, hence the context read.)
 */
function useScreenFocused(): boolean {
  const navigation = React.useContext(NavigationContext);
  const [focused, setFocused] = React.useState(() => navigation?.isFocused() ?? true);
  React.useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

const TEXT_TONE: Record<ChipTone, string> = {
  live: "text-positive",
  neutral: "text-ink-3",
  // Red is the border only; the copy stays readable ink.
  incoming: "text-ink",
};

/** The offline ring (`○`), drawn as a View. */
export const CHIP_RING_TEST_ID = "header-status-chip-ring";

const BORDER_TONE: Record<ChipTone, string> = {
  live: "border-positive",
  // Spec 4.3: offline and the degraded states draw an ink-3 outline.
  neutral: "border-ink-3",
  incoming: "border-cta",
};

// Literal for Tailwind's class scan; keep in step with FONT_PX.
const TEXT_CLASS = "font-mono-bold text-[10px] uppercase";
const TEXT_STYLE = { fontVariant: ["tabular-nums" as const] };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * The interactive chip for a tab-root header. Reads the app-wide stores, so
 * it needs no props and no Provider.
 */
export function HeaderStatusChip({ onArena = false }: { onArena?: boolean } = {}) {
  const router = useRouter();
  const arena = useArenaState();
  const phase = useLiveSwitchPhase();
  const direction = useLiveSwitchDirection();
  const selfId = useArenaSelfId();
  const onMat = useOnMatCount(selfId);
  const toConfirm = useMatchToConfirm(selfId);
  const controllerReady = useHasArenaController();
  const focused = useScreenFocused();
  // While on screen the chip can bring a tucked challenge back, so the prompt
  // may offer Later (AC-S4). Tab roots stay mounted (blurred) under pushed
  // screens, so it registers only while focused.
  useIncomingReopenSurface(focused);
  const { fontScale } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = React.useState(false);
  // The width the header leaves the chip; null (the 160pt cap) until laid out.
  const [slotWidth, setSlotWidth] = React.useState<number | null>(null);

  const model = describeHeaderChip({
    isLive: arena.isLive,
    phase,
    direction,
    reconnecting: arena.reconnecting,
    lastLiveWriteFailed: arena.lastLiveWriteFailed,
    onMat,
    outgoing: arena.outgoing,
    incoming: arena.incoming,
    incomingTucked: arena.incomingTucked,
    incomingCount: arena.incomingCount,
    confirm: toConfirm !== null,
    controllerReady,
    onArena,
    now: Date.now(),
  });

  // Tick only while a countdown is drawn, on the focused tab.
  useCountdownTicker(focused ? model.remainingMs : null);

  // The menu belongs to the live base state with no prompt sheet up (the
  // menu's native Modal would sit over the sheet and swallow its taps).
  const promptUp = arena.incoming !== null && !arena.incomingTucked;
  const menuAllowed = model.action === "popover" && !promptUp;
  React.useEffect(() => {
    if (!menuAllowed) setMenuOpen(false);
  }, [menuAllowed]);

  const onPress = () => {
    if (model.disabled) return;
    switch (model.action) {
      case "go-live":
        // A failure shows as OFFLINE · RETRY; a throw must not surface as an
        // unhandled rejection from a header tap.
        void arenaActions.goLive().catch(() => undefined);
        return;
      case "popover":
        if (menuAllowed) setMenuOpen(true);
        return;
      case "open-arena":
        router.navigate(ARENA_HREF);
        return;
      case "reopen-incoming":
        arenaActions.reopenIncoming();
        return;
      case "none":
        return;
    }
  };

  const textTone = TEXT_TONE[model.tone];
  const layout = layoutChip(model, fontScale, slotWidth ?? CHIP_MAX_WIDTH);
  const { confirmCopy } = layout;
  const confirmCompact = confirmCopy === CONFIRM_COPY_COMPACT;
  // React Native ignores a font multiplier cap under 1, so a narrow header's
  // text scale below 1x is reached by shrinking the font size itself.
  const textCap = Math.max(1, layout.textScale);
  const drawnScale = Math.min(effectiveScale(fontScale), textCap);
  const textStyle =
    layout.textScale < drawnScale - 1e-6
      ? [TEXT_STYLE, { fontSize: (FONT_PX * layout.textScale) / drawnScale }]
      : [TEXT_STYLE];

  return (
    <View
      testID="header-status-chip-slot"
      onLayout={(e) => {
        const w = Math.floor(e.nativeEvent.layout.width);
        setSlotWidth((prev) => (prev === w ? prev : w));
      }}
      className="flex-row items-center justify-end"
      style={{ flexGrow: 1, flexShrink: 1 }}
    >
      {/* The 44pt touch row: clips to CHIP_MAX_WIDTH, never to the 28pt frame. */}
      <View
        testID="header-status-chip-row"
        className="flex-row items-center"
        style={{
          height: CHIP_TARGET_HEIGHT,
          maxWidth: CHIP_MAX_WIDTH,
          flexShrink: 1,
          overflow: "hidden",
        }}
      >
        {/* The drawn 28pt chip, centred in the row behind the segments. */}
        <View
          testID="header-status-chip-frame"
          pointerEvents="none"
          className={cn("overflow-hidden rounded-xs border", BORDER_TONE[model.tone])}
          style={{
            position: "absolute",
            top: (CHIP_TARGET_HEIGHT - CHIP_HEIGHT) / 2,
            bottom: (CHIP_TARGET_HEIGHT - CHIP_HEIGHT) / 2,
            left: 0,
            right: 0,
          }}
        >
          {model.tone === "live" ? (
            // The 10% green fill, from the theme's own green in either scheme.
            <View
              testID="header-status-chip-fill"
              className="bg-positive"
              style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, opacity: 0.1 }}
            />
          ) : null}
        </View>
        <Pressable
          testID={HEADER_CHIP_TEST_ID}
          // A chip with nothing to do (WAITING on the Arena itself) is read
          // as text, never as a button that does nothing.
          accessibilityRole={model.action === "none" && !model.disabled ? "text" : "button"}
          accessibilityLabel={model.accessibilityLabel}
          accessibilityValue={chipAccessibilityValue(model)}
          accessibilityState={{ disabled: model.disabled }}
          disabled={model.disabled}
          onPress={onPress}
          className="flex-row items-center active:opacity-70"
          style={{
            height: CHIP_TARGET_HEIGHT,
            paddingLeft: SEGMENT_PAD_X,
            paddingRight: statusPadRight(confirmCopy),
            flexShrink: 1,
            // If the header squeezes the chip, the status copy is cut at its
            // own edge and never draws under the CONFIRM segment.
            overflow: "hidden",
            gap: GLYPH_GAP,
          }}
        >
          {model.glyph === "●" ? (
            <LiveDot size={LIVE_DOT_PX} />
          ) : model.glyph === "○" ? (
            // Not text: the bundled Mono Bold has no U+25CB (see VIEW_GLYPHS).
            <View
              testID={CHIP_RING_TEST_ID}
              className={cn("rounded-full border", BORDER_TONE[model.tone])}
              style={{ width: LIVE_DOT_PX, height: LIVE_DOT_PX }}
            />
          ) : (
            <Text
              maxFontSizeMultiplier={textCap}
              className={cn(TEXT_CLASS, textTone)}
              style={textStyle}
            >
              {model.glyph}
            </Text>
          )}
          <View className="flex-row items-center" style={{ flexShrink: 1 }}>
            {model.lead ? (
              <Text
                testID="header-status-chip-lead"
                numberOfLines={1}
                maxFontSizeMultiplier={textCap}
                className={cn(TEXT_CLASS, textTone)}
                style={[...textStyle, { flexShrink: 0 }]}
              >
                {model.lead}
              </Text>
            ) : null}
            {model.name ? (
              <Text
                testID="header-status-chip-name"
                numberOfLines={1}
                ellipsizeMode="tail"
                maxFontSizeMultiplier={textCap}
                className={cn(TEXT_CLASS, textTone)}
                style={[...textStyle, { flexShrink: 1 }]}
              >
                {model.name}
              </Text>
            ) : null}
            {model.tail ? (
              <Text
                testID="header-status-chip-tail"
                numberOfLines={1}
                maxFontSizeMultiplier={textCap}
                className={cn(TEXT_CLASS, textTone)}
                style={[...textStyle, { flexShrink: 0 }]}
              >
                {model.tail}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {toConfirm && confirmCopy ? (
          <Pressable
            testID={HEADER_CHIP_CONFIRM_TEST_ID}
            accessibilityRole="button"
            accessibilityLabel="Confirm result"
            // navigate, not push: a double tap must not stack the match
            // screen twice (an identical route is reused).
            onPress={() => openMatchToConfirm(router, toConfirm.matchId)}
            className="flex-row items-center justify-center active:opacity-70"
            style={{
              height: CHIP_TARGET_HEIGHT,
              // A real 44pt-wide target even for the lone `▪` (AC-H13).
              minWidth: CHIP_TARGET_HEIGHT,
              paddingRight: confirmCompact ? 0 : SEGMENT_PAD_X,
              flexShrink: 0,
            }}
          >
            <Text
              testID="header-status-chip-confirm-text"
              numberOfLines={1}
              maxFontSizeMultiplier={textCap}
              className={cn(TEXT_CLASS, textTone)}
              style={textStyle}
            >
              {confirmCopy}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <LiveMenuPopover visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}
