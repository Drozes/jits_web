import * as React from "react";
import {
  Plate,
  LivePill,
  MetaTag,
  Wordmark,
  RankRow,
} from "@/components/ui/elo-system";
import { SectionLabel } from "../_frame";
import { FIXTURES, STORIES, RANKINGS, NAV_ITEMS } from "../_data";
import type { Fixture, Story } from "../_data";

// Concept 7 - ESPN-style scores + news (Home / Live "scoreboard").
// Borrows ESPN's web grammar: a live scores ticker pinned across the top, a
// dense main column of featured story + result cards, and a standings rail.
// Static visual mock - no interactivity, no fetching.
export function EspnScores() {
  const featured = STORIES.find((s) => s.featured) ?? STORIES[0];
  const rest = STORIES.filter((s) => s.id !== featured.id);

  return (
    <div style={{ minHeight: 760 }}>
      <SiteBar />
      <ScoresTicker />
      <div
        className="grid"
        style={{
          gridTemplateColumns: "minmax(0, 1fr) 320px",
          gap: "var(--space-6)",
          padding: "var(--space-6)",
        }}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
          <FeaturedStory story={featured} />

          <div>
            <SectionLabel style={{ marginBottom: "var(--space-3)" }}>
              Latest Results
            </SectionLabel>
            <div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "var(--space-3)",
              }}
            >
              {FIXTURES.map((fx) => (
                <ResultCard key={fx.id} fixture={fx} />
              ))}
            </div>
          </div>

          <div>
            <SectionLabel style={{ marginBottom: "var(--space-3)" }}>
              More Headlines
            </SectionLabel>
            <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
              {rest.map((s) => (
                <HeadlineRow key={s.id} story={s} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col" style={{ gap: "var(--space-5)" }}>
          <div>
            <SectionLabel style={{ marginBottom: "var(--space-3)" }}>
              Top 10
            </SectionLabel>
            <div
              style={{
                border: "1px solid var(--border-hairline)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
              }}
            >
              {RANKINGS.slice(0, 8).map((r) => (
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

          <Plate variant="accent">
            <SectionLabel style={{ marginBottom: "var(--space-2)" }}>
              Tonight
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
              <span style={{ fontWeight: 700 }}>Ryan vs Meregali</span> &mdash;
              main mat, live.
            </p>
          </Plate>
        </div>
      </div>
    </div>
  );
}

function SiteBar() {
  return (
    <header
      className="flex items-center justify-between"
      style={{
        height: 52,
        padding: "0 var(--space-6)",
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-hairline)",
      }}
    >
      <div className="flex items-center" style={{ gap: "var(--space-6)" }}>
        <Wordmark size="md" />
        <nav className="flex items-center" style={{ gap: "var(--space-1)" }}>
          {[{ label: "Scores", key: "scores" }, ...NAV_ITEMS].map((item) => {
            const active = item.key === "scores";
            return (
              <span
                key={item.key}
                className="font-heading font-bold uppercase"
                style={{
                  fontSize: "var(--size-label-l)",
                  letterSpacing: "var(--ls-caps)",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-xs)",
                  borderBottom: `2px solid ${active ? "var(--accent-cta)" : "transparent"}`,
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                {item.label}
              </span>
            );
          })}
        </nav>
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
        Watch Live
      </button>
    </header>
  );
}

function lastName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? full;
}

function ScoresTicker() {
  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        borderTop: "1px solid var(--border-hairline)",
        borderBottom: "1px solid var(--border-hairline)",
        padding: "var(--space-2) var(--space-4)",
      }}
    >
      <div
        className="flex flex-wrap"
        style={{ gap: "var(--space-3)", alignItems: "stretch" }}
      >
        {FIXTURES.map((fx) => (
          <TickerChip key={fx.id} fixture={fx} />
        ))}
      </div>
    </div>
  );
}

function TickerStatus({ fixture }: { fixture: Fixture }) {
  if (fixture.status === "LIVE") {
    return <LivePill label="LIVE" />;
  }
  return (
    <span
      className="font-mono uppercase"
      style={{
        fontSize: "var(--size-num-xs)",
        color: "var(--text-tertiary)",
        letterSpacing: "var(--ls-caps-l)",
        fontWeight: 700,
      }}
    >
      {fixture.status === "FINAL" ? "FINAL" : fixture.statusDetail}
    </span>
  );
}

function TickerChip({ fixture }: { fixture: Fixture }) {
  return (
    <div
      className="flex flex-col"
      style={{
        flex: "1 1 0",
        minWidth: 150,
        gap: "var(--space-1)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-xs)",
        padding: "var(--space-2) var(--space-3)",
      }}
    >
      <TickerStatus fixture={fixture} />
      <TickerSide
        name={lastName(fixture.a.name)}
        score={fixture.a.score}
        win={fixture.winner === "a"}
      />
      <TickerSide
        name={lastName(fixture.b.name)}
        score={fixture.b.score}
        win={fixture.winner === "b"}
      />
    </div>
  );
}

