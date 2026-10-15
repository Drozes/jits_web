import type { CSSProperties } from "react";

/** One content column for every landing section: 560px max, 16px phone gutter. */
export const LANDING_COLUMN: CSSProperties = {
  width: "100%",
  maxWidth: 560,
  margin: "0 auto",
  paddingLeft: "var(--space-4)",
  paddingRight: "var(--space-4)",
};

/** Mono caps metadata line (data strip, section heading). */
export const LANDING_CAPS: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--size-num-xs)",
  textTransform: "uppercase",
  letterSpacing: "var(--ls-caps-l)",
  color: "var(--text-tertiary)",
  margin: 0,
};
