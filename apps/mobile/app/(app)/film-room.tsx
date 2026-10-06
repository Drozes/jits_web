import * as React from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { MATCHES_TAB_HREF } from "@/lib/film-room/href";

/**
 * The retired Film Room route (spec specs/matches-tab/spec.md PM3). Its list
 * moved into the Matches tab; this screen only catches a restored navigation
 * state or a build still on the previous bundle (incoming links are rewritten
 * before navigation by `lib/deep-links/system-path.ts`). The route took no
 * query params, so there is nothing to carry over.
 *
 * Never a `<Redirect>`: that REPLACEs on the `(app)` Stack and mounts a second
 * `(tabs)` navigator. When the Stack has the tabs below, `dismissTo` pops back
 * to them (POP_TO, the `exitMatchTo` path); only a stack with nothing below
 * (a cold restore onto this screen) falls back to `replace`.
 * Delete after two OTA releases (jits-766g).
 */
export default function FilmRoomRedirect() {
  const router = useRouter();
  useFocusEffect(
    React.useCallback(() => {
      if (router.canDismiss()) router.dismissTo(MATCHES_TAB_HREF);
      else router.replace(MATCHES_TAB_HREF);
    }, [router]),
  );
  return null;
}
