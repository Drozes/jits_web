import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { DisplayNameEditor } from "@/components/profile/display-name-editor";
import { Card, CardContent } from "@/components/ui/card";

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, display_name, current_elo, highest_elo")
    .eq("auth_user_id", user.id)
    .single();

  if (!athlete) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 flex flex-col gap-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <LogoutButton />
      </div>

      <div className="space-y-6">
        <DisplayNameEditor
          athleteId={athlete.id}
          initialName={athlete.display_name}
        />

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Current ELO</p>
              <p className="text-3xl font-bold tabular-nums">
                {athlete.current_elo}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Highest ELO</p>
              <p className="text-3xl font-bold tabular-nums">
                {athlete.highest_elo}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
