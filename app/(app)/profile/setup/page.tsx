import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ATHLETE_STATUS } from "@/lib/constants";
import { SetupForm } from "./setup-form";

export default function ProfileSetupPage() {
  return (
    <Suspense>
      <SetupContent />
    </Suspense>
  );
}

async function SetupContent() {
  const user = await requireAuth();
  const supabase = await createClient();

  // Fetch existing athlete (auto-created by backend on signup)
  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, display_name, status")
    .eq("auth_user_id", user.id)
    .single();

  // If athlete is already activated, redirect to home
  if (athlete && athlete.status !== ATHLETE_STATUS.PENDING) {
    redirect("/");
  }

  // Fetch gyms server-side so the client component doesn't need to
  const { data: gyms } = await supabase
    .from("gyms")
    .select("id, name")
    .eq("status", "active")
    .order("name");

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome to Jits
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Set up your athlete profile to get started
          </p>
        </div>
        <SetupForm
          athleteId={athlete?.id ?? null}
          defaultDisplayName={athlete?.display_name ?? ""}
          gyms={gyms ?? []}
        />
      </div>
    </div>
  );
}
