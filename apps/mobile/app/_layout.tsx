import "../global.css";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth/auth-context";
import { Toaster } from "@/components/ui/toast";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
            <Stack.Screen name="profile-setup" options={{ presentation: "modal" }} />
          </Stack>
        </AuthProvider>
        <Toaster />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
