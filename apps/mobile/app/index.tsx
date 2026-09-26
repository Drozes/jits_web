import { Redirect } from "expo-router";
import { Text, View } from "react-native";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import { CtaButton, TertiaryButton } from "@/components/auth/auth-buttons";
import { useAuth } from "@/lib/auth/hooks";

export default function Index() {
  const { user, athlete, isLoading, athleteLoadFailed, retryAthleteLoad, signOut } =
    useAuth();

  if (isLoading) {
    // The athlete read keeps failing (the provider is still retrying in the
    // background). Never guess "no athlete" here: that is the /profile-setup
    // dead end for an athlete who is already active.
    if (user && athleteLoadFailed) {
      return (
        <View className="flex-1 items-center justify-center gap-4 bg-surface px-6">
          <Text className="font-body text-[14px] text-ink-2 text-center">
            Can't reach ELO RATED right now. Check your connection.
          </Text>
          <CtaButton testID="athlete-load-retry" label="Try Again" onPress={retryAthleteLoad} />
          <TertiaryButton label="Sign Out" onPress={() => void signOut()} />
        </View>
      );
    }
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-base text-muted-foreground">Loading...</Text>
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (!athlete || athlete.status === ATHLETE_STATUS.PENDING) {
    return <Redirect href="/profile-setup" />;
  }
  return <Redirect href="/(app)/(home)" />;
}
