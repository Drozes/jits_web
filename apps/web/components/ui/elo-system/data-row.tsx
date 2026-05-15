import * as React from "react";

interface DataRowProps {
  label: string;
  value: string | React.ReactNode;
  valueMono?: boolean;
  className?: string;
}

export function DataRow({ label, value, valueMono = true, className }: DataRowProps) {
  const isString = typeof value === "string";
  return (
    <div
      className={className}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "var(--space-3)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--size-num-xs)",
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "var(--ls-caps-l)",
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: valueMono ? "var(--font-mono)" : "var(--font-body)",
          fontSize: "var(--size-num-s)",
          color: "var(--text-primary)",
          textTransform: valueMono && isString ? "uppercase" : "none",
          letterSpacing: valueMono ? "var(--ls-caps-l)" : "var(--ls-default)",
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
    </div>
  );
}
