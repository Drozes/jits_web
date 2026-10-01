"use client";

import { Plate, LivePill } from "@/components/ui/elo-system";
import { arenaActions, useArenaState } from "@/lib/arena/arena-store";
import { PlateButton } from "@/components/arena/plate-button";
import type { LiveLocationPrompt } from "@/hooks/use-arena-live";
import {
  LOCATION_ACCURACY_COPY,
  LOCATION_DENIED_COPY,
  LOCATION_DENIED_HELP_COPY,
  LOCATION_EXPLAIN_COPY,
  LOCATION_IMPLAUSIBLE_COPY,
} from "@/lib/location/match-location";

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
 *
 * With `match_location_required` on, the owner may stop a go-live at the
 * explain step or on a failed reading; this view then shows that copy with
 * one red action (Allow location / Try again) and a quiet Not now.
 */
export function LookingForMatchToggle({
  initialRanked,
}: LookingForMatchToggleProps) {
  const { ready, isLive, isSaving, isLocating, locationPrompt } = useArenaState();
  const isLooking = ready ? isLive : initialRanked;
  const prompt = isLooking ? null : locationPrompt;

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
              : prompt === "explain"
                ? LOCATION_EXPLAIN_COPY
                : "Turn on to appear in the lobby so opponents can challenge you."}
          </p>
          <LocationAlert prompt={prompt} />
        </div>
        {isLooking && <LivePill label="Live" />}
      </div>

      {prompt ? (
        <div
          className="grid grid-cols-2"
          style={{ gap: "var(--space-2)", marginTop: "var(--space-4)" }}
        >
          <PlateButton
            label="Not now"
            onClick={() => arenaActions.dismissLocation()}
            disabled={isSaving}
          />
          <PlateButton
            label={
              isLocating
                ? "Finding you..."
                : prompt === "explain"
                  ? "Allow location"
                  : "Try again"
            }
            variant="primary"
            onClick={() => void arenaActions.confirmLocation()}
            disabled={isSaving}
          />
        </div>
      ) : (
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
          {isLooking ? "Go offline" : isLocating ? "Finding you..." : "Go live"}
        </button>
      )}
    </Plate>
  );
}

/**
 * Why going live stopped. The live region is always mounted so a screen
 * reader announces the message when it appears.
 */
function LocationAlert({ prompt }: { prompt: LiveLocationPrompt }) {
  const lines =
    prompt === "denied"
      ? [LOCATION_DENIED_COPY, LOCATION_DENIED_HELP_COPY]
      : prompt === "accuracy"
        ? [LOCATION_ACCURACY_COPY]
        : prompt === "implausible"
          ? [LOCATION_IMPLAUSIBLE_COPY]
          : [];
  return (
    <div role="alert" aria-live="assertive">
      {lines.map((line) => (
        <p
          key={line}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--size-body-s)",
            color: "var(--text-primary)",
            margin: "var(--space-2) 0 0",
            lineHeight: "var(--lh-base)",
          }}
        >
          {line}
        </p>
      ))}
    </div>
  );
}
