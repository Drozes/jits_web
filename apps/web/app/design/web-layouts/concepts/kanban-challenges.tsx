import * as React from "react";
import {
  Plate,
  Chip,
  MetaTag,
  OutcomeTag,
  DeltaNumber,
  Avatar32,
} from "@/components/ui/elo-system";
import { CHALLENGE_COLUMNS, type ChallengeCard, type ChallengeColumn } from "../_data";

// Concept - Kanban pipeline for the CHALLENGES queue.
// A process-oriented board: four equal columns track each challenge from
// Incoming → Awaiting Response → Scheduled → Completed. Structured and
// equal-width, distinct from the sidebar / bento / split-screen shells.
export function KanbanChallenges() {
  const activeCount = CHALLENGE_COLUMNS.filter((c) => c.key !== "completed").reduce(
    (sum, c) => sum + c.cards.length,
    0,
  );

  return (
    <div
      className="flex flex-col"
      style={{
        minHeight: 760,
        padding: "var(--space-8)",
        background: "var(--bg-primary)",
        gap: "var(--space-6)",
      }}
    >
      <TopBar activeCount={activeCount} />
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "var(--space-4)",
          alignItems: "start",
        }}
      >
        {CHALLENGE_COLUMNS.map((col) => (
          <BoardColumn key={col.key} column={col} />
        ))}
      </div>
    </div>
  );
}

function TopBar({ activeCount }: { activeCount: number }) {
  return (
    <div className="flex items-end justify-between" style={{ gap: "var(--space-6)" }}>
      <div>
        <h1
          className="font-heading font-bold"
          style={{
            fontSize: "var(--size-heading-l)",
            color: "var(--text-primary)",
            lineHeight: "var(--lh-tight)",
            margin: 0,
          }}
        >
          Challenges
        </h1>
        <div
          className="font-mono uppercase"
          style={{
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            letterSpacing: "var(--ls-caps-l)",
            fontVariantNumeric: "tabular-nums",
            marginTop: "var(--space-1)",
          }}
        >
          {activeCount} active
        </div>
      </div>
      <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
        <div className="flex" style={{ gap: "var(--space-2)" }}>
          <Chip active>All</Chip>
          <Chip>Ranked</Chip>
          <Chip>Casual</Chip>
        </div>
        <button
          type="button"
          className="font-heading font-bold uppercase"
          style={{
            background: "var(--accent-cta)",
            color: "var(--text-on-accent)",
            padding: "var(--space-2) var(--space-4)",
            fontSize: "var(--size-label-l)",
            letterSpacing: "var(--ls-caps)",
            borderRadius: "var(--radius-sm)",
            border: "none",
            cursor: "pointer",
          }}
        >
          New Challenge
        </button>
      </div>
    </div>
  );
}

function BoardColumn({ column }: { column: ChallengeColumn }) {
  const isCompleted = column.key === "completed";
  const isScheduled = column.key === "scheduled";
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      <div
        className="flex items-center justify-between"
        style={{
          paddingBottom: "var(--space-3)",
          borderBottom: `1px solid ${
            isScheduled ? "var(--accent-cta)" : "var(--border-hairline)"
          }`,
        }}
      >
        <div
          className="font-heading font-bold uppercase"
          style={{
            fontSize: "var(--size-label-l)",
            letterSpacing: "var(--ls-caps)",
            color: isCompleted ? "var(--text-tertiary)" : "var(--text-primary)",
          }}
        >
          {column.title}
        </div>
        <span
          className="font-mono"
          style={{
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            fontVariantNumeric: "tabular-nums",
            border: "1px solid var(--border-hairline)",
            borderRadius: "var(--radius-xs)",
            padding: "0 var(--space-2)",
            lineHeight: 1.6,
          }}
        >
          {column.cards.length}
        </span>
      </div>
      <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
        {column.cards.length === 0 ? (
          <div
            className="font-mono uppercase"
            style={{
              fontSize: "var(--size-num-xs)",
              letterSpacing: "var(--ls-caps-l)",
              color: "var(--text-tertiary)",
              textAlign: "center",
              padding: "var(--space-6) 0",
              opacity: 0.6,
            }}
          >
            No challenges
          </div>
        ) : (
          column.cards.map((card) => (
            <ChallengeCardView key={card.id} card={card} columnKey={column.key} />
          ))
        )}
      </div>
    </div>
  );
}

