import * as React from "react";
import {
  Plate,
  Chip,
  MetaTag,
  Avatar32,
  Wordmark,
  OutcomeTag,
  DeltaNumber,
  DataRow,
} from "@/components/ui/elo-system";
import { SectionLabel } from "../_frame";
import {
  ACTIVITY_FEED,
  WEEKLY_SUMMARY,
  SUGGESTED_ATHLETES,
  CURRENT_ATHLETE,
  NAV_ITEMS,
  type ActivityPost,
} from "../_data";

// Concept 6 - Strava-inspired social activity feed (Home / Activity).
// The signature 3-column web shell: a profile-led left rail, a centered column
// of activity cards (each with a stat strip, a stylized "route map" stand-in,
// kudos + comments), and a right context rail (weekly training summary +
// suggested athletes). Non-interactive visual mock.
export function StravaFeed() {
  return (
    <div
      className="grid"
      style={{
        minHeight: 760,
        gridTemplateColumns: "240px minmax(0, 1fr) 300px",
        gap: "var(--space-6)",
        padding: "var(--space-6)",
      }}
    >
      <ProfileRail />
      <FeedColumn />
      <ContextRail />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LEFT COLUMN - profile card + nav
// ---------------------------------------------------------------------------

function ProfileRail() {
  return (
    <div className="flex flex-col gap-5" style={{ minWidth: 0 }}>
      <Wordmark size="md" />
      <ProfileCard />
      <ProfileNav />
    </div>
  );
}

function ProfileCard() {
  const { wins, losses, draws } = CURRENT_ATHLETE.record;
  return (
    <Plate>
      <div className="flex items-center gap-3" style={{ marginBottom: "var(--space-3)" }}>
        <Avatar64 name={CURRENT_ATHLETE.name} />
        <div style={{ minWidth: 0 }}>
          <div
            className="font-heading font-bold truncate"
            style={{
              fontSize: "var(--size-heading-s)",
              color: "var(--text-primary)",
              lineHeight: "var(--lh-snug)",
            }}
          >
            {CURRENT_ATHLETE.name}
          </div>
          <div
            className="font-mono uppercase truncate"
            style={{
              fontSize: "var(--size-num-xs)",
              color: "var(--text-tertiary)",
              letterSpacing: "var(--ls-caps-l)",
              marginTop: 2,
            }}
          >
            {CURRENT_ATHLETE.belt} Belt · {CURRENT_ATHLETE.gym}
          </div>
        </div>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-2)",
          paddingTop: "var(--space-3)",
          borderTop: "1px solid var(--border-hairline)",
        }}
      >
        <ProfileStatCell label="ELO" value={`${CURRENT_ATHLETE.elo}`} />
        <ProfileStatCell label="Rank" value={`#${CURRENT_ATHLETE.rank}`} />
      </div>

      <div
        className="font-mono"
        style={{
          fontSize: "var(--size-num-s)",
          color: "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          marginTop: "var(--space-3)",
        }}
      >
        {wins}W · {losses}L · {draws}D
      </div>

      <div
        className="font-mono uppercase"
        style={{
          fontSize: "var(--size-num-xs)",
          color: "var(--text-tertiary)",
          letterSpacing: "var(--ls-caps-l)",
          marginTop: "var(--space-1)",
        }}
      >
        Following 128 · Followers 342
      </div>

      <button
        type="button"
        className="font-heading font-bold uppercase"
        style={{
          width: "100%",
          marginTop: "var(--space-4)",
          background: "var(--accent-cta)",
          color: "var(--text-on-accent)",
          padding: "var(--space-3)",
          fontSize: "var(--size-label-l)",
          letterSpacing: "var(--ls-caps)",
          borderRadius: "var(--radius-sm)",
          border: "none",
          cursor: "pointer",
        }}
      >
        Record Activity
      </button>
    </Plate>
  );
}

function ProfileStatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="font-mono"
        style={{
          fontSize: "var(--size-num-m)",
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          lineHeight: "var(--lh-tight)",
        }}
      >
        {value}
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
        {label}
      </div>
    </div>
  );
}

const PROFILE_NAV = [
  { label: "Activity", key: "activity" },
  ...NAV_ITEMS,
] as const;

