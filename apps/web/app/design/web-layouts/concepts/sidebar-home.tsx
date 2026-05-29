import * as React from "react";
import {
  Plate,
  EloTile,
  LivePill,
  MetaTag,
  Avatar32,
  Wordmark,
  OutcomeTag,
  DeltaNumber,
} from "@/components/ui/elo-system";
import { SectionLabel } from "../_frame";
import {
  CURRENT_ATHLETE,
  RECENT_MATCHES,
  RECENT_ACTIVITY,
  NAV_ITEMS,
} from "../_data";

// Concept 1 - Persistent left sidebar (Home / Dashboard).
// Classic SaaS shell: a fixed nav rail replaces the bottom nav, content spreads
// into a two-column dashboard.
export function SidebarHome() {
  return (
    <div className="flex" style={{ minHeight: 760 }}>
      <Sidebar />
      <div className="flex-1" style={{ minWidth: 0 }}>
        <TopBar />
        <div
          className="grid gap-6 p-8"
          style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)" }}
        >
          <div className="flex flex-col gap-5">
            <div>
              <SectionLabel style={{ marginBottom: "var(--space-2)" }}>
                Welcome back
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

            <div className="flex flex-wrap items-stretch gap-4">
              <EloTile size="hero" label="Current ELO" value={CURRENT_ATHLETE.elo} />
              <div className="flex flex-col justify-center gap-3">
                <RecordLine />
                <div className="flex gap-2">
                  <MetaTag>{CURRENT_ATHLETE.belt} Belt</MetaTag>
                  <MetaTag>Rank #{CURRENT_ATHLETE.rank}</MetaTag>
                  <MetaTag>{CURRENT_ATHLETE.weightLbs} lb</MetaTag>
                </div>
              </div>
            </div>

            <LiveSessionPlate />

            <div>
              <SectionLabel style={{ marginBottom: "var(--space-3)" }}>
                Your Recent Matches
              </SectionLabel>
              <div className="flex flex-col gap-2">
                {RECENT_MATCHES.map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <ActivityFeed />
            <Plate variant="accent">
              <SectionLabel style={{ marginBottom: "var(--space-2)" }}>
                Next up
              </SectionLabel>
              <p
                style={{
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--size-body-s)",
                  lineHeight: "var(--lh-relaxed)",
                  margin: 0,
                }}
              >
                A live session is running at {CURRENT_ATHLETE.gym}. Check in to
                join the lobby and challenge available athletes.
              </p>
            </Plate>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside
      className="flex flex-col justify-between"
      style={{
        width: 232,
        flexShrink: 0,
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-hairline)",
        padding: "var(--space-5) var(--space-4)",
      }}
    >
      <div className="flex flex-col gap-6">
        <Wordmark size="md" />
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item, i) => {
            const active = i === 0;
            return (
              <div
                key={item.key}
                className="font-heading font-bold uppercase"
                style={{
                  fontSize: "var(--size-label-l)",
                  letterSpacing: "var(--ls-caps)",
                  padding: "var(--space-3) var(--space-3)",
                  borderRadius: "var(--radius-xs)",
                  borderLeft: `3px solid ${active ? "var(--accent-cta)" : "transparent"}`,
                  background: active ? "var(--bg-elevated)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                {item.label}
              </div>
            );
          })}
        </nav>
      </div>
      <div
        className="flex items-center gap-3"
        style={{
          padding: "var(--space-3)",
          borderTop: "1px solid var(--border-hairline)",
        }}
      >
        <Avatar32 name={CURRENT_ATHLETE.name} />
        <div style={{ minWidth: 0 }}>
          <div
            className="font-heading font-bold truncate"
            style={{ fontSize: "var(--size-label-l)", color: "var(--text-primary)" }}
          >
            {CURRENT_ATHLETE.name}
          </div>
          <div
            className="font-mono uppercase"
            style={{
              fontSize: "var(--size-num-xs)",
              color: "var(--text-tertiary)",
              letterSpacing: "var(--ls-caps-l)",
            }}
          >
            {CURRENT_ATHLETE.elo} ELO
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  return (
    <header
      className="flex items-center justify-between px-8"
      style={{
        height: 64,
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-hairline)",
      }}
    >
      <div
        className="font-heading font-bold uppercase"
        style={{
          fontSize: "var(--size-heading-s)",
          color: "var(--text-primary)",
          letterSpacing: "var(--ls-caps)",
        }}
      >
        Home
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
      </div>
    </header>
  );
}

function RecordLine() {
  const { wins, losses, draws } = CURRENT_ATHLETE.record;
  return (
    <div>
      <SectionLabel style={{ marginBottom: "var(--space-1)" }}>Record</SectionLabel>
      <div
        className="font-mono"
        style={{
          fontSize: "var(--size-num-l)",
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        {wins}W · {losses}L · {draws}D
      </div>
    </div>
  );
}

function LiveSessionPlate() {
  return (
    <Plate variant="live">
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: "var(--space-2)" }}
      >
        <h2
          className="font-heading font-bold"
          style={{
            fontSize: "var(--size-heading-m)",
            color: "var(--text-primary)",
            margin: 0,
            lineHeight: "var(--lh-snug)",
          }}
        >
          {CURRENT_ATHLETE.gym}
        </h2>
        <LivePill label="Live" />
      </div>
      <div
        className="font-mono uppercase"
        style={{
          fontSize: "var(--size-num-xs)",
          letterSpacing: "var(--ls-caps-l)",
          color: "var(--text-secondary)",
          marginBottom: "var(--space-3)",
        }}
      >
        14 athletes in lobby · Session started 22 min ago
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
        }}
      >
        Enter Lobby <span aria-hidden>→</span>
      </button>
    </Plate>
  );
}

function MatchRow({ match }: { match: (typeof RECENT_MATCHES)[number] }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        background: "var(--bg-elevated)",
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
            style={{ fontSize: "var(--size-label-l)", color: "var(--text-primary)" }}
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

function ActivityFeed() {
  return (
    <div>
      <SectionLabel style={{ marginBottom: "var(--space-3)" }}>
        Live Activity
      </SectionLabel>
      <div className="flex flex-col gap-2">
        {RECENT_ACTIVITY.map((a) => (
          <div
            key={a.id}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-xs)",
              padding: "var(--space-3) var(--space-4)",
            }}
          >
            <div
              className="font-body"
              style={{ fontSize: "var(--size-body-s)", color: "var(--text-primary)" }}
            >
              <span style={{ fontWeight: 700 }}>{a.winnerName}</span>
              <span style={{ color: "var(--text-tertiary)" }}> def. </span>
              <span>{a.loserName}</span>
            </div>
            <div
              className="font-mono uppercase"
              style={{
                fontSize: "var(--size-num-xs)",
                color: "var(--text-tertiary)",
                letterSpacing: "var(--ls-caps-l)",
                marginTop: 2,
              }}
            >
              {a.result} · {a.matchType} · {a.date}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
