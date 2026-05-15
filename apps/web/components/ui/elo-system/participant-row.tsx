import * as React from "react";

type ParticipantStatus = "available" | "busy" | "self";

interface ParticipantRowProps {
  name: string;
  subtitle: string;
  status?: ParticipantStatus;
  action?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

const STATUS_LABEL: Record<ParticipantStatus, string> = {
  available: "Available",
  busy: "In Match",
  self: "You",
};

const STATUS_COLOR: Record<ParticipantStatus, string> = {
  available: "var(--state-positive)",
  busy: "var(--state-negative)",
  self: "var(--text-tertiary)",
};

function StatusBadge({ status }: { status: ParticipantStatus }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--size-num-xs)",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps-l)",
        padding: "2px var(--space-2)",
        border: `1px solid ${status === "self" ? "var(--border-hairline-strong)" : STATUS_COLOR[status]}`,
        borderRadius: "var(--radius-xs)",
        color: STATUS_COLOR[status],
        whiteSpace: "nowrap",
        lineHeight: 1,
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ParticipantRow({ name, subtitle, status, action, onClick, className }: ParticipantRowProps) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-hairline-faint)",
        borderRadius: "var(--radius-xs)",
        padding: "var(--space-3) var(--space-4)",
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: "var(--space-3)",
        alignItems: "center",
        cursor: onClick ? "pointer" : "default",
        transition: "background var(--motion-hover)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "var(--size-label-l)",
            color: "var(--text-primary)",
            lineHeight: 1.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--size-num-s)",
            color: "var(--text-tertiary)",
            marginTop: 2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {subtitle}
        </div>
      </div>
      {status ? <StatusBadge status={status} /> : <span />}
      {action ?? <span />}
    </div>
  );
}
