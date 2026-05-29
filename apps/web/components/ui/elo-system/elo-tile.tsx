import * as React from "react";

type EloTileSize = "hero" | "large" | "medium" | "small";

const sizePx: Record<EloTileSize, number> = {
  hero: 96,
  large: 64,
  medium: 44,
  small: 36,
};

interface EloTileProps {
  label: string;
  value?: number | string;
  size?: EloTileSize;
  accent?: boolean;
  /** Render the 3px Signal Red bottom accent bar (canonical hero ELO tile). */
  accentBar?: boolean;
  before?: string | number;
  after?: string | number;
  className?: string;
}

function Tile({ label, value, size, accent, accentBar }: { label: string; value: string | number; size: EloTileSize; accent?: boolean; accentBar?: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background: "var(--bg-elevated)",
        border: `1px solid ${accent ? "var(--accent-cta)" : "var(--border-hairline)"}`,
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4) var(--space-5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-2)",
        minWidth: 120,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--size-num-xs)",
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "var(--ls-caps-xl)",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: sizePx[size],
          fontWeight: 700,
          color: "var(--text-primary)",
          lineHeight: 1,
          letterSpacing: "-0.04em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      {accentBar ? (
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 3,
            background: "var(--accent-cta)",
          }}
        />
      ) : null}
    </div>
  );
}

export function EloTile({ label, value, size = "large", accent, accentBar, before, after, className }: EloTileProps) {
  if (before !== undefined && after !== undefined) {
    return (
      <div className={className} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <Tile label={label} value={before} size={size} />
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", fontSize: "var(--size-num-l)" }}>→</span>
        <Tile label={label} value={after} size={size} accent={accent} />
      </div>
    );
  }
  return <Tile label={label} value={value ?? ""} size={size} accent={accent} accentBar={accentBar} />;
}
