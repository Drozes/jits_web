import * as React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import {
  Bell,
  ChevronRight,
  HelpCircle,
  LogOut,
  MessageSquare,
  Swords,
  TestTube2,
  Video,
} from "lucide-react-native";
import { useAuth, useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { toggleMatchPreferences } from "@jits/shared/api/mutations";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";

interface PreferencesState {
  lookingForCasual: boolean;
  lookingForRanked: boolean;
}

export default function SettingsScreen() {
  const { athlete, signOut } = useAuth();
  useRequireAthlete();
  const router = useRouter();
  const tokens = useThemedTokens();

  const [prefs, setPrefs] = React.useState<PreferencesState>({
    lookingForCasual: athlete?.looking_for_casual ?? false,
    lookingForRanked: athlete?.looking_for_ranked ?? false,
  });

  // Keep local state in sync if the auth athlete row changes (e.g. refresh).
  React.useEffect(() => {
    if (!athlete) return;
    setPrefs({
      lookingForCasual: athlete.looking_for_casual ?? false,
      lookingForRanked: athlete.looking_for_ranked ?? false,
    });
  }, [athlete]);

  const setPref = React.useCallback(
    async (key: keyof PreferencesState, value: boolean) => {
      if (!athlete) return;
      const next: PreferencesState = { ...prefs, [key]: value };
      setPrefs(next);
      const result = await toggleMatchPreferences(supabase, athlete.id, next);
      if (!result.ok) {
        // Revert on failure.
        setPrefs(prefs);
        toast.error(result.error.message);
      }
    },
    [athlete, prefs],
  );

  const handleSignOut = React.useCallback(() => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  }, [signOut, router]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 24 }}
    >
      <Text className="text-2xl font-bold text-foreground">Settings</Text>

      <Section title="Match Preferences">
        <Card>
          <CardContent className="p-0">
            <PreferenceRow
              icon={<Swords size={16} color={tokens.mutedForeground} />}
              label="Looking for casual"
              description="Show me to athletes seeking a casual roll"
              value={prefs.lookingForCasual}
              onValueChange={(v) => setPref("lookingForCasual", v)}
            />
            <View className="h-px bg-border" />
            <PreferenceRow
              icon={<Swords size={16} color={tokens.mutedForeground} />}
              label="Looking for ranked"
              description="Show me to athletes seeking a ranked match"
              value={prefs.lookingForRanked}
              onValueChange={(v) => setPref("lookingForRanked", v)}
            />
          </CardContent>
        </Card>
      </Section>

      <Section title="Notifications">
        <Card>
          <CardContent className="p-3">
            <View className="flex-row items-center gap-3">
              <Bell size={16} color={tokens.mutedForeground} />
              <View className="flex-1">
                <Text className="text-sm text-foreground">
                  Push notifications
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Channel-specific toggles coming soon. Manage at the OS level
                  in your device settings.
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </Section>

      <Section title="General">
        <View className="gap-2">
          <SettingsLink
            href="/(app)/settings/video"
            icon={<Video size={16} color={tokens.mutedForeground} />}
            label="Video Settings"
          />
          <SettingsLink
            href="/(app)/settings/feedback"
            icon={
              <MessageSquare size={16} color={tokens.mutedForeground} />
            }
            label="Feedback"
          />
          <SettingsLink
            href="/(app)/settings/help"
            icon={<HelpCircle size={16} color={tokens.mutedForeground} />}
            label="Help & Support"
          />
        </View>
      </Section>

      <Section title="Account">
        <Pressable
          onPress={handleSignOut}
          className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 active:bg-muted/40"
        >
          <View className="flex-row items-center gap-3">
            <LogOut size={16} color={tokens.destructive} />
            <Text className="text-sm font-medium text-destructive">
              Sign Out
            </Text>
          </View>
        </Pressable>
      </Section>

      {__DEV__ && (
        <Section title="Developer">
          <Link href="/(app)/settings/realtime-test" asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 active:bg-muted/40">
              <View className="flex-row items-center gap-3">
                <TestTube2 size={16} color={tokens.mutedForeground} />
                <View>
                  <Text className="text-sm font-medium text-foreground">
                    Realtime smoke test
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Verify channels, presence, broadcast, postgres-changes
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color={tokens.mutedForeground} />
            </Pressable>
          </Link>
        </Section>
      )}
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3">
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

function PreferenceRow({
  icon,
  label,
  description,
  value,
  onValueChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <View className="w-5 items-center">{icon}</View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        <Text className="text-xs text-muted-foreground">{description}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function SettingsLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  const tokens = useThemedTokens();
  return (
    <Link href={href as never} asChild>
      <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 active:bg-muted/40">
        <View className="flex-row items-center gap-3">
          {icon}
          <Text className="text-sm font-medium text-foreground">{label}</Text>
        </View>
        <ChevronRight size={16} color={tokens.mutedForeground} />
      </Pressable>
    </Link>
  );
}
