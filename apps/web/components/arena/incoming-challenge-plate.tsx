import { Plate } from "@/components/ui/elo-system";
import type { StartBlock } from "@/hooks/use-arena-challenge";
import {
  LOCATION_ACCURACY_COPY,
  LOCATION_DENIED_COPY,
  LOCATION_DENIED_HELP_COPY,
  proximityCopy,
} from "@/lib/location/match-location";
import { PlateButton } from "./plate-button";

interface IncomingChallengePlateProps {
  name: string;
  onAccept: () => void;
  onDecline: () => void;
  disabled: boolean;
  /** id for the heading, so a wrapping dialog can aria-labelledby it. */
  headingId?: string;
  /**
   * Accepted but not started (match_location_required on). The plate then
   * says why, `onAccept` retries the start and `onDecline` withdraws it.
   */
  startBlocked?: StartBlock;
}

function blockedLines(block: StartBlock, name: string): string[] {
  if (block === "proximity") return [proximityCopy(name)];
  if (block === "accuracy") return [LOCATION_ACCURACY_COPY];
  return [LOCATION_DENIED_COPY, LOCATION_DENIED_HELP_COPY];
}

/**
 * Live prompt when someone challenges you. Owns the surface's red CTA.
 * Rendered inline on /arena and inside the app-wide overlay elsewhere.
 */
export function IncomingChallengePlate({
  name,
  onAccept,
  onDecline,
  disabled,
  headingId,
  startBlocked,
}: IncomingChallengePlateProps) {
  const lines = startBlocked ? blockedLines(startBlocked, name) : [];
  return (
    <Plate variant="live">
      <div
        aria-hidden
        className="font-mono uppercase"
        style={{
          fontSize: "var(--size-num-xs)",
          color: "var(--text-secondary)",
          letterSpacing: "var(--ls-caps-xl)",
        }}
      >
        Incoming challenge
      </div>
      <h2
        id={headingId}
        className="font-heading font-bold"
        style={{
          fontSize: "var(--size-heading-m)",
          color: "var(--text-primary)",
          margin: "var(--space-1) 0 0",
        }}
      >
        {name} wants to roll
      </h2>
      {/* Always mounted so the reason is announced when it appears. */}
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
      <div
        className="grid grid-cols-2"
        style={{ gap: "var(--space-2)", marginTop: "var(--space-4)" }}
      >
        <PlateButton
          label={startBlocked ? "Cancel" : "Decline"}
          onClick={onDecline}
          disabled={disabled}
        />
        <PlateButton
          label={startBlocked ? "Retry" : "Accept"}
          variant="primary"
          onClick={onAccept}
          disabled={disabled}
        />
      </div>
    </Plate>
  );
}
