import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import type { MatchStep } from "@/lib/match-flow/step-router";
import { AppHeader } from "@/components/layout/app-header";

/**
 * Steps where a live match is in flight and leaving via a back gesture /
 * hardware back would orphan the match `in_progress` with no resume path.
 * The match must be left only through the in-flow cancel / dispute / done
 * ctas (which advance to `summary` and then `router.replace` out), so we
 * block raw back navigation on these steps. The early steps (`wait`,
 * `weight`, `ready`) and the terminal `summary` step are safe to leave.
 */
const GUARDED_STEPS: ReadonlySet<MatchStep> = new Set<MatchStep>([
  "live",
  "end",
  "result",
  "confirm",
]);

/**
 * Live match flow screen, renders the 8-step wizard for an in-session
 * match. Auth-gated by `useRequireAthlete`. The wizard handles its own
 * loading + error states once an athlete is in scope.
 *
 * ELO design system: native stack header is suppressed so we can mount
 * the `AppHeader` directly above the wizard. The header purposefully
 * hides the back button: leaving the match mid-flow needs to go through
 * the dispute / cancel ctas, not a navigation gesture.
 */
export default function SessionMatchScreen() {
  const tokens = useThemedTokens();
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const [step, setStep] = React.useState<MatchStep | null>(null);

  const guarded = step != null && GUARDED_STEPS.has(step);

  // Blocks iOS swipe-back, Android hardware back, and programmatic pops while
  // the match is in flight. The in-flow ctas use router.replace (not a pop),
  // so they are unaffected; the no-op callback simply swallows the attempt.
  usePreventRemove(guarded, () => {});

  if (authLoading || !athlete) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 bg-surface">
          <AppHeader title="Match" />
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={tokens.textSecondary} />
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !guarded }} />
      <View className="flex-1 bg-surface">
        <AppHeader title="Match" />
        <MatchFlowWizard
          sessionId={id}
          matchId={matchId}
          currentAthleteId={athlete.id}
          onStepChange={setStep}
        />
      </View>
    </>
  );
}
