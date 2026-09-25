interface PlateButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** "primary" is the surface's single Signal Red CTA. */
  variant?: "primary" | "secondary";
  className?: string;
}

/** 44px-min action used inside Arena challenge plates. */
export function PlateButton({
  label,
  onClick,
  disabled = false,
  variant = "secondary",
  className,
}: PlateButtonProps) {
  const primary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`font-heading font-bold uppercase ${className ?? ""}`}
      style={{
        minHeight: 44,
        padding: "0 var(--space-3)",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--size-label-l)",
        letterSpacing: "var(--ls-caps)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        background: primary ? "var(--accent-cta)" : "transparent",
        color: primary ? "var(--text-on-accent)" : "var(--text-secondary)",
        border: primary
          ? "1px solid transparent"
          : "1px solid var(--border-hairline-strong)",
      }}
    >
      {label}
    </button>
  );
}
