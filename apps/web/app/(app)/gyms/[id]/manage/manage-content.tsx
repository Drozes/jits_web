import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WifiOff } from "lucide-react";
import { Plate, DataRow } from "@/components/ui/elo-system";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  getGymDetailResult,
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
  // RESULT VARIANT, NOT THE LENIENT ONE, AND THIS IS THE WORST INSTANCE OF THE
  // BUG IN THE APP. `getGymDetail` defaults `isGymManager` to false whenever
  // the `gym_managers` read fails, and false was indistinguishable from a real
  // "no", so a transient failure REDIRECTED A REAL MANAGER off their own
  // management page. They would land back on the gym page with no error and no
  // clue, and a retry that hit the same blip would do it again.
  const [result, templates, stats] = await Promise.all([
    getGymDetailResult(supabase, id, athlete.id),
    getSessionTemplates(supabase, id),
    getGymManagerStats(supabase, id),
  ]);

  // A gym that genuinely does not exist is still a 404.
  if (!result.ok && result.error.code === "GYM_NOT_FOUND") notFound();

  // NEVER REDIRECT ON AN UNKNOWN. `result.partial` deliberately has no
  // `isGymManager` (see PartialGymDetail), which is exactly the point: on a
  // failed read there is no authorization answer to act on, so the only honest
  // move is to say the check failed. Redirecting here would be the compiler
  // guard's whole purpose defeated by hand.
  if (!result.ok) return <ManagerCheckUnavailable gymId={id} />;

  const gym = result.data;

  // Only now, on a read we trust, is "not a manager" a real answer.
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

/**
 * Shown when the manager check itself failed. It is NOT a permission denial
 * and must not read like one: this athlete may well be the owner of this gym.
 * Mirrors `SessionUnavailable`; a server component has no `reset()`, so the
 * exit is a link rather than a retry.
 */
function ManagerCheckUnavailable({ gymId }: { gymId: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <WifiOff className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-lg font-semibold">Couldn&apos;t verify your access</p>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t reach the records that say who manages this gym, so we
        can&apos;t open the management tools yet. This is a connection problem,
        not a permission one.
      </p>
      <Button asChild>
        <Link href={`/gyms/${gymId}`}>Back to gym</Link>
      </Button>
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
