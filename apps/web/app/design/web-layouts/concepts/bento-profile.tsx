import * as React from "react";
import {
  Plate,
  EloTile,
  MetaTag,
  OutcomeTag,
  DeltaNumber,
  DataRow,
} from "@/components/ui/elo-system";
import { SectionLabel } from "../_frame";
import {
  CURRENT_ATHLETE,
  PROFILE_STATS,
  PROFILE_DETAIL_STATS,
  RECENT_MATCHES,
} from "../_data";

// Concept - Bento grid (Profile).
// Asymmetric, full-bleed grid of bordered cards. The athlete identity anchors
// a large hero cell; ELO, record, headline stats, career detail, and recent
// matches fill the remaining cells. One Signal-Red CTA only ("Challenge").
export function BentoProfile() {
  return (
    <div
      className="grid"
      style={{
        minHeight: 760,
        padding: "var(--space-8)",
        gridTemplateColumns: "repeat(4, 1fr)",
        gridAutoRows: "minmax(120px, auto)",
        gap: "var(--space-4)",
      }}
    >
      <HeroCard />
      <EloCard />
      <RecordCard />
      <StatsCard />
      <CareerCard />
      <RecentMatchesCard />
    </div>
  );
}

function HeroCard() {
  return (
    <Plate
      className="flex flex-col justify-between"
      style={{ gridColumn: "span 2", gridRow: "span 2", padding: "var(--space-5)" }}
    >
      <div className="flex items-start gap-5">
        <BigAvatar name={CURRENT_ATHLETE.name} />
        <div style={{ minWidth: 0 }}>
          <SectionLabel style={{ marginBottom: "var(--space-2)" }}>
            Profile
          </SectionLabel>
          <h1
            className="font-heading font-bold"
            style={{
              fontSize: "var(--size-heading-xl)",
              color: "var(--text-primary)",
              lineHeight: "var(--lh-tight)",
              margin: 0,
            }}
          >
            {CURRENT_ATHLETE.name}
          </h1>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <MetaTag>{CURRENT_ATHLETE.belt} Belt</MetaTag>
        <MetaTag>{CURRENT_ATHLETE.gym}</MetaTag>
        <MetaTag>{CURRENT_ATHLETE.weightLbs} lb</MetaTag>
        <MetaTag>Rank #{CURRENT_ATHLETE.rank}</MetaTag>
      </div>

      <button
        type="button"
        className="inline-flex items-center justify-center font-heading font-bold uppercase"
        style={{
          background: "var(--accent-cta)",
          color: "var(--text-on-accent)",
          padding: "var(--space-3) var(--space-5)",
          fontSize: "var(--size-label-l)",
          letterSpacing: "var(--ls-caps)",
          borderRadius: "var(--radius-sm)",
          border: "none",
          cursor: "pointer",
          gap: "var(--space-2)",
          alignSelf: "flex-start",
        }}
      >
        Challenge <span aria-hidden>→</span>
      </button>
    </Plate>
  );
}

function BigAvatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("·");
  return (
    <span
      aria-label={name}
      className="grid place-items-center"
      style={{
        width: 72,
        height: 72,
        flexShrink: 0,
        borderRadius: "var(--radius-xs)",
        border: "1px solid var(--border-hairline-strong)",
        background: "var(--bg-elevated-hover)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--size-num-m)",
        fontWeight: 700,
        color: "var(--text-primary)",
        letterSpacing: "var(--ls-caps-l)",
        lineHeight: 1,
      }}
    >
      {initials}
    </span>
  );
}

function EloCard() {
  return (
    <Plate
      className="flex items-center justify-between"
      style={{ gridColumn: "span 2", padding: "var(--space-5)" }}
    >
      <EloTile size="hero" label="Current ELO" value={CURRENT_ATHLETE.elo} />
      <div className="flex flex-col items-end gap-3">
        <div className="flex flex-col items-end gap-1">
          <SectionLabel>Global Rank</SectionLabel>
          <span
            className="font-mono"
            style={{
              fontSize: "var(--size-num-l)",
              color: "var(--text-primary)",
              fontVariantNumeric: "tabular-nums",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            #{CURRENT_ATHLETE.rank}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <SectionLabel>This Week</SectionLabel>
          <DeltaNumber value={24} size="l" showSign />
        </div>
      </div>
    </Plate>
  );
}

function RecordCard() {
  const { wins, losses, draws } = CURRENT_ATHLETE.record;
  return (
    <Plate
      className="flex flex-col justify-center gap-2"
      style={{ padding: "var(--space-5)" }}
    >
      <SectionLabel>Record</SectionLabel>
      <div className="flex flex-col">
        <RecordLine value={wins} suffix="W" />
        <RecordLine value={losses} suffix="L" />
        <RecordLine value={draws} suffix="D" />
      </div>
    </Plate>
  );
}

function RecordLine({ value, suffix }: { value: number; suffix: string }) {
  return (
    <span
      className="font-mono"
      style={{
        fontSize: "var(--size-num-l)",
        color: "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        lineHeight: 1.15,
      }}
    >
      {value}
      <span
        style={{
          fontSize: "var(--size-num-s)",
          color: "var(--text-tertiary)",
          marginLeft: 2,
        }}
      >
        {suffix}
      </span>
    </span>
  );
}

function StatsCard() {
  return (
    <Plate
      className="grid"
      style={{
        gridColumn: "span 1",
        padding: "var(--space-5)",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "var(--space-4)",
        alignContent: "center",
      }}
    >
      {PROFILE_STATS.map((stat) => (
        <StatCell key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </Plate>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="font-mono"
        style={{
          fontSize: "var(--size-num-l)",
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <SectionLabel>{label}</SectionLabel>
    </div>
  );
}

function CareerCard() {
  return (
    <Plate
      className="flex flex-col gap-3"
      style={{ gridColumn: "span 2", padding: "var(--space-5)" }}
    >
      <SectionLabel>Career</SectionLabel>
      <div className="flex flex-col gap-2">
        {PROFILE_DETAIL_STATS.map((stat) => (
          <DataRow key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>
    </Plate>
  );
}

function RecentMatchesCard() {
  return (
    <Plate
      className="flex flex-col gap-3"
      style={{ gridColumn: "span 2", gridRow: "span 2", padding: "var(--space-5)" }}
    >
      <SectionLabel>Recent Matches</SectionLabel>
      <div className="flex flex-col gap-2">
        {RECENT_MATCHES.map((match) => (
          <MatchRow key={match.id} match={match} />
        ))}
      </div>
    </Plate>
  );
}

function MatchRow({ match }: { match: (typeof RECENT_MATCHES)[number] }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        background: "var(--bg-primary)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-xs)",
        padding: "var(--space-3) var(--space-4)",
      }}
    >
      <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
        <OutcomeTag outcome={match.result} />
        <div style={{ minWidth: 0 }}>
          <div
            className="font-heading font-bold truncate"
            style={{
              fontSize: "var(--size-label-l)",
              color: "var(--text-primary)",
            }}
          >
            {match.opponentName}
          </div>
          <div
            className="font-mono uppercase"
            style={{
              fontSize: "var(--size-num-xs)",
              color: "var(--text-tertiary)",
              letterSpacing: "var(--ls-caps-l)",
            }}
          >
            {match.date} · {match.matchType}
          </div>
        </div>
      </div>
      <DeltaNumber value={match.eloDelta} size="m" showSign />
    </div>
  );
}
