import * as React from "react";
import {
  EloTile,
  LivePill,
  MetaTag,
  Chip,
  Wordmark,
  ParticipantRow,
} from "@/components/ui/elo-system";
import { SectionLabel } from "../_frame";
import { ARENA } from "../_data";

// Concept - Split-Screen / Immersive Arena.
// Bold full-bleed vertical split (~55% / 45%): an editorial, image-forward
// featured-matchup hero on the left, an actionable "available now" matchmaking
// list on the right. Deliberately NOT a grid of cards - it reads like a fight
// poster paired with a live roster.
export function SplitArena() {
  return (
    <div className="flex" style={{ minHeight: 760 }}>
      <HeroPane />
      <ListPane />
    </div>
  );
}

function HeroPane() {
  const { left, right, sessionLabel } = ARENA.featured;
  return (
    <section
      className="flex flex-col justify-between"
      style={{
        flexBasis: "55%",
        flexShrink: 0,
        // Layered gradient on top of the elevated surface gives depth without
        // any drop shadow (brand rule).
        background:
          "linear-gradient(160deg, var(--bg-secondary), var(--bg-primary))",
        padding: "var(--space-10)",
      }}
    >
      {/* Top row: wordmark + live status */}
      <div className="flex items-center justify-between">
        <Wordmark size="md" />
        <LivePill label="Live Now" />
      </div>

      {/* Featured matchup */}
      <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
        <SectionLabel>Tonight&apos;s Featured Match</SectionLabel>

        <div
          className="grid items-center"
          style={{
            gridTemplateColumns: "1fr auto 1fr",
            gap: "var(--space-6)",
          }}
        >
          <FeaturedAthlete athlete={left} align="left" />
          <VersusMark />
          <FeaturedAthlete athlete={right} align="right" />
        </div>

        <div
          className="font-mono uppercase"
          style={{
            fontSize: "var(--size-num-xs)",
            letterSpacing: "var(--ls-caps-l)",
            color: "var(--text-tertiary)",
            fontWeight: 700,
          }}
        >
          {sessionLabel}
        </div>

        {/* The single primary Signal-Red CTA on the whole surface. */}
        <button
          type="button"
          className="inline-flex items-center self-start font-heading font-bold uppercase"
          style={{
            background: "var(--accent-cta)",
            color: "var(--text-on-accent)",
            padding: "var(--space-4) var(--space-7)",
            fontSize: "var(--size-heading-s)",
            letterSpacing: "var(--ls-caps)",
            borderRadius: "var(--radius-sm)",
            border: "none",
            cursor: "pointer",
            gap: "var(--space-3)",
          }}
        >
          Enter the Arena <span aria-hidden>→</span>
        </button>
      </div>

      {/* Bottom stat strip */}
      <div
        className="flex items-stretch"
        style={{
          gap: "var(--space-8)",
          borderTop: "1px solid var(--border-hairline)",
          paddingTop: "var(--space-5)",
        }}
      >
        <HeroStat value={ARENA.onlineCount} label="Athletes Online" />
        <HeroStat value={ARENA.liveSessions} label="Live Sessions" />
      </div>
    </section>
  );
}

function FeaturedAthlete({
  athlete,
  align,
}: {
  athlete: { name: string; gym: string; elo: number; weightLbs: number };
  align: "left" | "right";
}) {
  const alignItems = align === "right" ? "flex-end" : "flex-start";
  return (
    <div
      className="flex flex-col"
      style={{
        alignItems,
        gap: "var(--space-3)",
        textAlign: align,
        minWidth: 0,
      }}
    >
      <h2
        className="font-heading font-bold"
        style={{
          fontSize: "var(--size-heading-xl)",
          color: "var(--text-primary)",
          lineHeight: "var(--lh-tight)",
          margin: 0,
        }}
      >
        {athlete.name}
      </h2>
      <MetaTag>{athlete.gym}</MetaTag>
      <EloTile size="hero" label="ELO" value={athlete.elo} />
    </div>
  );
}

function VersusMark() {
  return (
    <div
      className="font-mono"
      style={{
        fontSize: "var(--size-num-xxl)",
        fontWeight: 700,
        color: "var(--text-tertiary)",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "0.04em",
        lineHeight: 1,
      }}
      aria-hidden
    >
      VS
    </div>
  );
}

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col" style={{ gap: 2 }}>
      <div
        className="font-mono"
        style={{
          fontSize: "var(--size-num-xl)",
          fontWeight: 700,
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        className="font-mono uppercase"
        style={{
          fontSize: "var(--size-num-xs)",
          letterSpacing: "var(--ls-caps-l)",
          color: "var(--text-tertiary)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

const FILTERS = ["All", "My Weight", "Ranked", "Casual"] as const;

function ListPane() {
  const readyCount = ARENA.available.filter(
    (a) => a.status === "available",
  ).length;
  return (
    <section
      className="flex flex-1 flex-col"
      style={{
        minWidth: 0,
        background: "var(--bg-primary)",
        padding: "var(--space-8)",
        borderLeft: "1px solid var(--border-hairline)",
        gap: "var(--space-5)",
      }}
    >
      <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
        <h2
          className="font-heading font-bold"
          style={{
            fontSize: "var(--size-heading-m)",
            color: "var(--text-primary)",
            margin: 0,
            lineHeight: "var(--lh-snug)",
          }}
        >
          Available Now
        </h2>
        <div className="flex flex-wrap" style={{ gap: "var(--space-2)" }}>
          {FILTERS.map((f, i) => (
            <Chip key={f} active={i === 0}>
              {f}
            </Chip>
          ))}
        </div>
      </div>

      <SectionLabel>{readyCount} ready to roll</SectionLabel>

      <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
        {ARENA.available.map((a) => (
          <ParticipantRow
            key={a.id}
            name={a.name}
            subtitle={a.subtitle}
            status={a.status}
            action={
              a.status === "available" ? <ChallengeChip /> : undefined
            }
          />
        ))}
      </div>

      <div
        className="font-mono uppercase"
        style={{
          marginTop: "auto",
          fontSize: "var(--size-num-xs)",
          letterSpacing: "var(--ls-caps-l)",
          color: "var(--text-tertiary)",
        }}
      >
        Updated live · matchmaking is web-only.
      </div>
    </section>
  );
}

// Neutral, bordered pseudo-button. Intentionally NOT Signal-Red - the only
// red CTA on this surface is "Enter the Arena".
function ChallengeChip() {
  return (
    <span
      className="font-heading font-bold uppercase"
      style={{
        fontSize: "var(--size-label-l)",
        letterSpacing: "var(--ls-caps)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border-hairline-strong)",
        borderRadius: "var(--radius-xs)",
        padding: "var(--space-2) var(--space-3)",
        whiteSpace: "nowrap",
        lineHeight: 1,
      }}
    >
      Challenge
    </span>
  );
}
