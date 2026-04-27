import Link from "next/link";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { NotificationPreferences } from "./notification-preferences";
import { ChevronRight, Video, MessageSquare, HelpCircle } from "lucide-react";

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

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">General</h3>
        <div className="flex flex-col gap-1">
          <SettingsLink href="/settings/video" icon={Video} label="Video Settings" />
          <SettingsLink href="/settings/feedback" icon={MessageSquare} label="Feedback" />
          <SettingsLink href="/settings/help" icon={HelpCircle} label="Help & Support" />
        </div>
      </div>
    </div>
  );
}

function SettingsLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-border border-l-2 border-l-blue-500 px-4 py-3.5 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
