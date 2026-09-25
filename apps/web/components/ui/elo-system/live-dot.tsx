import * as React from "react";

interface LiveDotProps {
  /** Diameter in px. */
  size?: number;
  className?: string;
  "data-testid"?: string;
}

/**
 * The pulsing green LIVE dot. Decorative (aria-hidden): pair it with visible
 * or sr-only text. Keyframes live in app/globals.css (`elo-pulse`).
 */
export function LiveDot({ size = 7, className, ...rest }: LiveDotProps) {
  return (
    <span
      aria-hidden
      className={className}
      data-testid={rest["data-testid"]}
      style={{
        display: "inline-block",
        flexShrink: 0,
        width: size,
        height: size,
        background: "var(--state-positive)",
        borderRadius: "50%",
        animation: "elo-pulse var(--motion-pulse)",
      }}
    />
  );
}
