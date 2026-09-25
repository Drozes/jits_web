import * as React from "react";
import { LiveDot } from "./live-dot";

interface LivePillProps {
  label?: string;
  className?: string;
}

export function LivePill({ label = "LIVE", className }: LivePillProps) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--size-num-xs)",
        fontWeight: 700,
        color: "var(--state-positive)",
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps-xl)",
      }}
    >
      <LiveDot />
      {label}
    </span>
  );
}
