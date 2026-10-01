import type { CSSProperties } from "react";

const BUTTON_BASE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-2)",
  width: "100%",
  minHeight: 48,
  padding: "var(--space-3) var(--space-5)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-heading)",
  fontWeight: 700,
  fontSize: "var(--size-label-l)",
  letterSpacing: "var(--ls-caps)",
  textTransform: "uppercase",
  textDecoration: "none",
  cursor: "pointer",
  transition: "background var(--motion-hover), border-color var(--motion-hover)",
};

/** The one Signal Red CTA on the surface. */
export const PRIMARY_CTA: CSSProperties = {
  ...BUTTON_BASE,
  background: "var(--accent-cta)",
  color: "var(--text-on-accent)",
  border: "1px solid transparent",
};

export const SECONDARY_CTA: CSSProperties = {
  ...BUTTON_BASE,
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-hairline-strong)",
};

export const GHOST_CTA: CSSProperties = {
  ...BUTTON_BASE,
  background: "transparent",
  color: "var(--text-secondary)",
  border: "1px solid transparent",
};

export const CAPS_LABEL: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--size-num-xs)",
  color: "var(--text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "var(--ls-caps-l)",
};

export const BODY_TEXT: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "var(--size-body)",
  lineHeight: "var(--lh-relaxed)",
  color: "var(--text-secondary)",
  margin: 0,
};
