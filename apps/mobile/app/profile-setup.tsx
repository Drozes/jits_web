import * as React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { SetupWizard } from "@/components/profile-setup/setup-wizard";
import { useRequireAuth } from "@/lib/auth/hooks";
import { useSetupData } from "@/lib/profile-setup/use-setup-data";

/**
 * Profile setup screen. Mirrors `apps/web/app/profile/setup/page.tsx`:
 *   1. Require auth (redirects to /login when missing).
 *   2. Load athlete row + gyms + waiver + acknowledgement state.
 *   3. Render the multi-step wizard (TOS, identity, training, optional).
 *
 * On successful activation, `useSetupSubmit` calls `refreshAthlete()` and
 * routes back to `/`. The root `app/index.tsx` then redirects to
 * `/(app)/(home)` since the athlete row is now `active`.
 */
export default function ProfileSetupScreen() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const { data, loading, error, reload } = useSetupData(user?.id ?? null);

  const isLoading = authLoading || loading || (!!user && !data);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow px-6 py-8"
          keyboardShouldPersistTaps="handled"
        >
          {isLoading && (
            <View className="flex-1 items-center justify-center py-16">
              <ActivityIndicator />
            </View>
          )}

          {!isLoading && error && (
            <View className="flex-1 items-center justify-center gap-3 py-16">
              <Text className="text-sm text-destructive">{error}</Text>
              <Button variant="outline" onPress={() => reload()}>
                Try again
              </Button>
            </View>
          )}

          {!isLoading && !error && data && user && (
            <View className="gap-8">
              <View className="items-center gap-2">
                <Text className="text-2xl font-bold text-foreground">
                  {data.isEditing ? "Edit Profile" : "Welcome to ELO RATED"}
                </Text>
                <Text className="text-center text-sm text-muted-foreground">
                  {data.isEditing
                    ? "Update your athlete details"
                    : "Set up your athlete profile to get started"}
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
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
