import * as React from "react";

type Outcome = "win" | "loss" | "draw";

interface OutcomeTagProps {
  outcome: Outcome;
  className?: string;
  style?: React.CSSProperties;
}

const LETTER: Record<Outcome, string> = {
  win: "W",
  loss: "L",
  draw: "D",
};

const COLOR: Record<Outcome, string> = {
  win: "var(--state-positive)",
  loss: "var(--state-negative)",
  draw: "var(--state-neutral)",
};

export function OutcomeTag({ outcome, className, style }: OutcomeTagProps) {
  return (
    <span
      className={className}
      aria-label={outcome}
      style={{
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        fontSize: "var(--size-num-xs)",
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps-l)",
        padding: "var(--space-1) var(--space-2)",
        borderRadius: "var(--radius-xs)",
        border: `1px solid ${COLOR[outcome]}`,
        color: COLOR[outcome],
        minWidth: 36,
        textAlign: "center",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
        ...style,
      }}
    >
      {LETTER[outcome]}
    </span>
  );
}
