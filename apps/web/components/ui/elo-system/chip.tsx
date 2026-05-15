import * as React from "react";

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children?: React.ReactNode;
}

export function Chip({ active = false, className, style, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      className={className}
      style={{
        fontFamily: "var(--font-heading)",
        fontSize: "var(--size-label-s)",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps)",
        padding: "var(--space-2) var(--space-3)",
        borderRadius: "var(--radius-xs)",
        border: `1px solid ${active ? "var(--accent-cta)" : "var(--border-hairline-strong)"}`,
        background: "var(--bg-elevated)",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        whiteSpace: "nowrap",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        transition: "background var(--motion-hover), color var(--motion-hover), border-color var(--motion-hover)",
        ...style,
      }}
      {...rest}
    >
      {active && (
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            background: "var(--accent-cta)",
            marginRight: "var(--space-2)",
            verticalAlign: "middle",
          }}
        />
      )}
      {children}
    </button>
  );
}
