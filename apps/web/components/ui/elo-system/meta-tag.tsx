import * as React from "react";

interface MetaTagProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function MetaTag({ children, className, style }: MetaTagProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--size-num-xs)",
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps-l)",
        padding: "var(--space-1) var(--space-2)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-xs)",
        display: "inline-flex",
        alignItems: "center",
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
