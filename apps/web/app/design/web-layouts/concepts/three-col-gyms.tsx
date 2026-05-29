import * as React from "react";
import {
  Plate,
  LivePill,
  Chip,
  RankRow,
  DataRow,
  Avatar32,
  Wordmark,
} from "@/components/ui/elo-system";
import { SectionLabel } from "../_frame";
import { GYMS, SELECTED_GYM, CURRENT_ATHLETE, NAV_ITEMS } from "../_data";

// Concept - Three-column desktop shell (Gyms / Gym Finder).
// Nav rail · main list · contextual right rail. The left rail mirrors the
// sidebar concept's treatment with "Gyms" marked active; the right rail keeps a
// persistent detail panel for the selected gym, productivity-app style.
export function ThreeColGyms() {
  return (
    <div className="flex" style={{ minHeight: 760 }}>
      <NavRail />
      <main className="flex-1" style={{ minWidth: 0 }}>
        <GymList />
      </main>
      <GymDetailRail />
    </div>
  );
}

function NavRail() {
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
          {NAV_ITEMS.map((item) => {
            const active = item.key === "gyms";
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
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {CURRENT_ATHLETE.elo} ELO
          </div>
        </div>
      </div>
    </aside>
  );
}

function GymList() {
  return (
    <div className="flex flex-col gap-5 p-8">
      <div className="flex items-center justify-between gap-4">
        <h1
          className="font-heading font-bold"
          style={{
            fontSize: "var(--size-heading-l)",
            color: "var(--text-primary)",
            lineHeight: "var(--lh-tight)",
            margin: 0,
          }}
        >
          Gym Finder
        </h1>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 font-mono uppercase"
            style={{
              fontSize: "var(--size-num-xs)",
              color: "var(--text-secondary)",
              letterSpacing: "var(--ls-caps-l)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-xs)",
              padding: "var(--space-2) var(--space-3)",
            }}
          >
            All Cities <span aria-hidden>▾</span>
          </div>
          <button
            type="button"
            className="font-heading font-bold uppercase"
            style={{
              background: "transparent",
              color: "var(--text-primary)",
              padding: "var(--space-2) var(--space-4)",
              fontSize: "var(--size-label-l)",
              letterSpacing: "var(--ls-caps)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-hairline-strong)",
              cursor: "pointer",
            }}
          >
            Create Gym
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active>All Cities</Chip>
        <Chip>Live Now</Chip>
        <Chip>Near Me</Chip>
      </div>

      <SectionLabel>{GYMS.length} Partner Gyms</SectionLabel>

      <div className="flex flex-col gap-2">
        {GYMS.map((gym, i) => (
          <GymCard key={gym.id} gym={gym} selected={i === 0} />
        ))}
      </div>
    </div>
  );
}

function GymCard({
  gym,
  selected,
}: {
  gym: (typeof GYMS)[number];
  selected: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        background: selected ? "var(--bg-secondary)" : "var(--bg-elevated)",
        border: "1px solid var(--border-hairline)",
        borderLeft: selected
          ? "3px solid var(--accent-cta)"
          : "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-xs)",
        padding: "var(--space-4) var(--space-5)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          className="font-heading font-bold truncate"
          style={{ fontSize: "var(--size-heading-s)", color: "var(--text-primary)" }}
        >
          {gym.name}
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
          {gym.city}
        </div>
      </div>
      <div className="flex items-center gap-5">
        <StatCluster label="Members" value={gym.members} />
        <StatCluster label="Avg ELO" value={gym.avgElo} />
        <div style={{ width: 56, display: "flex", justifyContent: "flex-end" }}>
          {gym.liveNow && <LivePill label="Live" />}
        </div>
      </div>
    </div>
  );
}

function StatCluster({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-end" style={{ gap: 2 }}>
      <span
        className="font-mono"
        style={{
          fontSize: "var(--size-num-l)",
          fontWeight: 700,
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <SectionLabel>{label}</SectionLabel>
    </div>
  );
}

function GymDetailRail() {
  const live = SELECTED_GYM.liveSession;
  return (
    <aside
      className="flex flex-col gap-5"
      style={{
        width: 340,
        flexShrink: 0,
        borderLeft: "1px solid var(--border-hairline)",
        background: "var(--bg-secondary)",
        padding: "var(--space-5)",
      }}
    >
      <div>
        <div
          className="flex items-center justify-between"
          style={{ gap: "var(--space-3)" }}
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
            {SELECTED_GYM.name}
          </h2>
          {SELECTED_GYM.liveNow && <LivePill label="Live" />}
        </div>
        <div
          className="font-mono uppercase"
          style={{
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            letterSpacing: "var(--ls-caps-l)",
            marginTop: 4,
          }}
        >
          {SELECTED_GYM.city}
        </div>
      </div>

      <Plate variant="live">
        <div
          className="font-mono uppercase"
          style={{
            fontSize: "var(--size-num-xs)",
            letterSpacing: "var(--ls-caps-l)",
            color: "var(--text-secondary)",
            marginBottom: "var(--space-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {live.participants} athletes in lobby · started {live.startedMinsAgo} min ago
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
          Create Session <span aria-hidden>→</span>
        </button>
      </Plate>

      <div className="flex flex-col gap-3">
        <DataRow label="Members" value={String(SELECTED_GYM.members)} />
        <DataRow label="Avg ELO" value={String(SELECTED_GYM.avgElo)} />
        <DataRow label="Managers" value={String(SELECTED_GYM.managers)} />
        <DataRow label="Status" value={SELECTED_GYM.liveNow ? "Live" : "Quiet"} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel style={{ marginBottom: "var(--space-1)" }}>
          Top Members
        </SectionLabel>
        {SELECTED_GYM.topMembers.map((m) => (
          <RankRow
            key={m.rank}
            rank={m.rank}
            name={m.name}
            subtitle={m.subtitle}
            value={m.elo}
            delta={m.delta}
          />
        ))}
      </div>
    </aside>
  );
}
