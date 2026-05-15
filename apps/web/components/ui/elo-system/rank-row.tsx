import * as React from "react";
import { DeltaNumber } from "./delta-number";

interface RankRowProps {
  rank: number | string;
  name: string;
  subtitle: string;
  value: number | string;
  delta: number;
  leader?: boolean;
  you?: boolean;
  className?: string;
}

export function RankRow({ rank, name, subtitle, value, delta, leader = false, you = false, className }: RankRowProps) {
  const rankStr = typeof rank === "number" ? String(rank).padStart(2, "0") : rank;

  return (
    <div
      className={className}
      style={{
        background: you ? "var(--bg-secondary)" : "var(--bg-elevated)",
        padding: you ? "var(--space-4) var(--space-5)" : "var(--space-3) var(--space-4)",
        display: "grid",
        gridTemplateColumns: you ? "auto 36px 1fr auto" : "36px 1fr auto",
        gap: "var(--space-3)",
        alignItems: "center",
        borderLeft: `3px solid ${leader ? "var(--accent-cta)" : "transparent"}`,
        borderTop: you ? "1px solid var(--border-hairline-strong)" : undefined,
        transition: "background var(--motion-hover)",
      }}
    >
      {you && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--size-num-xs)",
            color: "var(--accent-cta)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "var(--ls-caps-xl)",
            borderRight: "1px solid var(--border-hairline)",
            paddingRight: "var(--space-3)",
          }}
        >
          You
        </span>
      )}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          fontSize: "var(--size-num-m)",
          color: leader ? "var(--accent-cta)" : "var(--text-secondary)",
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {rankStr}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "var(--size-heading-s)",
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
            fontFamily: "var(--font-body)",
            fontSize: "var(--size-body-xs)",
            color: "var(--text-tertiary)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {subtitle}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: "var(--size-num-l)",
            color: "var(--text-primary)",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        <DeltaNumber value={delta} size="s" />
      </div>
    </div>
  );
}
