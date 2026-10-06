import { Redirect } from "expo-router";
import { MATCHES_TAB_HREF } from "@/lib/film-room/href";

/**
 * The retired Film Room route (spec specs/matches-tab/spec.md PM3). Its list
 * moved into the Matches tab; this redirect only catches a restored
 * navigation state or a build still on the previous bundle. The route took no
 * query params, so there is nothing to carry over. Delete it after two OTA
 * releases (jits-766g).
 */
export default function FilmRoomRedirect() {
  return <Redirect href={MATCHES_TAB_HREF as never} />;
}
