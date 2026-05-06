import * as React from "react";
import { ScrollView, Text, View } from "react-native";
import { Bell, MessageSquare, Swords } from "lucide-react-native";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPrefs,
} from "@jits/shared/api/mutations";

const TOGGLES: {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
  Icon: React.ComponentType<{ size: number; color: string }>;
}[] = [
  {
    key: "enable_challenges",
    label: "Challenges",
    description: "New, accepted, declined, and expiring challenges",
    Icon: Swords,
  },
  {
    key: "enable_chat",
    label: "Chat Messages",
    description: "New messages in conversations",
    Icon: MessageSquare,
  },
  {
    key: "enable_matches",
    label: "Matches",
    description: "Match start notifications",
    Icon: Bell,
  },
];

export default function NotificationsScreen() {
  const { athlete } = useAuth();
  const tokens = useThemedTokens();
  const [prefs, setPrefs] = React.useState<NotificationPrefs | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getNotificationPreferences(supabase).then((p) => {
      if (!cancelled) setPrefs(p);
    });
    return () => { cancelled = true; };
  }, []);

  const handleToggle = React.useCallback(
    async (key: keyof NotificationPrefs) => {
      if (!prefs || !athlete) return;
      const next = !prefs[key];
      setPrefs((prev) => (prev ? { ...prev, [key]: next } : prev));
      await updateNotificationPreferences(supabase, athlete.id, {
        [key]: next,
      });
    },
    [prefs, athlete],
  );

  if (!prefs) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-sm text-muted-foreground">Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
    >
      <Text className="text-2xl font-heading text-foreground">
        Notification Preferences
      </Text>

      <Card>
        <CardContent className="p-0">
          {TOGGLES.map(({ key, label, description, Icon }, i) => (
            <View
              key={key}
              className={`flex-row items-center gap-3 px-4 py-3 ${
                i < TOGGLES.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <Icon size={16} color={tokens.mutedForeground} />
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground">
                  {label}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {description}
                </Text>
              </View>
              <Switch
                value={prefs[key]}
                onValueChange={() => handleToggle(key)}
              />
            </View>
          ))}
        </CardContent>
      </Card>

      <Text className="text-xs text-muted-foreground">
        Changes are saved automatically. You can also manage notifications
        through your device settings.
      </Text>
    </ScrollView>
  );
}
