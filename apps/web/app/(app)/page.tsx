import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { RecentActivitySection } from "@/components/domain/recent-activity-section";
import { ResumeMatchCard } from "@/components/domain/resume-match-card";
import { LEFT_MATCHES_COOKIE, parseLeftMatches } from "@/lib/arena/left-matches";
import { PageContainer } from "@/components/layout/page-container";
import { DashboardHeaderShell } from "@/components/layout/dashboard-header-shell";
import {
  Plate,
  EloTile,
  LivePill,
  MetaTag,
  Avatar32,
} from "@/components/ui/elo-system";
import {
  getDashboardSummary,
  getActiveSession,
  getMyActiveMatch,
  type AthleteGuardRow,
} from "@jits/shared/api/queries";
import type { ActiveSessionInfo } from "@jits/shared/types/session";
import { formatTimeUntil } from "@jits/shared/utils";

function DashboardSkeleton() {
  return (
    <div
      className="flex flex-col animate-pulse"
      style={{ gap: "var(--space-5)" }}
    >
      <div
        style={{
          height: 16,
          width: 120,
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius-xs)",
        }}
      />
      <div
        style={{
          height: 28,
          width: 200,
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius-xs)",
        }}
      />
      <div
        style={{
          height: 140,
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius-md)",
        }}
      />
      <div
        style={{
          height: 100,
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius-md)",
        }}
      />
    </div>
  );
}

export default function DashboardPage() {
  // The auth + activation guard (requireAthlete) runs inside DashboardHeader
  // and DashboardContent, both of which sit inside <Suspense>. Keep this page
  // component synchronous: awaiting uncached data (cookies/DB) here, outside a
  // Suspense boundary, violates Next.js 16 Cache Components and breaks the
  // prerender of "/".
  return (
    <>
      <Suspense fallback={<DashboardHeaderFallback />}>
        <DashboardHeader />
      </Suspense>
      <PageContainer wide className="pt-6">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent />
        </Suspense>
      </PageContainer>
    </>
  );
}

function DashboardHeaderFallback() {
  return <DashboardHeaderShell avatar={null} />;
}

async function DashboardHeader() {
  const { athlete } = await requireAthlete();
  return (
    <DashboardHeaderShell
      avatar={
        <Avatar32
          name={athlete.display_name}
          photoUrl={athlete.profile_photo_url}
        />
      }
    />
  );
}

async function DashboardContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();
  // Pending Arena matches the athlete left on purpose are not offered again
  // (mobile parity, see `lib/arena/left-matches.ts`).
  const left = parseLeftMatches(
    (await cookies()).get(LEFT_MATCHES_COOKIE)?.value,
    athlete.id,
  );

  const [summary, activeSession, activeMatchRead] = await Promise.all([
    getDashboardSummary(supabase),
    getActiveSession(supabase, athlete.id),
    getMyActiveMatch(supabase, athlete.id, Date.now(), left),
  ]);
  // A failed read just shows no card; Home still renders.
  const activeMatch = activeMatchRead.ok ? activeMatchRead.data : null;

  const recentMatches = summary.recent_matches.map((m) => ({
    id: m.match_id,
    opponentName: m.opponent_name,
    result: m.outcome,
    matchType: m.match_type as "ranked" | "casual",
    eloDelta: m.elo_delta,
    date: m.completed_at,
  }));

  const recentActivity = summary.recent_activity.map((a) => ({
    id: a.match_id,
    winnerName: a.winner_name,
    loserName: a.loser_name,
    result: a.result,
    matchType: a.match_type,
    date: a.completed_at,
  }));

  const hasMatches = recentMatches.length > 0 || recentActivity.length > 0;
  const isSessionLive =
    activeSession !== null && activeSession.status === "active";

  return (
    <div
      className="flex flex-col animate-page-in"
      style={{ gap: "var(--space-5)" }}
    >
      <div>
        <MetaLabel style={{ marginBottom: "var(--space-2)" }}>
          Welcome back
        </MetaLabel>
        <h1
          className="font-heading font-bold"
          style={{
            fontSize: "var(--size-heading-l)",
            color: "var(--text-primary)",
            lineHeight: "var(--lh-tight)",
            margin: 0,
          }}
        >
          {athlete.display_name}
        </h1>
      </div>

      {activeMatch ? <ResumeMatchCard match={activeMatch} /> : null}

      <EloTile
        size="hero"
        label="Current ELO Rating"
        value={athlete.current_elo}
        accentBar
      />

      {isSessionLive ? (
        // Resume, when offered, is Home's one Signal Red CTA.
        <LiveSessionPlate session={activeSession} secondary={!!activeMatch} />
      ) : (
        <UpcomingSessionPlate session={activeSession} athlete={athlete} />
      )}

      <RecentActivityBlock
        hasMatches={hasMatches}
        myMatches={recentMatches}
        allActivity={recentActivity}
      />

      <RecordBlock summary={summary.stats} />

      {!isSessionLive && (
        <Plate variant="accent">
          <p
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: "var(--size-body)",
              lineHeight: "var(--lh-relaxed)",
              margin: 0,
            }}
          >
            Your gym hasn&apos;t designated a live session yet. Check the
            schedule or browse other gyms in your city.
          </p>
        </Plate>
      )}
    </div>
  );
}

function MetaLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="font-mono uppercase"
      style={{
        fontSize: "var(--size-num-xs)",
        letterSpacing: "var(--ls-caps-l)",
        color: "var(--text-tertiary)",
        fontWeight: 700,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function LiveSessionPlate({
  session,
  secondary = false,
}: {
  session: ActiveSessionInfo;
  secondary?: boolean;
}) {
  const startedAt = new Date(session.scheduledStart).getTime();
  const minsAgo = Math.max(0, Math.floor((Date.now() - startedAt) / 60_000));
  const href = session.isCheckedIn
    ? `/session/${session.sessionId}/lobby`
    : `/session/${session.sessionId}/join`;

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
          {session.gymName}
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
        {session.participantCount} athletes in lobby · Session started{" "}
        {minsAgo} min ago
      </div>
      <Link
        href={href}
        className="inline-flex w-full items-center justify-center font-heading font-bold uppercase transition-colors"
        style={{
          background: secondary ? "transparent" : "var(--accent-cta)",
          color: secondary ? "var(--text-primary)" : "var(--text-on-accent)",
          border: secondary ? "1px solid var(--border-hairline)" : "none",
          padding: "var(--space-3) var(--space-5)",
          fontSize: "var(--size-label-l)",
          letterSpacing: "var(--ls-caps)",
          borderRadius: "var(--radius-sm)",
          textDecoration: "none",
          gap: "var(--space-2)",
        }}
      >
        Enter Lobby <span aria-hidden>→</span>
      </Link>
    </Plate>
  );
}

function UpcomingSessionPlate({
  session,
  athlete,
}: {
  session: ActiveSessionInfo | null;
  athlete: AthleteGuardRow;
}) {
  if (!session) {
    return (
      <Plate>
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
            No upcoming session
          </h2>
          <MetaTag>Find a gym</MetaTag>
        </div>
        <p
          style={{
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--size-body-s)",
            margin: 0,
            marginBottom: "var(--space-2)",
          }}
        >
          {athlete.primary_gym_id
            ? "Your gym hasn't scheduled a session yet."
            : "Pick a primary gym to see upcoming open mats."}
        </p>
        <Link
          href="/gyms"
          className="font-mono uppercase"
          style={{
            fontSize: "var(--size-num-xs)",
            letterSpacing: "var(--ls-caps-l)",
            color: "var(--accent-cta-text)",
            textDecoration: "none",
          }}
        >
          Browse gyms →
        </Link>
      </Plate>
    );
  }

  const startsHint = formatTimeUntil(session.scheduledStart);
  const scheduledLabel = new Date(session.scheduledStart).toLocaleString(
    undefined,
    {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
    },
  );

  return (
    <Plate>
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
          {session.gymName}
        </h2>
        <MetaTag>{startsHint ?? "Upcoming"}</MetaTag>
      </div>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--size-body-s)",
          color: "var(--text-secondary)",
          margin: 0,
          marginBottom: "var(--space-2)",
        }}
      >
        Next session: {scheduledLabel}
      </p>
      <div
        className="font-mono uppercase"
        style={{
          fontSize: "var(--size-num-xs)",
          letterSpacing: "var(--ls-caps-l)",
          color: "var(--text-tertiary)",
        }}
      >
        {session.participantCount} athletes RSVP&apos;d
      </div>
    </Plate>
  );
}

function RecentActivityBlock({
  hasMatches,
  myMatches,
  allActivity,
}: {
  hasMatches: boolean;
  myMatches: React.ComponentProps<typeof RecentActivitySection>["myMatches"];
  allActivity: React.ComponentProps<
    typeof RecentActivitySection
  >["allActivity"];
}) {
  if (!hasMatches) {
    return (
      <div>
        <MetaLabel style={{ marginBottom: "var(--space-2)" }}>
          Recent Activity
        </MetaLabel>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--size-body)",
            color: "var(--text-secondary)",
            margin: 0,
          }}
        >
          No matches yet, your first match is waiting.
        </p>
      </div>
    );
  }
  return (
    <RecentActivitySection myMatches={myMatches} allActivity={allActivity} />
  );
}

function RecordBlock({
  summary,
}: {
  summary: { wins: number; losses: number; draws: number };
}) {
  return (
    <div>
      <MetaLabel style={{ marginBottom: "var(--space-2)" }}>Record</MetaLabel>
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
        {summary.wins}W · {summary.losses}L · {summary.draws}D
      </div>
    </div>
  );
}
