import { Plate, LiveDot } from "@/components/ui/elo-system";
import { PlateButton } from "./plate-button";

/** Compact "Waiting for X · Cancel" for a sent challenge, off the Arena. */
export function OutgoingChallengeBar({
  name,
  onCancel,
  disabled,
}: {
  name: string;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <div role="status" className="pointer-events-auto w-full max-w-md">
      <Plate variant="live" style={{ padding: "var(--space-2) var(--space-3)" }}>
        <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
          <LiveDot />
          <span
            className="font-heading font-bold"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: "var(--size-heading-s)",
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Waiting for {name}
          </span>
          <PlateButton label="Cancel" onClick={onCancel} disabled={disabled} />
        </div>
      </Plate>
    </div>
  );
}
