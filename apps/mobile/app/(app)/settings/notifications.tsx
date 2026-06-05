import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
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
}[] = [
  {
    key: "enable_challenges",
    label: "CHALLENGES",
    description: "New, accepted, declined, and expiring challenges",
  },
  {
    key: "enable_chat",
    label: "CHAT MESSAGES",
    description: "New messages in conversations",
  },
  {
    key: "enable_matches",
    label: "MATCHES",
    description: "Match start notifications",
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
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = React.useCallback(
    async (key: keyof NotificationPrefs) => {
      if (!prefs || !athlete) return;
      const prev = prefs[key];
      const next = !prev;
      setPrefs((p) => (p ? { ...p, [key]: next } : p));
      const result = await updateNotificationPreferences(supabase, athlete.id, {
        [key]: next,
      });
      if (!result.ok) {
        setPrefs((p) => (p ? { ...p, [key]: prev } : p));
        toast.error("Could not save notification settings. Please try again.");
      }
    },
    [prefs, athlete],
  );

  return (
    <>
      <AppHeader title="Notifications" back />
      <PageContainer
        noTabBar
        contentContainerStyle={{ paddingTop: 24, gap: 16 }}
      >
        {prefs ? (
          <Plate className="p-0 overflow-hidden">
            {TOGGLES.map(({ key, label, description }, idx) => (
              <View key={key}>
                {idx > 0 ? (
                  <View className="h-px bg-hairline-faint" />
                ) : null}
                <ToggleRow
                  label={label}
                  description={description}
                  value={prefs[key]}
                  onToggle={() => handleToggle(key)}
                />
              </View>
            ))}
          </Plate>
        ) : (
          <View className="items-center py-16">
            <ActivityIndicator color={tokens.textTertiary} />
          </View>
        )}

        <Text className="font-body text-[12px] text-ink-3 leading-relaxed">
          Changes are saved automatically. You can also manage notifications
          through your device settings.
        </Text>
      </PageContainer>
    </>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onToggle,
}: {
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-surface-4"
    >
      <View className="flex-1 min-w-0">
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l mb-1">
          {label}
        </Text>
        <Text className="font-body text-[12px] text-ink-3 leading-snug">
          {description}
        </Text>
      </View>
      <Switch value={value} onValueChange={onToggle} />
    </Pressable>
  );
}
