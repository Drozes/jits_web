/**
 * The platform this app attributes its invite calls to (jits-mafl.1, M1):
 * `record_invite_attribution`, `claim_challenge_invite` and
 * `accept_join_invite` all take `p_platform`.
 *
 * DEPENDENCY: "android" is accepted only once jr_be migration
 * 20261015100000 (jr_be-ehe) is applied on prod. Do not ship an Android
 * build that talks to prod before that migration is live, or every Android
 * invite call is refused.
 */
import { Platform } from "react-native";
import type { InvitePlatform } from "@jits/shared/api/invites";

export function invitePlatform(os: string = Platform.OS): InvitePlatform {
  if (os === "android") return "android";
  if (os === "ios") return "ios";
  return "web";
}
