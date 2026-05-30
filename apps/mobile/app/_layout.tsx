import "../global.css";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { initSentry } from "@/lib/error-tracking/sentry";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import {
  Inter_400Regular,
  Inter_500Medium,
} from "@expo-google-fonts/inter";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/toast";
import { PushRegistrationBootstrap } from "@/lib/notifications/push-registration-bootstrap";
import { OnlinePresenceBootstrap } from "@/lib/presence/online-presence-bootstrap";
import { ErrorBoundary } from "@/components/error-boundary";
import { OfflineBanner } from "@/components/offline-banner";
import { DeepLinkBootstrap } from "@/lib/deep-links/handler";
import { SplashReveal } from "@/components/ui/elo-system/splash-reveal";
import { SplashStatement } from "@/components/ui/elo-system/splash-statement";
import { getCachedElo } from "@/lib/splash/elo-cache";
import { getSplashVariant } from "@/lib/splash/splash-variant";
import {
  DEFAULT_SPLASH_VARIANT,
  SPLASH_REVEAL,
  SPLASH_VARIANT,
  type SplashVariant,
} from "@jits/shared/constants";

// Initialize Sentry before any component renders.
// No-ops when EXPO_PUBLIC_SENTRY_DSN is not set.
initSentry();

// Keep the native splash up until the JS "Climb" overlay is mounted, so the
// hand-off is seamless. SplashReveal calls hideAsync() once it paints.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BebasNeue_400Regular,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  const [revealDone, setRevealDone] = useState(false);
  const [targetElo, setTargetElo] = useState<number | null>(null);
  const [variant, setVariant] = useState<SplashVariant | null>(null);

  // Resolve which launch reveal to play. Best-effort, never blocks — a short
  // max-wait guarantees a variant is picked (and the native splash lifts) even
  // if AsyncStorage hangs.
  useEffect(() => {
    let settled = false;
    const apply = (v: SplashVariant) => {
      if (!settled) {
        settled = true;
        setVariant(v);
      }
    };
    getSplashVariant().then(apply);
    const fallback = setTimeout(() => apply(DEFAULT_SPLASH_VARIANT), 400);
    return () => clearTimeout(fallback);
  }, []);

  // Resolve the odometer target before mounting the overlay: the user's cached
  // ELO if we have one, else the brand default. Best-effort, never blocks — a
  // short max-wait guarantees the reveal mounts even if AsyncStorage hangs (the
  // only path that could otherwise leave the native splash stuck).
  useEffect(() => {
    let settled = false;
    const apply = (v: number) => {
      if (!settled) {
        settled = true;
        setTargetElo(v);
      }
    };
    getCachedElo().then((v) => apply(v ?? SPLASH_REVEAL.DEFAULT_ELO));
    const fallback = setTimeout(() => apply(SPLASH_REVEAL.DEFAULT_ELO), 400);
    return () => clearTimeout(fallback);
  }, []);

  // While fonts load, paint the Void background (matches the native splash and
  // the reveal) so there's never a white flash if the native splash lifts early.
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: "#0D0F14" }} />;

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
          {!revealDone && variant === SPLASH_VARIANT.STATEMENT && (
            <SplashStatement onDone={() => setRevealDone(true)} />
          )}
          {!revealDone && variant === SPLASH_VARIANT.CLIMB && targetElo !== null && (
            <SplashReveal targetElo={targetElo} onDone={() => setRevealDone(true)} />
          )}
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
