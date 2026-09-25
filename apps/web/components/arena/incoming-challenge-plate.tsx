import { Plate } from "@/components/ui/elo-system";
import { PlateButton } from "./plate-button";

interface IncomingChallengePlateProps {
  name: string;
  onAccept: () => void;
  onDecline: () => void;
  disabled: boolean;
  /** id for the heading, so a wrapping dialog can aria-labelledby it. */
  headingId?: string;
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
}: IncomingChallengePlateProps) {
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
      <div
        className="grid grid-cols-2"
        style={{ gap: "var(--space-2)", marginTop: "var(--space-4)" }}
      >
        <PlateButton label="Decline" onClick={onDecline} disabled={disabled} />
        <PlateButton
          label="Accept"
          variant="primary"
          onClick={onAccept}
          disabled={disabled}
        />
      </div>
    </Plate>
  );
}
