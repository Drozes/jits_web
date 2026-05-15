import { OutcomeTag } from "@/components/ui/elo-system";

interface HistoryRow {
  matchId: string;
  opponentName: string;
  gymName: string | null;
  outcome: "win" | "loss" | "draw";
  when: string;
  delta: number;
}

interface ProfileHistoryListProps {
  rows: HistoryRow[];
}

export function ProfileHistoryList({ rows }: ProfileHistoryListProps) {
  if (rows.length === 0) {
    return (
      <div
        className="mx-3 mb-4"
        style={{
          background: "var(--bg-elevated)",
          border: "1px dashed var(--border-hairline-strong)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-6)",
          textAlign: "center",
        }}
      >
        <p
          className="font-mono uppercase"
          style={{
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            letterSpacing: "var(--ls-caps-l)",
          }}
        >
          No matches yet
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: "0 var(--space-3) var(--space-4)",
      }}
    >
      {rows.map((row) => (
        <Row key={row.matchId} row={row} />
      ))}
    </div>
  );
}

function Row({ row }: { row: HistoryRow }) {
  const direction: "up" | "down" | "flat" =
    row.delta > 0 ? "up" : row.delta < 0 ? "down" : "flat";
  const deltaColor =
    direction === "up"
      ? "var(--state-positive)"
      : direction === "down"
        ? "var(--state-negative)"
        : "var(--state-neutral)";
  const deltaText =
    row.delta > 0
      ? `+${row.delta}`
      : row.delta < 0
        ? `${row.delta}`
        : "0";

  return (
    <div
      className="grid grid-cols-[auto_1fr_auto] items-center"
      style={{
        background: "var(--bg-elevated)",
        padding: "var(--space-3) var(--space-4)",
        gap: "var(--space-3)",
      }}
    >
      <OutcomeTag outcome={row.outcome} />
      <div>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "var(--size-heading-s)",
            color: "var(--text-primary)",
            lineHeight: 1.1,
          }}
        >
          {row.opponentName}
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--size-body-xs)",
            color: "var(--text-tertiary)",
            marginTop: 2,
          }}
        >
          {row.gymName ? `${row.when} · ${row.gymName}` : row.when}
        </div>
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          fontSize: "var(--size-num-l)",
          fontVariantNumeric: "tabular-nums",
          color: deltaColor,
        }}
      >
        {deltaText}
      </span>
    </div>
  );
}