function ProfileNav() {
  return (
    <nav className="flex flex-col gap-1">
      {PROFILE_NAV.map((item, i) => {
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
  );
}

// 64px square initials avatar (Avatar32 is fixed at 32px). Sharp corners,
// mono initials, on-brand. Mirrors Avatar32's initials treatment.
function Avatar64({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0]?.toUpperCase() ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0]?.toUpperCase() ?? "" : "";
  const initials = last ? `${first}·${last}` : first;
  return (
    <span
      aria-label={name}
      className="font-mono"
      style={{
        width: 64,
        height: 64,
        flexShrink: 0,
        borderRadius: "var(--radius-xs)",
        border: "1px solid var(--border-hairline-strong)",
        background: "var(--bg-elevated-hover)",
        display: "grid",
        placeItems: "center",
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

// ---------------------------------------------------------------------------
// CENTER COLUMN - the feed
// ---------------------------------------------------------------------------

function FeedColumn() {
  return (
    <div className="flex flex-col" style={{ minWidth: 0, gap: "var(--space-4)" }}>
      <div className="flex items-center justify-between">
        <SectionLabel>Activity Feed</SectionLabel>
        <div className="flex gap-2">
          <Chip active>Following</Chip>
          <Chip>You</Chip>
          <Chip>Gym</Chip>
        </div>
      </div>

      {ACTIVITY_FEED.map((post) => (
        <FeedCard key={post.id} post={post} />
      ))}
    </div>
  );
}

function FeedCard({ post }: { post: ActivityPost }) {
  return (
    <Plate>
      {/* 1 - header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
          <Avatar32 name={post.athlete} />
          <div style={{ minWidth: 0 }}>
            <div
              className="font-heading font-bold truncate"
              style={{ fontSize: "var(--size-label-l)", color: "var(--text-primary)" }}
            >
              {post.athlete}
            </div>
            <div
              className="font-mono uppercase truncate"
              style={{
                fontSize: "var(--size-num-xs)",
                color: "var(--text-tertiary)",
                letterSpacing: "var(--ls-caps-l)",
                marginTop: 2,
              }}
            >
              {post.timeAgo} · {post.location}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
          <MetaTag>{post.kind === "match" ? "Match" : "Training"}</MetaTag>
          {post.result && <OutcomeTag outcome={post.result} />}
        </div>
      </div>

      {/* 2 - title */}
      <h3
        className="font-heading font-bold"
        style={{
          fontSize: "var(--size-heading-s)",
          color: "var(--text-primary)",
          lineHeight: "var(--lh-snug)",
          margin: "var(--space-3) 0 0",
        }}
      >
        {post.title}
      </h3>

      {/* 3 - stats strip */}
      <div
        className="flex items-stretch"
        style={{ marginTop: "var(--space-3)", gap: "var(--space-5)" }}
      >
        {post.stats.map((stat) => (
          <StatCell key={stat.label} label={stat.label} value={stat.value} />
        ))}
        {typeof post.eloDelta === "number" && (
          <div className="flex flex-col justify-center" style={{ marginLeft: "auto" }}>
            <DeltaNumber value={post.eloDelta} size="m" showSign />
            <span
              className="font-mono uppercase"
              style={{
                fontSize: "var(--size-num-xs)",
                color: "var(--text-tertiary)",
                letterSpacing: "var(--ls-caps-l)",
                marginTop: 2,
                textAlign: "right",
              }}
            >
              ELO Delta
            </span>
          </div>
        )}
      </div>

      {/* 4 - stylized "route map" / mat-grid stand-in */}
      <div
        className="flex items-center justify-center"
        style={{
          height: 72,
          marginTop: "var(--space-4)",
          borderRadius: "var(--radius-xs)",
          border: "1px solid var(--border-hairline)",
          background: "var(--bg-secondary)",
          backgroundImage:
            "repeating-linear-gradient(90deg, var(--border-hairline) 0 1px, transparent 1px 24px), repeating-linear-gradient(0deg, var(--border-hairline) 0 1px, transparent 1px 24px)",
        }}
      >
        <span
          className="font-mono uppercase"
          style={{
            fontSize: "var(--size-num-xs)",
            color: "var(--text-secondary)",
            letterSpacing: "var(--ls-caps-l)",
            background: "var(--bg-secondary)",
            padding: "var(--space-1) var(--space-3)",
          }}
        >
          {post.location}
        </span>
      </div>

      {/* 5 - footer: kudos + comments */}
      <div
        className="flex items-center gap-5"
        style={{
          marginTop: "var(--space-4)",
          paddingTop: "var(--space-3)",
          borderTop: "1px solid var(--border-hairline)",
        }}
      >
        <KudosAffordance kudos={post.kudos} youKudosed={post.youKudosed} />
        <CommentAffordance comments={post.comments} />
      </div>
    </Plate>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="font-mono"
        style={{
          fontSize: "var(--size-num-m)",
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          lineHeight: "var(--lh-tight)",
        }}
      >
        {value}
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
        {label}
      </div>
    </div>
  );
}

function KudosAffordance({ kudos, youKudosed }: { kudos: number; youKudosed: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        style={{
          fontSize: "var(--size-num-s)",
          color: youKudosed ? "var(--accent-cta)" : "var(--text-tertiary)",
          lineHeight: 1,
        }}
      >
        ▲
      </span>
      <span
        className="font-heading font-bold uppercase"
        style={{
          fontSize: "var(--size-label-s)",
          letterSpacing: "var(--ls-caps)",
          color: "var(--text-secondary)",
        }}
      >
        Give Kudos
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: "var(--size-num-s)",
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
        }}
      >
        {kudos}
      </span>
    </span>
  );
}

function CommentAffordance({ comments }: { comments: number }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        style={{
          fontSize: "var(--size-num-s)",
          color: "var(--text-tertiary)",
          lineHeight: 1,
        }}
      >
        ▢
      </span>
      <span
        className="font-heading font-bold uppercase"
        style={{
          fontSize: "var(--size-label-s)",
          letterSpacing: "var(--ls-caps)",
          color: "var(--text-secondary)",
        }}
      >
        Comment
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: "var(--size-num-s)",
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
        }}
      >
        {comments}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// RIGHT COLUMN - context rail
// ---------------------------------------------------------------------------

function ContextRail() {
  return (
    <div className="flex flex-col gap-5" style={{ minWidth: 0 }}>
      <Plate>
        <SectionLabel style={{ marginBottom: "var(--space-3)" }}>Your Week</SectionLabel>
        <div className="flex flex-col gap-2">
          {WEEKLY_SUMMARY.map((row) => (
            <DataRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      </Plate>

      <Plate>
        <SectionLabel style={{ marginBottom: "var(--space-3)" }}>
          Suggested Athletes
        </SectionLabel>
        <div className="flex flex-col gap-3">
          {SUGGESTED_ATHLETES.map((athlete) => (
            <SuggestedRow
              key={athlete.id}
              name={athlete.name}
              subtitle={athlete.subtitle}
            />
          ))}
        </div>
      </Plate>

      <Plate variant="accent">
        <SectionLabel style={{ marginBottom: "var(--space-2)" }}>
          This Week&apos;s Challenge
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
          Log 5 ranked matches before Sunday to keep your streak alive.
        </p>
      </Plate>
    </div>
  );
}

function SuggestedRow({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
      <Avatar32 name={name} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          className="font-heading font-bold truncate"
          style={{ fontSize: "var(--size-label-l)", color: "var(--text-primary)" }}
        >
          {name}
        </div>
        <div
          className="font-mono uppercase truncate"
          style={{
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            letterSpacing: "var(--ls-caps-l)",
            marginTop: 2,
          }}
        >
          {subtitle}
        </div>
      </div>
      <span
        className="font-heading font-bold uppercase"
        style={{
          flexShrink: 0,
          fontSize: "var(--size-label-s)",
          letterSpacing: "var(--ls-caps)",
          color: "var(--text-secondary)",
          padding: "var(--space-1) var(--space-3)",
          border: "1px solid var(--border-hairline-strong)",
          borderRadius: "var(--radius-xs)",
        }}
      >
        Follow
      </span>
    </div>
  );
}
