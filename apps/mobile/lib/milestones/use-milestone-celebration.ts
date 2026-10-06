import * as React from "react";
import { useFocusEffect } from "expo-router";
import { useArenaState, useIsInArenaMatch, useLiveMenuOpen } from "@/lib/arena/arena-store";
import { haptics, useReduceMotion } from "@/lib/motion";
import { logMilestoneShown } from "@/lib/matches/telemetry";
import {
  claimMilestone,
  decideMilestone,
  loadMilestones,
  milestoneLoadState,
  type MilestoneCelebration,
  type MilestoneInputs,
  type MilestoneSurface,
} from "./milestone-store";

/** What a surface knows right now (each field null while unknown). */
export type MilestoneData = Pick<MilestoneInputs, "stats" | "newestMatch" | "newestWin" | "highlights">;

export interface UseMilestoneCelebrationResult {
  /** The celebration on screen, or null. */
  celebration: MilestoneCelebration | null;
  /** The banner left (4 s or a tap). */
  dismiss: () => void;
}

/**
 * Runs the phase 1 milestones on one surface (specs/matches-tab 10.6,
 * board P-MT-15). On Matches: first match / first win on their card (a first
 * match that is also the first win shows only First win and marks both),
 * and the first highlight on the carousel; on Home: the first highlight.
 *
 * Order of every attempt: `loadMilestones` (an unreadable store stays
 * fail-closed), `decideMilestone`, then `claimMilestone` BEFORE anything
 * shows, so a crash mid-animation never repeats it and only one surface ever
 * wins a milestone (the first highlight fires on whichever surface the
 * athlete opens first, never both). Nothing is decided while the surface is
 * blurred (a pushed screen or modal route covers it), during an active Arena
 * match, under the incoming challenge prompt or the live menu: it waits for
 * the next time the surface is focused and clear. On a claim: the success
 * haptic unless the milestone is a loss, and `matches.milestone_shown`.
 */
export function useMilestoneCelebration(
  surface: MilestoneSurface,
  athleteId: string | null | undefined,
  data: MilestoneData,
): UseMilestoneCelebrationResult {
  const [focused, setFocused] = React.useState(false);
  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const inActiveMatch = useIsInArenaMatch();
  const arena = useArenaState();
  const menuOpen = useLiveMenuOpen();
  const overModal = (!!arena.incoming && !arena.incomingTucked) || menuOpen;
  const reduceMotion = useReduceMotion();
  const [celebration, setCelebration] = React.useState<MilestoneCelebration | null>(null);

  // The inputs as a value key: a re-render with the same data decides nothing new.
  const dataKey = JSON.stringify(data);
  const latest = React.useRef(data);
  latest.current = data;
  const showing = celebration !== null;

  React.useEffect(() => {
    if (!athleteId || !focused || inActiveMatch || overModal || showing) return;
    let cancelled = false;
    void loadMilestones(athleteId).then((seen) => {
      if (cancelled || milestoneLoadState(athleteId) !== "ok") return;
      const c = decideMilestone(
        { surface, now: Date.now(), inActiveMatch, overModal, reduceMotion, ...latest.current },
        seen,
      );
      if (!c || !claimMilestone(athleteId, c)) return;
      setCelebration(c);
      if (c.haptic) void haptics.milestone();
      logMilestoneShown(c.milestone);
    });
    return () => {
      cancelled = true;
    };
  }, [athleteId, surface, focused, inActiveMatch, overModal, reduceMotion, showing, dataKey]);

  const dismiss = React.useCallback(() => setCelebration(null), []);
  return { celebration, dismiss };
}
