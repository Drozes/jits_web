import { Redirect } from "expo-router";
import { Text, View } from "react-native";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import { useAuth } from "@/lib/auth/hooks";

export default function Index() {
  const { user, athlete, isLoading } = useAuth();

  if (isLoading) {
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
