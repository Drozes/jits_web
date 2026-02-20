import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { NotificationPreferences } from "./notification-preferences";

export async function SettingsContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const { data } = await supabase
    .from("notification_preferences")
    .select("enable_challenges, enable_chat, enable_matches")
    .eq("athlete_id", athlete.id)
    .maybeSingle();

  const prefs = {
    enable_challenges: data?.enable_challenges ?? true,
    enable_chat: data?.enable_chat ?? true,
    enable_matches: data?.enable_matches ?? true,
  };

  return (
    <div className="flex flex-col gap-6 animate-page-in">
      <NotificationPreferences athleteId={athlete.id} initialPrefs={prefs} />
    </div>
  );
}
