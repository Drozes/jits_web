import Link from "next/link";
import { notFound } from "next/navigation";
import { WifiOff } from "lucide-react";
import { Plate, LivePill, EloTile, ParticipantRow, DataRow } from "@/components/ui/elo-system";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getGymDetailResult, getGymManagerStats } from "@jits/shared/api/queries";
import type { PartialGymDetail } from "@jits/shared/api/queries";
import type { GymDetail, SessionListItem } from "@jits/shared/types/session";
import type { GymManagerStats } from "@jits/shared/types/analytics";
import { GymRsvpAction } from "./gym-rsvp-action";

interface GymDetailContentProps {
  paramsPromise: Promise<{ id: string }>;
}

export async function GymDetailContent({ paramsPromise }: GymDetailContentProps) {
  const { id } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();
  // RESULT VARIANT, NOT THE LENIENT ONE. `getGymDetail` coalesced a failed
  // sessions read to `[]`, so a dropped request rendered "No sessions
  // scheduled" as a statement about the gym rather than about the request, and
  // an athlete standing in the room was told there was nothing on.
  const [result, managerStats] = await Promise.all([
    getGymDetailResult(supabase, id, athlete.id),
    getGymManagerStats(supabase, id),
  ]);

  // A gym that genuinely does not exist is still a 404. Every other failure is
  // NOT: turning a dropped request into "no such gym" is the same lie in a
  // different costume.
  if (!result.ok && result.error.code === "GYM_NOT_FOUND") notFound();

  // PARTIAL: the session list is trustworthy and only a capability read failed
  // (the athlete row, or the gym_managers row). Those decide the "My Gym" tag
  // and the header's Manage link, neither of which is worth hiding a LIVE
  // session over, so render the gym and say plainly what is unconfirmed.
  // `PartialGymDetail` types `isMemberGym` / `isGymManager` out entirely, so
  // there is no way to accidentally read an authorization answer off it.
  const gym: GymDetail | PartialGymDetail | null = result.ok
    ? result.data
    : result.partial;

  if (!gym) return <GymDetailUnavailable />;

  const degraded = !result.ok;
  const activeSession = gym.sessions.find((s) => s.status === "active") ?? null;
  const upcomingSessions = gym.sessions.filter((s) => s.status !== "active");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <GymTitle
        name={gym.name}
        city={gym.city}
        // Unknown on the degraded path, and unknown must not render as "no".
        isMyGym={result.ok ? result.data.isMemberGym : undefined}
      />

      {degraded && <MembershipUnconfirmedNote />}

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

/**
 * Shown when nothing about this gym could be trusted: the gym row failed to
 * read, or the SESSION LIST did, in which case the empty list is an artefact of
 * the failure and not an answer. Mirrors `SessionUnavailable`. A server
 * component has no `reset()`, so the exit is a link rather than a retry.
 */
function GymDetailUnavailable() {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <WifiOff className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-lg font-semibold">Gym unavailable</p>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t load this gym&apos;s schedule. This is a connection
        problem, so there may well be a session on.
      </p>
      <Button asChild>
        <Link href="/gyms">Back to gyms</Link>
      </Button>
    </div>
  );
}

/**
 * The narrow degraded case: sessions are real, the membership/manager reads
 * are not. Said out loud rather than papered over, because the absent "My Gym"
 * tag and the absent Manage link would otherwise read as answers.
 */
function MembershipUnconfirmedNote() {
  return (
    <p className="text-sm text-muted-foreground">
      We couldn&apos;t confirm your membership or manager access for this gym.
      The sessions below are current.
    </p>
  );
}

function GymTitle({
  name,
  city,
  isMyGym,
}: {
  name: string;
  city: string | null;
  /** `undefined` means the membership read failed: say nothing, not "no". */
  isMyGym?: boolean;
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

