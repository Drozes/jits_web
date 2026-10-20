/**
 * `/match/<id>/timekeep?request=<id>`: the asked person's sheet in timekeeper
 * mode (spec 8 `timekeep_href`, 9; TK-T1 to TK-T8). A non-tab-root route,
 * so a push tap is never dropped during a match.
 *
 * Stub with its final route (timekeeper mode PLAN 3.2, slice M1, which owns
 * the route move and the `_layout.tsx` entry): the sheet itself is slice M2
 * (jits-o47s.3, `components/match-flow/crew/timekeep-sheet.tsx`). Until then
 * it is an empty pushed screen with a working back control. No two-athlete
 * flow links here.
 */
import { View } from "react-native";
import { Stack } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { HOME_HREF } from "@/lib/deep-links/retired-routes";

export default function TimekeepScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View testID="timekeep-screen" className="flex-1 bg-surface">
        <AppHeader back backFallback={HOME_HREF} />
      </View>
    </>
  );
}
