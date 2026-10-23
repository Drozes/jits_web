/**
 * `/match/<id>/timekeep?request=<id>`: the asked person's sheet in timekeeper
 * mode (spec 8 `timekeep_href`, 9; TK-T1 to TK-T8). A non-tab-root route,
 * so a push tap is never dropped during a match.
 *
 * Opened by a TK-N1 push tap (`timekeep_href` carries only the match: the
 * sheet reads the newest request sent to this athlete) or by the app-wide
 * realtime listener (`use-incoming-timekeeper-requests.ts`, with the
 * request). The back control leaves the request unanswered: it lapses after
 * 2 minutes. No two-athlete flow links here.
 */
import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { TimekeepSheet } from "@/components/match-flow/crew/timekeep-sheet";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { HOME_HREF } from "@/lib/deep-links/retired-routes";

export default function TimekeepScreen() {
  const { matchId, request } = useLocalSearchParams<{ matchId: string; request?: string }>();
  const { athlete } = useRequireAthlete();
  const requestId = typeof request === "string" && request ? request : null;
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View testID="timekeep-screen" className="flex-1 bg-surface">
        <AppHeader back backFallback={HOME_HREF} />
        {matchId ? <TimekeepSheet matchId={matchId} requestId={requestId} athleteId={athlete?.id ?? null} /> : null}
      </View>
    </>
  );
}
