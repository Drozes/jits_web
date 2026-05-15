import * as React from "react";

type DeltaSize = "s" | "m" | "l";

const sizeMap: Record<DeltaSize, string> = {
  s: "var(--size-num-s)",
  m: "var(--size-num-m)",
  l: "var(--size-num-l)",
};

interface DeltaNumberProps {
  value: number;
  size?: DeltaSize;
  showSign?: boolean;
  className?: string;
}

export function DeltaNumber({ value, size = "m", showSign = false, className }: DeltaNumberProps) {
  const direction: "up" | "down" | "flat" = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const color =
    direction === "up" ? "var(--state-positive)" : direction === "down" ? "var(--state-negative)" : "var(--state-neutral)";
  const glyph = direction === "up" ? "▲" : direction === "down" ? "▼" : "—";
  const numericText = showSign
    ? value > 0
      ? `+${value}`
      : value < 0
        ? `${value}`
        : "0"
    : `${Math.abs(value)}`;

  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: sizeMap[size],
        fontWeight: 700,
        color,
        fontVariantNumeric: "tabular-nums",
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
      }}
    >
      {!showSign && <span style={{ fontSize: "0.8em" }}>{glyph}</span>}
      {numericText}
    </span>
  );
}
