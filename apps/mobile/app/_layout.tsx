import "../global.css";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/toast";
import { PushRegistrationBootstrap } from "@/lib/notifications/push-registration-bootstrap";
import { OnlinePresenceBootstrap } from "@/lib/presence/online-presence-bootstrap";
import { ErrorBoundary } from "@/components/error-boundary";
import { OfflineBanner } from "@/components/offline-banner";
import { DeepLinkBootstrap } from "@/lib/deep-links/handler";

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <SafeAreaProvider>
            <AuthProvider>
              <PushRegistrationBootstrap />
              <OnlinePresenceBootstrap />
              <DeepLinkBootstrap />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(app)" />
                <Stack.Screen name="profile-setup" options={{ presentation: "modal" }} />
              </Stack>
            </AuthProvider>
            <OfflineBanner />
            <Toaster />
          </SafeAreaProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
