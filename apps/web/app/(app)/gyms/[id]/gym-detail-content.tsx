import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getGymDetail, getGymManagerStats } from "@jits/shared/api/queries";
import type { SessionListItem } from "@jits/shared/types/session";
import type { GymManagerStats } from "@jits/shared/types/analytics";
import { GymRsvpAction } from "./gym-rsvp-action";

interface GymDetailContentProps {
  paramsPromise: Promise<{ id: string }>;
}

export async function GymDetailContent({ paramsPromise }: GymDetailContentProps) {
  const { id } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();
  const [gym, managerStats] = await Promise.all([
    getGymDetail(supabase, id, athlete.id),
    getGymManagerStats(supabase, id),
  ]);

  if (!gym) notFound();

  const activeSession = gym.sessions.find((s) => s.status === "active") ?? null;
  const upcomingSessions = gym.sessions.filter((s) => s.status !== "active");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <GymTitle name={gym.name} city={gym.city} isMyGym={gym.isMemberGym} />

      {activeSession && (
        <ActiveSessionPlate session={activeSession} />
      )}

      {/* Gym stats (visible to managers) */}
      {gym.isGymManager && <GymStats stats={managerStats} />}

      {/* Last Session plate (wireframe E2 lines 1444-1450).
          TODO: requires getGymDetail to expose last-session aggregates
          (attendees, avg matches, ELO range, median). Rendered with "—"
          placeholders until the query is extended. */}
      {gym.isGymManager && <LastSessionPlate />}

      {/* Session templates (visible to managers, create-session available to all) */}
      {(gym.isGymManager || templates.length > 0) && (
        <SessionTemplates gymId={id} templates={templates} isManager={gym.isGymManager} />
      )}

      {/* Sessions list */}
      <SessionList
        sessions={gym.sessions}
        rsvpSessionIds={gym.rsvpSessionIds}
      />

      <GymStatsGrid stats={managerStats} />
    </div>
  );
}

/**
 * Last Session plate, wireframe E2 lines 1444-1450.
 * Renders a section label "Last Session · {date}" plus a 2x2 grid of DataRows
 * (Attendees / Avg Matches / ELO Range / Median).
 *
 * TODO: requires getGymDetail to expose last-session aggregates (attendees,
 * avg matches, ELO range, median). All values show "—" until the query is
 * extended.
 */
function LastSessionPlate() {
  const lastSession: {
    date: string | null;
    attendees: number | null;
    avgMatches: number | null;
    eloRange: string | null;
    medianElo: number | null;
  } = {
    date: null,
    attendees: null,
    avgMatches: null,
    eloRange: null,
    medianElo: null,
  };

  const dateSuffix = lastSession.date ? ` · ${lastSession.date}` : "";
  const rows: { label: string; value: string | number }[] = [
    { label: "Attendees", value: lastSession.attendees ?? "—" },
    { label: "Avg Matches", value: lastSession.avgMatches ?? "—" },
    { label: "ELO Range", value: lastSession.eloRange ?? "—" },
    { label: "Median", value: lastSession.medianElo ?? "—" },
  ];

  return (
    <section>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
        Last Session{dateSuffix}
      </p>
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {label}
              </span>
              <span className="font-mono text-base tabular-nums">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function GymHeader({ gym }: { gym: { name: string; city: string | null; isMemberGym: boolean } }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <h1
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "var(--size-heading-l)",
          color: "var(--text-primary)",
          margin: 0,
          lineHeight: 1.1,
        }}
      >
        {name}
      </h1>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--size-num-xs)",
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "var(--ls-caps-xl)",
          fontWeight: 700,
        }}
      >
        {city ?? "Unknown City"}
        {isMyGym && " · My Gym"}
      </div>
    </div>
  );
}

function ActiveSessionPlate({ session }: { session: SessionListItem }) {
  const capacity = session.maxParticipants
    ? `${session.participantCount}/${session.maxParticipants} in lobby`
    : `${session.participantCount} in lobby`;
  return (
    <Plate variant="live">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          marginBottom: "var(--space-3)",
        }}
      >
        <LivePill label="Session Live" />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "var(--ls-caps-l)",
            fontWeight: 700,
          }}
        >
          {capacity}
        </span>
      </div>
      <Link
        href={`/session/${session.id}/join`}
        style={{
          display: "inline-flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "var(--size-label-l)",
          textTransform: "uppercase",
          letterSpacing: "var(--ls-caps)",
          background: "var(--accent-cta)",
          color: "var(--text-on-accent)",
          padding: "var(--space-3) var(--space-5)",
          borderRadius: "var(--radius-xs)",
          textDecoration: "none",
        }}
      >
        Join Lobby
      </Link>
    </Plate>
  );
}

function UpcomingSessions({
  sessions,
  rsvpSessionIds,
}: {
  sessions: SessionListItem[];
  rsvpSessionIds: string[];
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <SectionLabel>Upcoming ELO Sessions</SectionLabel>
      {sessions.length === 0 ? (
        <EmptyMeta>No sessions scheduled</EmptyMeta>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {sessions.map((s) => (
            <UpcomingSessionRow
              key={s.id}
              session={s}
              isRsvpd={rsvpSessionIds.includes(s.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function UpcomingSessionRow({
  session,
  isRsvpd,
}: {
  session: SessionListItem;
  isRsvpd: boolean;
}) {
  const start = new Date(session.scheduledStart);
  const dayTime = start.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
  });
  const fullDate = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const attending = session.rsvpCount + session.participantCount;
  const subtitle = `${fullDate} · ${attending} attending`;

  return (
    <ParticipantRow
      name={dayTime}
      subtitle={subtitle}
      action={<GymRsvpAction sessionId={session.id} isRsvpd={isRsvpd} />}
    />
  );
}

function GymStatsGrid({ stats }: { stats: GymManagerStats }) {
  const avgPerSession =
    stats.totalSessions > 0
      ? (stats.totalParticipants / stats.totalSessions).toFixed(1)
      : "0";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "var(--space-3)",
      }}
    >
      <EloTile label="Avg Session" value={avgPerSession} size="medium" />
      <EloTile label="Total Matches" value={stats.totalMatches} size="medium" />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--size-num-xs)",
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps-xl)",
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

function EmptyMeta({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--size-num-xs)",
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps-l)",
        padding: "var(--space-4)",
        border: "1px dashed var(--border-hairline)",
        borderRadius: "var(--radius-xs)",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

