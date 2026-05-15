"use client";

import { useState } from "react";
import {
  Plate,
  LivePill,
  Chip,
  EloTile,
  DeltaNumber,
  RankRow,
  MetaTag,
  OutcomeTag,
  ParticipantRow,
  Avatar32,
  Wordmark,
  DataRow,
} from "@/components/ui/elo-system";

const LADDER = [
  { rank: 1, name: "Tristan Charbonneau", subtitle: "10th Planet Toronto · −77 kg", value: 2487, delta: 12, leader: true },
  { rank: 2, name: "Slim Reaper", subtitle: "BJJ Globetrotters · −83 kg", value: 2451, delta: 8 },
  { rank: 3, name: "Carla Mendes", subtitle: "Brasa Toronto · −64 kg", value: 2403, delta: -4 },
  { rank: 4, name: "Hideo Tanaka", subtitle: "Polaris BJJ Vancouver · −70 kg", value: 2389, delta: 15 },
  { rank: 5, name: "Micah Brakefield", subtitle: "10th Planet Toronto · −83 kg", value: 2367, delta: -2 },
  { rank: 6, name: "Creonte Mike", subtitle: "Renzo Gracie Vancouver · −77 kg", value: 2342, delta: 7 },
  { rank: 7, name: "Devon Reyes", subtitle: "Apex Submissions · −83 kg", value: 2298, delta: 0 },
  { rank: 8, name: "Yelena Voskov", subtitle: "BJJ Globetrotters · −58 kg", value: 2271, delta: 3 },
  { rank: 9, name: "Mattie Spoons", subtitle: "10th Planet Toronto · −77 kg", value: 2244, delta: 9 },
  { rank: 10, name: "Marcus Chen", subtitle: "Polaris BJJ Vancouver · −93 kg", value: 2218, delta: -6 },
];

const FILTERS = ["Global", "My Gym", "−77 kg", "30-day", "Region"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "var(--space-12)" }}>
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "var(--size-heading-m)",
          textTransform: "uppercase",
          letterSpacing: "var(--ls-caps-l)",
          color: "var(--text-secondary)",
          marginBottom: "var(--space-4)",
        }}
      >
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

