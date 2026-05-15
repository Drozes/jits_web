import * as React from "react";

type WordmarkSize = "sm" | "md" | "lg" | "hero";

interface WordmarkProps {
  size?: WordmarkSize;
  className?: string;
  style?: React.CSSProperties;
}

const SIZE_PX: Record<WordmarkSize, number> = {
  sm: 18,
  md: 22,
  lg: 48,
  hero: 72,
};

export function Wordmark({ size = "md", className, style }: WordmarkProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--font-display)",
        fontSize: SIZE_PX[size],
        letterSpacing: "var(--ls-mark)",
        lineHeight: "var(--lh-display)",
        color: "var(--text-primary)",
        display: "inline-block",
        ...style,
      }}
    >
      ELO&nbsp;RATED
    </span>
  );
}
