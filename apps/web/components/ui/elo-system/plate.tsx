import * as React from "react";

export type PlateVariant = "default" | "accent" | "live" | "win" | "loss";

interface PlateProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: PlateVariant;
  children?: React.ReactNode;
}

const accentMap: Record<PlateVariant, string> = {
  default: "transparent",
  accent: "var(--accent-cta)",
  live: "var(--state-positive)",
  win: "var(--state-positive)",
  loss: "var(--state-negative)",
};

export function Plate({ variant = "default", className, style, children, ...rest }: PlateProps) {
  const borderLeft =
    variant === "default" ? "1px solid var(--border-hairline)" : `3px solid ${accentMap[variant]}`;
  return (
    <div
      className={className}
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-hairline)",
        borderLeft,
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        color: "var(--text-primary)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
