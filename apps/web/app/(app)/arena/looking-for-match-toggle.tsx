"use client";

import { Plate, LivePill } from "@/components/ui/elo-system";
import { arenaActions, useArenaState } from "@/lib/arena/arena-store";

interface LookingForMatchToggleProps {
  /** Server value, shown until the app-wide owner has published. */
  initialRanked: boolean;
}

/**
 * The one Signal Red CTA on the Arena surface.
 *
 * Deliberately a button, not a Switch: the brand system allows exactly one
 * primary CTA per surface, and going visible is the most important action
 * here. The previous Radix Switch was an 18x32px target (below the 44px
 * minimum) sitting on a plate that looked tappable but was not.
 *
 * A pure view: the flag write, lobby track, rollback and double-tap guard all
 * live in the app-wide owner (`hooks/use-arena-live.ts` via
 * `<ArenaBootstrap />`), so going live here keeps the athlete live on every
 * page and the nav updates without a refresh.
 */
export function LookingForMatchToggle({
  initialRanked,
}: LookingForMatchToggleProps) {
  const { ready, isLive, isSaving } = useArenaState();
  const isLooking = ready ? isLive : initialRanked;

  return (
    <Plate variant={isLooking ? "live" : "default"}>
      <div
        className="grid grid-cols-[1fr_auto] items-start"
        style={{ gap: "var(--space-3)" }}
      >
        <div style={{ minWidth: 0 }}>
          <h2
            className="font-heading font-bold"
            style={{
              fontSize: "var(--size-heading-m)",
              color: "var(--text-primary)",
              lineHeight: "var(--lh-snug)",
              margin: 0,
            }}
          >
            Looking for Match
          </h2>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--size-body-s)",
              color: "var(--text-secondary)",
              margin: "var(--space-1) 0 0",
              lineHeight: "var(--lh-base)",
            }}
          >
            {isLooking
              ? "You're in the lobby. Opponents can challenge you now."
              : "Turn on to appear in the lobby so opponents can challenge you."}
          </p>
        </div>
        {isLooking && <LivePill label="Live" />}
      </div>

      <button
        type="button"
        onClick={() => void arenaActions.toggle()}
        disabled={isSaving || !ready}
        className="font-heading font-bold uppercase"
        style={{
          marginTop: "var(--space-4)",
          width: "100%",
          minHeight: 44,
          background: isLooking ? "transparent" : "var(--accent-cta)",
          color: isLooking ? "var(--text-secondary)" : "var(--text-on-accent)",
          border: isLooking
            ? "1px solid var(--border-hairline-strong)"
            : "1px solid transparent",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--size-label-l)",
          letterSpacing: "var(--ls-caps)",
          cursor: isSaving ? "default" : "pointer",
          opacity: isSaving ? 0.6 : 1,
          transition: "background var(--motion-hover), color var(--motion-hover)",
        }}
      >
        {isLooking ? "Go offline" : "Go live"}
      </button>
    </Plate>
  );
}
