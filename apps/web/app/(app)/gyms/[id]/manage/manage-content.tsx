import { notFound, redirect } from "next/navigation";
import { Plate, DataRow } from "@/components/ui/elo-system";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import {
  getGymDetail,
  getSessionTemplates,
  getGymManagerStats,
} from "@jits/shared/api/queries";
import { EditGymDialog } from "../edit-gym-dialog";
import { CreateSessionDialog } from "../create-session-dialog";
import { SessionTemplates } from "../session-templates";

interface ManageContentProps {
  paramsPromise: Promise<{ id: string }>;
}

export async function ManageContent({ paramsPromise }: ManageContentProps) {
  const { id } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();
  const [gym, templates, stats] = await Promise.all([
    getGymDetail(supabase, id, athlete.id),
    getSessionTemplates(supabase, id),
    getGymManagerStats(supabase, id),
  ]);

  if (!gym) notFound();
  if (!gym.isGymManager) redirect(`/gyms/${id}`);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <header style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
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
          {gym.name}
        </h1>
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
          {gym.city ?? "Unknown City"}
        </span>
      </header>

      <Section label="Gym Info">
        <Plate>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <DataRow label="Name" value={gym.name} valueMono={false} />
            <DataRow label="City" value={gym.city ?? "—"} valueMono={false} />
            <DataRow label="Members" value={String(gym.memberCount)} />
            <DataRow label="Sessions" value={String(stats.totalSessions)} />
            <DataRow label="Matches" value={String(stats.totalMatches)} />
          </div>
          <div style={{ marginTop: "var(--space-4)" }}>
            <EditGymDialog
              gymId={id}
              currentName={gym.name}
              currentCity={gym.city}
            />
          </div>
        </Plate>
      </Section>

      <Section label="Create Session">
        <Plate>
          <CreateSessionDialog gymId={id} />
        </Plate>
      </Section>

      <Section label="Session Templates">
        <SessionTemplates gymId={id} templates={templates} isManager />
      </Section>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
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
        {label}
      </span>
      {children}
    </section>
  );
}
