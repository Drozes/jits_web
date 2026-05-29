import * as React from "react";
import {
  Plate,
  EloTile,
  LivePill,
  Chip,
  DeltaNumber,
  RankRow,
  Avatar32,
  Wordmark,
  DataRow,
} from "@/components/ui/elo-system";
import { SectionLabel } from "../_frame";
import { CURRENT_ATHLETE, RANKINGS, NAV_ITEMS } from "../_data";

// Concept - Top nav + wide content (Rankings / Leaderboard).
// A horizontal app bar replaces the side rail; the content spans a centered
// wide column with the ladder as the focal board and a "Your Standing" rail.
export function TopnavRankings() {
  return (
    <div style={{ minHeight: 760, width: "100%", background: "var(--bg-primary)" }}>
      <TopNav />
      <div
        style={{
          margin: "0 auto",
          maxWidth: 1100,
          padding: "var(--space-8)",
        }}
      >
        <PageHeading />
        <ModeAndFilters />
        <div
          className="grid"
          style={{
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
            gap: "var(--space-6)",
            marginTop: "var(--space-6)",
          }}
        >
          <Ladder />
          <YourStanding />
        </div>
      </div>
    </div>
  );
}

function TopNav() {
  return (
    <header
      className="flex items-center justify-between px-8"
      style={{
        height: 64,
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-hairline)",
      }}
    >
      <div className="flex items-center" style={{ gap: "var(--space-8)" }}>
        <Wordmark size="md" />
        <nav className="flex items-center" style={{ gap: "var(--space-5)" }}>
          {NAV_ITEMS.map((item) => {
            const active = item.key === "rankings";
            return (
              <div
                key={item.key}
                className="font-heading font-bold uppercase"
                style={{
                  fontSize: "var(--size-label-l)",
                  letterSpacing: "var(--ls-caps)",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  borderBottom: `2px solid ${active ? "var(--accent-cta)" : "transparent"}`,
                  paddingBottom: "var(--space-1)",
                }}
              >
                {item.label}
              </div>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="font-mono uppercase"
          style={{
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            letterSpacing: "var(--ls-caps-l)",
            border: "1px solid var(--border-hairline)",
            borderRadius: "var(--radius-xs)",
            padding: "var(--space-2) var(--space-3)",
          }}
        >
          Search athletes
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
        <Avatar32 name={CURRENT_ATHLETE.name} />
      </div>
    </header>
  );
}

function PageHeading() {
  return (
    <div>
      <SectionLabel style={{ marginBottom: "var(--space-2)" }}>Leaderboard</SectionLabel>
      <h1
        className="font-heading font-bold"
        style={{
          fontSize: "var(--size-heading-xl)",
          color: "var(--text-primary)",
          lineHeight: "var(--lh-tight)",
          margin: 0,
        }}
      >
        Rankings
      </h1>
    </div>
  );
}

const BELT_FILTERS = ["All Belts", "Brown+Black", "Adult", "Heavyweight"];

function ModeAndFilters() {
  return (
    <div
      className="flex flex-col"
      style={{ gap: "var(--space-4)", marginTop: "var(--space-5)" }}
    >
      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
        <Chip active>Fighters</Chip>
        <Chip>Gyms</Chip>
      </div>
      <div className="flex flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
        {BELT_FILTERS.map((label, i) => (
          <Chip key={label} active={i === 0}>
            {label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Ladder() {
  return (
    <div className="flex flex-col">
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: "var(--space-3)" }}
      >
        <SectionLabel>Top Athletes · Adult</SectionLabel>
        <LivePill label="Live" />
      </div>
      <div
        className="flex flex-col"
        style={{
          gap: 1,
          border: "1px solid var(--border-hairline)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          background: "var(--border-hairline)",
        }}
      >
        {RANKINGS.map((r) => (
          <RankRow
            key={r.rank}
            rank={r.rank}
            name={r.name}
            subtitle={r.subtitle}
            value={r.elo}
            delta={r.delta}
            leader={r.rank === 1}
            you={r.name === "Marcus Reyes"}
          />
        ))}
      </div>
    </div>
  );
}

function YourStanding() {
  const { wins, losses, draws } = CURRENT_ATHLETE.record;
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
      <Plate>
        <SectionLabel style={{ marginBottom: "var(--space-3)" }}>
          Your Standing
        </SectionLabel>
        <div style={{ marginBottom: "var(--space-4)" }}>
          <EloTile size="large" label="Current ELO" value={CURRENT_ATHLETE.elo} />
        </div>
        <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
          <DataRow label="Rank" value={`#${CURRENT_ATHLETE.rank}`} />
          <DataRow
            label="This Week"
            value={<DeltaNumber value={24} size="s" showSign />}
          />
          <DataRow label="Record" value={`${wins}-${losses}-${draws}`} />
        </div>
      </Plate>
      <Plate variant="accent">
        <SectionLabel style={{ marginBottom: "var(--space-2)" }}>
          Climb the ladder
        </SectionLabel>
        <p
          className="font-body"
          style={{
            color: "var(--text-primary)",
            fontSize: "var(--size-body-s)",
            lineHeight: "var(--lh-relaxed)",
            margin: 0,
          }}
        >
          You&apos;re{" "}
          <span
            className="font-mono"
            style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
          >
            256
          </span>{" "}
          ELO from the top 3.
        </p>
      </Plate>
    </div>
  );
}
