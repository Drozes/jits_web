import * as React from "react";
import { useFocusEffect } from "expo-router";
import type { ReelLaneKey } from "@/lib/highlight/reel-types";
import {
  claimSessionPulse,
  landedReels,
  pagerItems,
  type BuildingReel,
  type ReelTileModel,
} from "@/lib/highlight/reel-lane";
import { haptics, moment, useReduceMotion } from "@/lib/motion";

const EMPTY: ReadonlySet<string> = new Set();

export interface ReelMoments {
  /** Ready tiles (by highlight id) that run one ring pulse now. */
  pulseIds: ReadonlySet<string>;
  /** Ready tiles that just landed from a building tile and fade in. */
  revealIds: ReadonlySet<string>;
  /** The host screen is focused (ambient motion such as the building shimmer runs only then). */
  focused: boolean;
}

/**
 * The session key of Home's first-unseen pulse. Coordinator decision
 * 2026-10-06: it fires ONCE PER SESSION IN TOTAL (not once per reel), so it
 * claims one fixed key; `__resetSessionPulses` resets it for tests.
 */
export const HOME_FIRST_UNSEEN_PULSE_KEY = "home:first-unseen";

function buildingOf(tiles: readonly ReelTileModel[]): BuildingReel[] {
  return tiles.flatMap((t) => (t.kind === "building" ? [t.reel] : []));
}

/**
 * The carousel's two moments (spec 7.2, 10.5), decided from consecutive tile
 * lists so a host only hands over tiles:
 *
 * - The reveal: a match that showed a building tile and now has a ready reel
 *   (`landedReels`) cross-fades in with one ring pulse and ONE success haptic
 *   per landing batch, only while the carousel's screen is focused.
 * - Home only: the first unseen tile pulses, once per JS session in total
 *   (`claimSessionPulse(HOME_FIRST_UNSEEN_PULSE_KEY)`), the first time an
 *   unseen tile is on a focused screen.
 *
 * Decided in a layout effect, so a revealed tile renders hidden and fades in
 * before the first paint that shows it (no blink).
 *
 * Under Reduce Motion nothing moves (no pulse, no fade; the pulse is not
 * claimed, so it is not spent) but the reveal haptic still fires (haptics
 * stay on under Reduce Motion, DESIGN.md). The ids clear after
 * `moment.reelRingPulse`, so a remounted tile never pulses twice.
 */
export function useReelMoments(tiles: readonly ReelTileModel[], laneKey: ReelLaneKey): ReelMoments {
  const reduceMotion = useReduceMotion();
  const focused = React.useRef(false);
  const [focusTick, setFocusTick] = React.useState(0);
  const [isFocused, setIsFocused] = React.useState(false);
  useFocusEffect(
    React.useCallback(() => {
      focused.current = true;
      setIsFocused(true);
      setFocusTick((n) => n + 1);
      return () => {
        focused.current = false;
        setIsFocused(false);
      };
    }, []),
  );

  const prev = React.useRef<{ building: BuildingReel[]; items: ReturnType<typeof pagerItems> } | null>(null);
  const [moments, setMoments] = React.useState<{ pulseIds: ReadonlySet<string>; revealIds: ReadonlySet<string> }>({
    pulseIds: EMPTY,
    revealIds: EMPTY,
  });

  React.useLayoutEffect(() => {
    // Skeletons (a first read in flight) are not a state to compare against.
    if (tiles.length > 0 && tiles.every((t) => t.kind === "skeleton")) return;
    const items = pagerItems(tiles);
    const building = buildingOf(tiles);
    const before = prev.current;
    prev.current = { building, items };
    if (!focused.current) return;

    const landed = before ? landedReels(before.building, before.items, items) : [];
    if (landed.length > 0) void haptics.reelRevealed();
    if (reduceMotion) return;

    const reveal = new Set(landed.map((i) => i.highlightId));
    const pulse = new Set(reveal);
    if (laneKey === "home") {
      const firstUnseen = items.find((i) => i.unseen);
      if (firstUnseen && claimSessionPulse(HOME_FIRST_UNSEEN_PULSE_KEY)) pulse.add(firstUnseen.highlightId);
    }
    if (pulse.size === 0) return;
    setMoments({ pulseIds: pulse, revealIds: reveal });
  }, [tiles, laneKey, reduceMotion, focusTick]);

  // A moment plays once: clear it after the pulse so a remount does not replay it.
  React.useEffect(() => {
    if (moments.pulseIds.size === 0) return undefined;
    const id = setTimeout(() => setMoments({ pulseIds: EMPTY, revealIds: EMPTY }), moment.reelRingPulse);
    return () => clearTimeout(id);
  }, [moments]);

  return React.useMemo(() => ({ ...moments, focused: isFocused }), [moments, isFocused]);
}
