import * as React from "react";

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
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          background: "var(--state-positive)",
          borderRadius: "50%",
          animation: "elo-pulse var(--duration-pulse) ease-in-out infinite",
        }}
      />
      <style>{`@keyframes elo-pulse { 0%,100% { opacity:1; transform:scale(1);} 50% { opacity:0.45; transform:scale(0.8);} }`}</style>
      {label}
    </span>
  );
}
