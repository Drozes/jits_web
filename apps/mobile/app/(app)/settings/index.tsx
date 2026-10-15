import * as React from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Link, useRouter, type Href } from "expo-router";
import { TestTube2, ShieldCheck } from "lucide-react-native";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";
import { useAuth, useIsAdmin, useRequireAthlete } from "@/lib/auth/hooks";
import { isSentryEnabled, showFeedback } from "@/lib/error-tracking/sentry";
import { cn } from "@/lib/cn";
import { clearPendingInvite } from "@/lib/invites/pending-invite";
import { SIGN_OUT_UPLOAD_TITLE, pendingUploadSignOutMessage } from "@/lib/video/sign-out-guard";
import { legalHref } from "@/lib/legal/legal-copy";
import { useAiConsent } from "@/lib/moderation/ai-consent";
import { AI_CONSENT_COPY, aiConsentStatus } from "@/lib/moderation/moderation-copy";

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
  | "/settings/help"
  | "/settings/admin"
  | "/settings/delete-account"
  | "/settings/blocked"
  | "/settings/ai-processing"
  | "/practice";

export default function SettingsScreen() {
  const { user, athlete, signOut } = useAuth();
  const isAdmin = useIsAdmin();
  useRequireAthlete();
  const router = useRouter();
  const displayName = athlete?.display_name ?? null;

  const handleSignOut = React.useCallback(async () => {
    // A pending match-film upload changes what signing out costs (jits-n2im.6).
    const uploadWarning = await pendingUploadSignOutMessage(displayName);
    Alert.alert(uploadWarning ? SIGN_OUT_UPLOAD_TITLE : "Sign out", uploadWarning ?? "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: uploadWarning ? "Sign out anyway" : "Sign out",
        style: "destructive",
        onPress: async () => {
          // A deliberate sign-out drops a pending invite (contract 6); the
          // claim screen's "Not you?" sign-out keeps it.
          await clearPendingInvite();
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  }, [signOut, router, displayName]);

  const email = user?.email ?? "";

  return (
    <>
      <AppHeader title="Settings" back />
      <PageContainer
        noTabBar
        contentContainerStyle={{ paddingTop: 24, gap: 24 }}
      >
        <AccountPlate email={email} onSignOut={() => void handleSignOut()} />
        <PreferencesPlate />
        <SupportPlate />
        <LegalPlate />
        {isAdmin ? <AdminPlate /> : null}
        {isSentryEnabled() ? (
          <Text className="font-body text-caption text-ink-3 leading-relaxed px-1">
            Tip: shake your phone on any screen to report a bug with a
            screenshot.
          </Text>
        ) : null}
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
        className="flex-row items-center justify-between px-4 py-3 min-h-11 active:bg-surface-4"
      >
        <Text className="font-mono tabular-nums text-micro text-ink-2 uppercase tracking-caps-l">
          SIGN OUT
        </Text>
      </Pressable>
      <RowDivider />
      <SettingsRow href="/settings/delete-account" label="DELETE ACCOUNT" />
    </Plate>
  );
}

function PreferencesPlate() {
  const { consentAt } = useAiConsent();
  return (
    <Plate className="p-0 overflow-hidden">
      <SettingsRow href="/settings/notifications" label="NOTIFICATIONS" />
      <RowDivider />
      {/* Report and block (App Review 1.2): unblock lives here. */}
      <SettingsRow href="/settings/blocked" label="BLOCKED ATHLETES" />
      <RowDivider />
      {/* What the athlete agreed to before filming (App Review 5.1.2(i)). */}
      <Link href={"/settings/ai-processing" as Href} asChild>
        <Pressable
          testID="settings-ai-processing"
          accessibilityRole="link"
          accessibilityLabel={`${AI_CONSENT_COPY.settingsRow}, ${aiConsentStatus(consentAt)}`}
          className="flex-row items-center justify-between px-4 py-3 min-h-11 active:bg-surface-4"
        >
          <RowLabel>{AI_CONSENT_COPY.settingsRow.toUpperCase()}</RowLabel>
          <View className="flex-row items-center gap-3">
            <RowValue>{aiConsentStatus(consentAt)}</RowValue>
            <Chevron />
          </View>
        </Pressable>
      </Link>
    </Plate>
  );
}

function SupportPlate() {
  return (
    <Plate className="p-0 overflow-hidden">
      <FeedbackRow />
      <RowDivider />
      <SettingsRow href="/settings/help" label="HELP & SUPPORT" />
      <RowDivider />
      <SettingsRow href="/settings/video" label="VIDEO SETTINGS" />
      <RowDivider />
      {/* Replayable any time, whatever the onboarding state. */}
      <SettingsRow href="/practice" label="PRACTICE MATCH" />
    </Plate>
  );
}

/**
 * The Terms of Service and Privacy Policy, full text, in the legal modal
 * (jits-rog5.8; the App Store requires the privacy policy to be reachable in
 * the app).
 */
function LegalPlate() {
  return (
    <Plate className="p-0 overflow-hidden">
      <Link href={legalHref("terms")} asChild>
        <Pressable
          testID="settings-legal-terms"
          accessibilityRole="link"
          className="flex-row items-center justify-between px-4 py-3 min-h-11 active:bg-surface-4"
        >
          <RowLabel>TERMS OF SERVICE</RowLabel>
          <Chevron />
        </Pressable>
      </Link>
      <RowDivider />
      <Link href={legalHref("privacy")} asChild>
        <Pressable
          testID="settings-legal-privacy"
          accessibilityRole="link"
          className="flex-row items-center justify-between px-4 py-3 min-h-11 active:bg-surface-4"
        >
          <RowLabel>PRIVACY POLICY</RowLabel>
          <Chevron />
        </Pressable>
      </Link>
    </Plate>
  );
}

function AdminPlate() {
  return (
    <Plate className="p-0 overflow-hidden">
      <Link href="/settings/admin" asChild>
        <Pressable
          accessibilityRole="link"
          className="flex-row items-center justify-between px-4 py-3 min-h-11 active:bg-surface-4"
        >
          <View className="flex-row items-center gap-3">
            <View pointerEvents="none">
              <ShieldCheck size={14} className="text-ink-3" />
            </View>
            <RowLabel>ADMIN</RowLabel>
          </View>
          <Chevron />
        </Pressable>
      </Link>
    </Plate>
  );
}

function DeveloperPlate() {
  return (
    <Plate className="p-0 overflow-hidden">
      <Link href="/(app)/settings/realtime-test" asChild>
        <Pressable
          accessibilityRole="link"
          className="flex-row items-center justify-between px-4 py-3 min-h-11 active:bg-surface-4"
        >
          <View className="flex-row items-center gap-3">
            <View pointerEvents="none">
              <TestTube2 size={14} className="text-ink-3" />
            </View>
            <RowLabel>REALTIME SMOKE TEST</RowLabel>
          </View>
          <Chevron />
        </Pressable>
      </Link>
    </Plate>
  );
}

/**
 * Feedback entry point. When Sentry is live, opens the rich in-app feedback
 * form (description + "Capture this screen" screenshot, attributed to the
 * athlete) so reports flow into Sentry for triage. Otherwise (e.g. local dev
 * with no DSN) falls back to the existing text-only feedback screen.
 */
function FeedbackRow() {
  const router = useRouter();
  const onPress = React.useCallback(() => {
    if (isSentryEnabled()) {
      showFeedback();
      return;
    }
    router.push("/settings/feedback" as Href);
  }, [router]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center justify-between px-4 py-3 min-h-11 active:bg-surface-4"
    >
      <RowLabel>FEEDBACK</RowLabel>
      <Chevron />
    </Pressable>
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
        className="flex-row items-center justify-between px-4 py-3 min-h-11 active:bg-surface-4"
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
    <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
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
        "font-mono-medium tabular-nums text-small text-ink uppercase tracking-caps-l",
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
      className="font-mono tabular-nums text-callout text-ink-3"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {"›"}
    </Text>
  );
}
