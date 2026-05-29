import * as React from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Link, useRouter, type Href } from "expo-router";
import { TestTube2 } from "lucide-react-native";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";
import { useAuth, useRequireAthlete } from "@/lib/auth/hooks";
import { cn } from "@/lib/cn";

/**
 * G3 Settings. Mirrors the web settings index: three Plate sections grouping
 * Account / Preferences / Support nav rows, with a sign-out row inside Account.
 *
 * Each row uses the same `RowLabel` + chevron pattern from the web settings
 * page, expressed via NativeWind ELO tokens. Plates wrap section groups so
 * sequential rows share a single hairline border, divided by RowDivider.
 */

type SettingsRoute =
  | "/settings/notifications"
  | "/settings/video"
  | "/settings/feedback"
  | "/settings/help";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  useRequireAthlete();
  const router = useRouter();

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

  const email = user?.email ?? "";

  return (
    <>
      <AppHeader title="Settings" back />
      <PageContainer
        noTabBar
        contentContainerStyle={{ paddingTop: 24, gap: 24 }}
      >
        <AccountPlate email={email} onSignOut={handleSignOut} />
        <PreferencesPlate />
        <SupportPlate />
        {__DEV__ ? <DeveloperPlate /> : null}
      </PageContainer>
    </>
  );
}

function AccountPlate({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  return (
    <Plate className="p-0 overflow-hidden">
      <PlateRow>
        <RowLabel>EMAIL</RowLabel>
        <RowValue>{email || "-"}</RowValue>
      </PlateRow>
      <RowDivider />
      <Pressable
        onPress={onSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        className="flex-row items-center justify-between px-4 py-3 active:bg-surface-4"
      >
        <Text className="font-mono text-[10px] text-cta uppercase tracking-caps-l">
          SIGN OUT
        </Text>
      </Pressable>
    </Plate>
  );
}

function PreferencesPlate() {
  return (
    <Plate className="p-0 overflow-hidden">
      <SettingsRow href="/settings/notifications" label="NOTIFICATIONS" />
    </Plate>
  );
}

function SupportPlate() {
  return (
    <Plate className="p-0 overflow-hidden">
      <SettingsRow href="/settings/feedback" label="FEEDBACK" />
      <RowDivider />
      <SettingsRow href="/settings/help" label="HELP & SUPPORT" />
      <RowDivider />
      <SettingsRow href="/settings/video" label="VIDEO SETTINGS" />
    </Plate>
  );
}

function DeveloperPlate() {
  return (
    <Plate className="p-0 overflow-hidden">
      <Link href="/(app)/settings/realtime-test" asChild>
        <Pressable
          accessibilityRole="link"
          className="flex-row items-center justify-between px-4 py-3 active:bg-surface-4"
        >
          <View className="flex-row items-center gap-3">
            <TestTube2 size={14} className="text-ink-3" />
            <RowLabel>REALTIME SMOKE TEST</RowLabel>
          </View>
          <Chevron />
        </Pressable>
      </Link>
    </Plate>
  );
}

function SettingsRow({
  href,
  label,
}: {
  href: SettingsRoute;
  label: string;
}) {
  return (
    <Link href={href as Href} asChild>
      <Pressable
        accessibilityRole="link"
        className="flex-row items-center justify-between px-4 py-3 active:bg-surface-4"
      >
        <RowLabel>{label}</RowLabel>
        <Chevron />
      </Pressable>
    </Link>
  );
}

function PlateRow({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      {children}
    </View>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
      {children}
    </Text>
  );
}

function RowValue({ children }: { children: React.ReactNode }) {
  return (
    <Text
      numberOfLines={1}
      ellipsizeMode="tail"
      className={cn(
        "font-mono-medium text-[12px] text-ink uppercase tracking-caps-l",
        "max-w-[60%] text-right",
      )}
    >
      {children}
    </Text>
  );
}

function RowDivider() {
  return <View className="h-px bg-hairline-faint" />;
}

function Chevron() {
  return (
    <Text
      className="font-mono text-[14px] text-ink-3"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {"›"}
    </Text>
  );
}
