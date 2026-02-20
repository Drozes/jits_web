"use client";

import { useState } from "react";
import { Bell, MessageSquare, Swords } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { updateNotificationPreferences } from "@/lib/api/mutations";
import type { NotificationPrefs } from "@/lib/api/mutations";

interface NotificationPreferencesProps {
  athleteId: string;
  initialPrefs: NotificationPrefs;
}

const TOGGLES: {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "enable_challenges",
    label: "Challenges",
    description: "New, accepted, declined, and expiring challenges",
    icon: <Swords className="h-4 w-4" />,
  },
  {
    key: "enable_chat",
    label: "Chat Messages",
    description: "New messages in conversations",
    icon: <MessageSquare className="h-4 w-4" />,
  },
  {
    key: "enable_matches",
    label: "Matches",
    description: "Match start notifications",
    icon: <Bell className="h-4 w-4" />,
  },
];

export function NotificationPreferences({
  athleteId,
  initialPrefs,
}: NotificationPreferencesProps) {
  const [prefs, setPrefs] = useState(initialPrefs);

  async function handleToggle(key: keyof NotificationPrefs) {
    const next = !prefs[key];
    setPrefs((prev) => ({ ...prev, [key]: next }));

    const supabase = createClient();
    await updateNotificationPreferences(supabase, athleteId, { [key]: next });
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Push Notifications
      </h3>
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {TOGGLES.map(({ key, label, description, icon }) => (
            <label
              key={key}
              className="flex items-center gap-3 px-4 py-3 cursor-pointer"
            >
              <span className="text-muted-foreground">{icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={prefs[key]}
                onCheckedChange={() => handleToggle(key)}
              />
            </label>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
