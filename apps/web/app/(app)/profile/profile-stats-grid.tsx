interface ProfileStatsGridProps {
  totalMatches: number;
  winRate: number;
  peak: number;
  streak: number;
}

/**
 * 4-up stat grid per spec: bg-hairline gap line, each cell bg-elevated,
 * label uppercase font-heading, value mono.
 */
export function ProfileStatsGrid({
  totalMatches,
  winRate,
  peak,
  streak,
}: ProfileStatsGridProps) {
  const streakColor =
    streak > 0
      ? "var(--state-positive)"
      : streak < 0
        ? "var(--state-negative)"
        : "var(--text-primary)";
  const streakDisplay =
    streak > 0 ? `+${streak}` : streak < 0 ? `${streak}` : "0";

  return (
    <section
      className="grid grid-cols-4"
      style={{
        gap: 1,
        background: "var(--border-hairline)",
        borderBottom: "1px solid var(--border-hairline)",
      }}
    >
      <Cell label="Matches" value={totalMatches} />
      <Cell label="Win Rate" value={`${winRate}%`} />
      <Cell label="Peak" value={peak} />
      <Cell label="Streak" value={streakDisplay} valueColor={streakColor} />
    </section>
  );
}

function Cell({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        padding: "var(--space-3) var(--space-2)",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
      }}
    >
      <span
        className="font-heading"
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "var(--size-label-xs)",
          textTransform: "uppercase",
          letterSpacing: "var(--ls-caps-xxl)",
          color: "var(--text-tertiary)",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          fontSize: "var(--size-num-m)",
          color: valueColor ?? "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}
