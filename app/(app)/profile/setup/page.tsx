import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
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

  // If athlete already exists, redirect to home
  const { data: existing } = await supabase
    .from("athletes")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (existing) {
    redirect("/");
  }

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
        <SetupForm userId={user.id} />
      </div>
    </div>
  );
}
