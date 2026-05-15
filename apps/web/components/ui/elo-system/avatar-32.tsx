import * as React from "react";

interface Avatar32Props {
  name: string;
  photoUrl?: string | null;
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  const first = parts[0][0]?.toUpperCase() ?? "";
  const last = parts[parts.length - 1][0]?.toUpperCase() ?? "";
  return `${first}·${last}`;
}

const BASE: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "var(--radius-xs)",
  border: "1px solid var(--border-hairline-strong)",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
  flexShrink: 0,
};

export function Avatar32({ name, photoUrl, className }: Avatar32Props) {
  if (photoUrl) {
    return (
      <span className={className} style={BASE}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </span>
    );
  }

  return (
    <span
      className={className}
      aria-label={name}
      style={{
        ...BASE,
        background: "var(--bg-elevated-hover)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--size-num-xs)",
        fontWeight: 700,
        color: "var(--text-primary)",
        letterSpacing: "var(--ls-caps-l)",
        lineHeight: 1,
      }}
    >
      {getInitials(name)}
    </span>
  );
}
