import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SignUpForm } from "@/components/sign-up-form";

export default function Page() {
  return (
    <Suspense>
      <SignUpContent />
    </Suspense>
  );
}

async function SignUpContent() {
  const supabase = await createClient();

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
    />
  );
}
