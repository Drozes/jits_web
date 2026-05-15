import Link from "next/link";
import { notFound } from "next/navigation";
import { Plate, LivePill, EloTile, ParticipantRow, DataRow } from "@/components/ui/elo-system";
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

      <UpcomingSessions
        sessions={upcomingSessions}
        rsvpSessionIds={gym.rsvpSessionIds}
      />

      <GymStatsGrid stats={managerStats} />

      <LastSessionPlate />
    </div>
  );
}

function GymTitle({
  name,
  city,
  isMyGym,
}: {
  name: string;
  city: string | null;
  isMyGym: boolean;
}) {
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
      <EloTile label="Avg ELO" value="—" size="medium" />
    </div>
  );
}

function LastSessionPlate() {
  return (
    <section>
      <div style={{ marginBottom: "var(--space-3)" }}>
        <SectionLabel>Last Session</SectionLabel>
      </div>
      <Plate>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-2) var(--space-4)",
          }}
        >
          <DataRow label="Attendees" value="—" />
          <DataRow label="Avg Matches" value="—" />
          <DataRow label="ELO Range" value="—" />
          <DataRow label="Median" value="—" />
        </div>
      </Plate>
    </section>
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