function ChallengeCardView({
  card,
  columnKey,
}: {
  card: ChallengeCard;
  columnKey: string;
}) {
  const isRanked = card.matchType === "ranked";
  return (
    <Plate style={{ padding: "var(--space-4)" }}>
      {/* Top: avatar + identity, outcome on completed cards */}
      <div className="flex items-start justify-between" style={{ gap: "var(--space-3)" }}>
        <div className="flex items-center" style={{ gap: "var(--space-3)", minWidth: 0 }}>
          <Avatar32 name={card.opponentName} />
          <div style={{ minWidth: 0 }}>
            <div
              className="font-heading font-bold truncate"
              style={{
                fontSize: "var(--size-label-l)",
                color: "var(--text-primary)",
              }}
            >
              {card.opponentName}
            </div>
            <div
              className="font-mono uppercase"
              style={{
                fontSize: "var(--size-num-xs)",
                color: "var(--text-tertiary)",
                letterSpacing: "var(--ls-caps-l)",
              }}
            >
              {card.subtitle}
            </div>
          </div>
        </div>
        {card.outcome && <OutcomeTag outcome={card.outcome} />}
      </div>

      {/* Middle: match type + ELO stake / realized delta */}
      <div
        className="flex items-center justify-between"
        style={{ gap: "var(--space-2)", marginTop: "var(--space-3)" }}
      >
        <MetaTag>{isRanked ? "Ranked" : "Casual"}</MetaTag>
        <StakeValue card={card} />
      </div>

      {/* Bottom: contextual note */}
      <div
        className="font-mono uppercase"
        style={{
          fontSize: "var(--size-num-xs)",
          color: "var(--text-tertiary)",
          letterSpacing: "var(--ls-caps-l)",
          marginTop: "var(--space-3)",
        }}
      >
        {card.note}
      </div>

      {/* Action affordances - neutral, non-interactive, never red */}
      {!card.outcome && <CardActions columnKey={columnKey} />}
    </Plate>
  );
}

function StakeValue({ card }: { card: ChallengeCard }) {
  if (card.matchType === "casual") {
    return <MetaTag>No ELO</MetaTag>;
  }
  if (card.outcome) {
    const signed =
      card.outcome === "win"
        ? card.eloStake
        : card.outcome === "loss"
          ? -card.eloStake
          : -card.eloStake;
    return <DeltaNumber value={signed} size="m" showSign />;
  }
  return (
    <span
      className="font-mono"
      style={{
        fontSize: "var(--size-num-s)",
        fontWeight: 700,
        color: "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "var(--ls-caps-l)",
      }}
    >
      ±{card.eloStake} ELO
    </span>
  );
}

function CardActions({ columnKey }: { columnKey: string }) {
  const labels =
    columnKey === "incoming"
      ? ["Accept", "Decline"]
      : columnKey === "awaiting"
        ? ["Withdraw"]
        : columnKey === "scheduled"
          ? ["View Details"]
          : [];
  if (labels.length === 0) return null;
  return (
    <div
      className="flex"
      style={{
        gap: "var(--space-2)",
        marginTop: "var(--space-3)",
        paddingTop: "var(--space-3)",
        borderTop: "1px solid var(--border-hairline)",
      }}
    >
      {labels.map((label) => (
        <span
          key={label}
          className="font-heading font-bold uppercase"
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: "var(--size-label-s)",
            letterSpacing: "var(--ls-caps)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-hairline-strong)",
            borderRadius: "var(--radius-xs)",
            padding: "var(--space-2) var(--space-3)",
            background: "var(--bg-elevated)",
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
