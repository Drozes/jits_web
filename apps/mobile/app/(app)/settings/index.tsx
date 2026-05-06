import * as React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link, useRouter, type Href } from "expo-router";
import {
  Bell,
  ChevronRight,
  HelpCircle,
  LogOut,
  MessageSquare,
  TestTube2,
  Video,
} from "lucide-react-native";
import { useAuth, useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";

export default function SettingsScreen() {
  const { signOut } = useAuth();
  useRequireAthlete();
  const router = useRouter();
  const tokens = useThemedTokens();

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
      <Text className="text-2xl font-heading text-foreground">Settings</Text>

      <Section title="Notifications">
        <SettingsLink
          href="/settings/notifications"
          icon={<Bell size={16} color={tokens.mutedForeground} />}
          label="Notification Preferences"
        />
      </Section>

      <Section title="General">
        <View className="gap-2">
          <SettingsLink
            href="/settings/video"
            icon={<Video size={16} color={tokens.mutedForeground} />}
            label="Video Settings"
          />
          <SettingsLink
            href="/settings/feedback"
            icon={
              <MessageSquare size={16} color={tokens.mutedForeground} />
            }
            label="Feedback"
          />
          <SettingsLink
            href="/settings/help"
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
      <Text className="text-xs font-heading uppercase tracking-wider text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

type SettingsRoute =
  | "/settings/notifications"
  | "/settings/video"
  | "/settings/feedback"
  | "/settings/help";

function SettingsLink({
  href,
  icon,
  label,
}: {
  href: SettingsRoute;
  icon: React.ReactNode;
  label: string;
}) {
  const tokens = useThemedTokens();
  return (
    <Link href={href as Href} asChild>
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