function TickerSide({
  name,
  score,
  win,
}: {
  name: string;
  score: string;
  win: boolean;
}) {
  return (
    <div className="flex items-center justify-between" style={{ gap: "var(--space-3)" }}>
      <span
        className="font-heading"
        style={{
          fontSize: "var(--size-label-l)",
          color: win ? "var(--text-primary)" : "var(--text-secondary)",
          fontWeight: win ? 700 : 400,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {name}
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: "var(--size-num-s)",
          color: win ? "var(--text-primary)" : "var(--text-secondary)",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {score}
      </span>
    </div>
  );
}

function FeaturedStory({ story }: { story: Story }) {
  return (
    <Plate style={{ padding: 0, overflow: "hidden" }}>
      <div
        className="flex items-center justify-center"
        style={{
          height: 180,
          background:
            "repeating-linear-gradient(135deg, var(--bg-secondary) 0px, var(--bg-secondary) 11px, var(--bg-elevated) 11px, var(--bg-elevated) 22px)",
          borderBottom: "1px solid var(--border-hairline)",
        }}
      >
        <span
          className="font-mono uppercase"
          style={{
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            letterSpacing: "var(--ls-caps-xl)",
            fontWeight: 700,
          }}
        >
          ELO RATED · FEATURED
        </span>
      </div>
      <div className="flex flex-col" style={{ gap: "var(--space-3)", padding: "var(--space-5)" }}>
        <div>
          <MetaTag>{story.tag}</MetaTag>
        </div>
        <h1
          className="font-heading font-bold"
          style={{
            fontSize: "var(--size-heading-l)",
            color: "var(--text-primary)",
            lineHeight: "var(--lh-tight)",
            margin: 0,
          }}
        >
          {story.headline}
        </h1>
        <p
          className="font-body"
          style={{
            fontSize: "var(--size-body-s)",
            color: "var(--text-secondary)",
            lineHeight: "var(--lh-relaxed)",
            margin: 0,
          }}
        >
          {story.dek}
        </p>
        <div
          className="font-mono uppercase"
          style={{
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            letterSpacing: "var(--ls-caps-l)",
          }}
        >
          {story.timeAgo}
        </div>
      </div>
    </Plate>
  );
}

function ResultCard({ fixture }: { fixture: Fixture }) {
  return (
    <div
      className="flex flex-col"
      style={{
        gap: "var(--space-3)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-4)",
      }}
    >
      <div style={{ minHeight: 16 }}>
        {fixture.status === "LIVE" ? (
          <LivePill label="LIVE" />
        ) : (
          <span
            className="font-mono uppercase"
            style={{
              fontSize: "var(--size-num-xs)",
              color: "var(--text-tertiary)",
              letterSpacing: "var(--ls-caps-l)",
              fontWeight: 700,
            }}
          >
            {fixture.statusDetail}
          </span>
        )}
      </div>
      <ResultSide athlete={fixture.a} win={fixture.winner === "a"} />
      <div style={{ borderTop: "1px solid var(--border-hairline)" }} />
      <ResultSide athlete={fixture.b} win={fixture.winner === "b"} />
    </div>
  );
}

function ResultSide({
  athlete,
  win,
}: {
  athlete: Fixture["a"];
  win: boolean;
}) {
  return (
    <div className="flex items-center justify-between" style={{ gap: "var(--space-3)" }}>
      <div style={{ minWidth: 0 }}>
        <div
          className="font-heading"
          style={{
            fontSize: "var(--size-heading-s)",
            color: win ? "var(--text-primary)" : "var(--text-secondary)",
            fontWeight: 700,
            lineHeight: 1.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {athlete.name}
        </div>
        <div
          className="font-mono"
          style={{
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            fontVariantNumeric: "tabular-nums",
            marginTop: 2,
          }}
        >
          {athlete.elo} ELO
        </div>
      </div>
      <span
        className="font-mono"
        style={{
          fontSize: "var(--size-num-l)",
          color: win ? "var(--state-positive)" : "var(--text-secondary)",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {athlete.score}
      </span>
    </div>
  );
}

function HeadlineRow({ story }: { story: Story }) {
  return (
    <div
      className="flex items-center"
      style={{
        gap: "var(--space-3)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-xs)",
        padding: "var(--space-3) var(--space-4)",
      }}
    >
      <MetaTag>{story.tag}</MetaTag>
      <span
        className="font-heading font-bold"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: "var(--size-label-l)",
          color: "var(--text-primary)",
          lineHeight: 1.2,
        }}
      >
        {story.headline}
      </span>
      <span
        className="font-mono uppercase"
        style={{
          fontSize: "var(--size-num-xs)",
          color: "var(--text-tertiary)",
          letterSpacing: "var(--ls-caps-l)",
          whiteSpace: "nowrap",
        }}
      >
        {story.timeAgo}
      </span>
    </div>
  );
}
