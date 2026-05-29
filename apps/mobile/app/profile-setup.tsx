import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Wordmark } from "@/components/ui/elo-system";
import { CtaButton } from "@/components/auth/auth-buttons";
import { AppHeader } from "@/components/layout/app-header";
import { SetupWizard } from "@/components/profile-setup/setup-wizard";
import { useRequireAuth } from "@/lib/auth/hooks";
import { useSetupData } from "@/lib/profile-setup/use-setup-data";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * Profile setup screen. ELO design system:
 *   - AppHeader (no back when activating, back when editing handled by wizard)
 *   - Hero Wordmark + tagline
 *   - SetupWizard plate(s) below
 *
 * On successful activation, `useSetupSubmit` calls `refreshAthlete()` and
 * routes back to `/`. The root `app/index.tsx` then redirects to
 * `/(app)/(home)` since the athlete row is now `active`.
 */
export default function ProfileSetupScreen() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const { data, loading, error, reload } = useSetupData(user?.id ?? null);
  const tokens = useThemedTokens();

  const isLoading = authLoading || loading || (!!user && !data);
  const headerTitle = data?.isEditing ? "Edit Profile" : "Setup";

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title={headerTitle} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingVertical: 24,
            gap: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {isLoading && (
            <View className="flex-1 items-center justify-center py-16">
              <ActivityIndicator color={tokens.accentCta} />
            </View>
          )}

          {!isLoading && error && (
            <View className="flex-1 items-center justify-center gap-4 py-16">
              <Text className="font-body text-[14px] text-negative text-center">
                {error}
              </Text>
              <CtaButton label="Try Again" onPress={() => reload()} />
            </View>
          )}

          {!isLoading && !error && data && user && (
            <>
              <View className="items-center gap-2">
                <Wordmark size="lg" />
                <Text className="font-mono text-[11px] text-ink-3 uppercase tracking-caps-l text-center">
                  {data.isEditing
                    ? "Update Your Athlete Details"
                    : "What's your number?"}
                </Text>
              </View>

              <SetupWizard
                authUserId={user.id}
                athlete={data.athlete}
                gyms={data.gyms}
                waiverId={data.waiverId}
                hasAcceptedTos={data.hasAcceptedTos}
                isEditing={data.isEditing}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
