import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAthlete } from "@jits/shared/api/queries";
import { EuaForm } from "@/components/auth/eua-form";
import { safeNextParam, withNext } from "@/lib/auth/safe-next-path";

type SearchParams = Promise<{ next?: string | string[] }>;

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense>
      <EuaContent searchParams={searchParams} />
    </Suspense>
  );
}

async function EuaContent({ searchParams }: { searchParams: SearchParams }) {
  const { next: rawNext } = await searchParams;
  const next = safeNextParam(typeof rawNext === "string" ? rawNext : null);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(withNext("/login", next));

  const athlete = await getCurrentAthlete(supabase, user.id);
  if (!athlete) redirect(withNext("/signup", next));

  // A pending athlete can only activate once their profile carries the fields
  // the `handle_athlete_activation` trigger requires (weight + gym/free-agent),
  // plus gender/DOB for matchmaking. Google-SSO and seed accounts land here
  // with an empty profile, so collect the missing fields inline.
  const needsProfile =
    athlete.current_weight == null ||
    !athlete.gender ||
    !athlete.date_of_birth ||
    (!athlete.primary_gym_id && !athlete.free_agent);

  const { data: gyms } = await supabase
    .from("gyms")
    .select("id, name, city")
    .eq("status", "active")
    .order("name");

  const cities = Array.from(
    new Set(
      (gyms ?? [])
        .map((g) => g.city?.trim())
        .filter((c): c is string => !!c),
    ),
  ).sort();

  return (
    <EuaForm
      next={next}
      needsProfile={needsProfile}
      gyms={(gyms ?? []).map((g) => ({ id: g.id, name: g.name }))}
      cities={cities.length > 0 ? cities : ["Toronto", "Vancouver"]}
      initialProfile={{
        weight: athlete.current_weight?.toString() ?? "",
        gender: athlete.gender === "M" || athlete.gender === "F" ? athlete.gender : "",
        dateOfBirth: athlete.date_of_birth ?? "",
        city: athlete.city ?? "",
        gymId: athlete.primary_gym_id ?? "",
        freeAgent: athlete.free_agent ?? false,
      }}
    />
  );
}
