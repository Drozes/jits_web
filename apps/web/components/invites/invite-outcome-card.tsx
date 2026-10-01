import type { InviteOutcome } from "@/lib/invites/outcome-copy";
import { BODY_TEXT, CAPS_LABEL } from "./styles";

type ShownOutcome = Exclude<InviteOutcome, { kind: "setup" }>;

/** Result of an accept on web. Errors use state-negative, never red fills. */
export function InviteOutcomeCard({ outcome }: { outcome: ShownOutcome }) {
  const isError = outcome.kind === "error";
  return (
    <section
      role={isError ? "alert" : "status"}
      data-testid="invite-outcome"
      style={{
        background: "var(--bg-elevated)",
        borderLeft: `2px solid ${isError ? "var(--state-negative)" : "var(--text-primary)"}`,
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <span style={{ ...CAPS_LABEL, color: isError ? "var(--state-negative)" : "var(--text-tertiary)" }}>
        {outcome.title}
      </span>
      <p style={{ ...BODY_TEXT, color: "var(--text-primary)", fontSize: "var(--size-body-l)" }}>{outcome.body}</p>
      {outcome.kind === "booked" && outcome.note && <p style={BODY_TEXT}>{outcome.note}</p>}
      {outcome.kind === "booked" && (
        <p style={BODY_TEXT}>
          Play on the app: matches run in ELO RATED on your phone, with the face-off and weigh-in.
        </p>
      )}
    </section>
  );
}
