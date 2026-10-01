import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SignUpForm } from "@/components/sign-up-form";
import { safeNextParam } from "@/lib/auth/safe-next-path";
import { inviteSignupBanner } from "@/lib/invites/banner";

type SearchParams = Promise<{ next?: string | string[] }>;

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense>
      <SignUpContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignUpContent({ searchParams }: { searchParams: SearchParams }) {
  const { next: rawNext } = await searchParams;
  const next = safeNextParam(typeof rawNext === "string" ? rawNext : null);
  const supabase = await createClient();
  const inviteBanner = await inviteSignupBanner(next);

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

  const cityList = cities.length > 0 ? cities : ["Toronto", "Vancouver"];

  return (
    <SignUpForm
      gyms={(gyms ?? []).map((g) => ({ id: g.id, name: g.name }))}
      cities={cityList}
      next={next}
      inviteBanner={inviteBanner}
    />
  );
}