export default function EloSystemPreview() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeFilter, setActiveFilter] = useState("Global");

  return (
    <div
      data-theme={theme}
      style={{
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        minHeight: "100vh",
        padding: "var(--space-8)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "var(--space-3)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--size-display-s)",
              letterSpacing: "var(--ls-mark)",
              lineHeight: "var(--lh-display)",
              color: "var(--text-primary)",
            }}
          >
            ELO&nbsp;RATED
          </div>
          <div
            style={{
              display: "inline-flex",
              border: "1px solid var(--border-hairline-strong)",
              background: "var(--bg-elevated)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  background: theme === t ? "var(--bg-elevated-hover)" : "transparent",
                  color: theme === t ? "var(--text-primary)" : "var(--text-tertiary)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--size-num-xs)",
                  letterSpacing: "var(--ls-caps-l)",
                  textTransform: "uppercase",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Meta strip */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "var(--ls-caps-xl)",
            marginBottom: "var(--space-10)",
            paddingBottom: "var(--space-3)",
            borderBottom: "1px solid var(--border-hairline-faint)",
          }}
        >
          Design System · Primitives + Ladder
        </div>

        <Section title="Plate">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-3)" }}>
            {(["default", "accent", "live", "win", "loss"] as const).map((v) => (
              <Plate key={v} variant={v}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--size-num-xs)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "var(--ls-caps-xl)", marginBottom: "var(--space-2)" }}>
                  {v}
                </div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "var(--size-heading-s)" }}>
                  Plate surface
                </div>
              </Plate>
            ))}
          </div>
        </Section>

        <Section title="LivePill">
          <div style={{ display: "flex", gap: "var(--space-6)", alignItems: "center" }}>
            <LivePill />
            <LivePill label="LIVE · MAT 3" />
            <LivePill label="LIVE · 12,847 ONLINE" />
          </div>
        </Section>

        <Section title="Chip">
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {FILTERS.map((label) => (
              <Chip key={label} active={activeFilter === label} onClick={() => setActiveFilter(label)}>
                {label}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="EloTile">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)", alignItems: "flex-end" }}>
            <EloTile label="ELO" value={1843} size="hero" accent />
            <EloTile label="Peak" value={2244} size="large" />
            <EloTile label="Last" value={1821} size="medium" />
            <EloTile label="Wins" value={47} size="small" />
          </div>
          <div style={{ marginTop: "var(--space-4)" }}>
            <EloTile label="ELO" before={1821} after={1843} size="medium" accent />
          </div>
        </Section>

        <Section title="DeltaNumber">
          <div style={{ display: "flex", gap: "var(--space-6)", alignItems: "center" }}>
            <DeltaNumber value={22} size="l" />
            <DeltaNumber value={-14} size="l" />
            <DeltaNumber value={0} size="l" />
            <DeltaNumber value={22} size="m" showSign />
            <DeltaNumber value={-14} size="m" showSign />
            <DeltaNumber value={8} size="s" />
          </div>
        </Section>

        <Section title="MetaTag">
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <MetaTag>−77 kg</MetaTag>
            <MetaTag>No-Gi</MetaTag>
            <MetaTag>Sub-only</MetaTag>
            <MetaTag>−83 kg</MetaTag>
          </div>
        </Section>

        <Section title="OutcomeTag">
          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
            <OutcomeTag outcome="win" />
            <OutcomeTag outcome="loss" />
            <OutcomeTag outcome="draw" />
          </div>
        </Section>

        <Section title="ParticipantRow">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <ParticipantRow
              name="Tristan Charbonneau"
              subtitle="1650 · 77 kg"
              status="available"
              action={
                <button
                  type="button"
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 700,
                    fontSize: "var(--size-label-s)",
                    textTransform: "uppercase",
                    letterSpacing: "var(--ls-caps)",
                    padding: "var(--space-2) var(--space-3)",
                    background: "var(--accent-cta)",
                    color: "var(--text-on-accent)",
                    border: "1px solid transparent",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                >
                  Challenge
                </button>
              }
            />
            <ParticipantRow name="Creonte Mike" subtitle="1610 · 77 kg" status="busy" />
            <ParticipantRow name="Yelena Voskov" subtitle="1560 · 58 kg" status="self" />
          </div>
        </Section>

        <Section title="Avatar32">
          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
            <Avatar32 name="Mattie Spoons" />
            <Avatar32 name="Tristan Charbonneau" />
            <Avatar32 name="Carla Mendes" photoUrl="https://i.pravatar.cc/64?img=12" />
            <Avatar32 name="Hideo Tanaka" photoUrl="https://i.pravatar.cc/64?img=33" />
          </div>
        </Section>

        <Section title="Wordmark">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", alignItems: "flex-start" }}>
            <Wordmark size="sm" />
            <Wordmark size="md" />
            <Wordmark size="lg" />
            <Wordmark size="hero" />
          </div>
        </Section>

        <Section title="DataRow">
          <Plate>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <DataRow label="Method" value="SUBMISSION · ARMBAR" />
              <DataRow label="Opponent" value="CREONTE MIKE · 1610" />
              <DataRow label="Timekeeper" value="YELENA VOSKOV" />
              <DataRow label="Win Probability" value="29%" />
            </div>
          </Plate>
        </Section>

        <Section title="RankRow">
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <RankRow rank={1} name="Tristan Charbonneau" subtitle="10th Planet Toronto · −77 kg" value={2487} delta={12} leader />
            <RankRow rank={9} name="Mattie Spoons" subtitle="10th Planet Toronto · −77 kg" value={2244} delta={9} />
          </div>
        </Section>

        {/* Final showcase */}
        <Section title="F1 · Global Ladder Preview">
          <div style={{ marginBottom: "var(--space-3)", display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: "var(--size-num-xs)", textTransform: "uppercase", letterSpacing: "var(--ls-caps-xl)" }}>
            <span style={{ color: "var(--text-secondary)" }}>
              <span style={{ fontWeight: 600 }}>12,847</span>
              <span style={{ color: "var(--text-tertiary)" }}> · Athletes</span>
            </span>
            <LivePill />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {LADDER.map((row) => (
              <RankRow key={row.rank} {...row} />
            ))}
          </div>
          <div style={{ marginTop: 1 }}>
            <RankRow
              rank={847}
              name="Mattie Spoons"
              subtitle="10th Planet Toronto · −77 kg"
              value={1843}
              delta={22}
              you
            />
          </div>
        </Section>
      </div>
    </div>
  );
}
