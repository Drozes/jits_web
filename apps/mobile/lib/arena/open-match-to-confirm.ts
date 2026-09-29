/**
 * Open the match whose result is waiting to be confirmed. Shared by the
 * header chip's CONFIRM segment and the Arena's ConfirmStrip so the same
 * action has the same navigation everywhere.
 *
 * `navigate`, not `push`: an identical route already on top is reused, so a
 * double tap never stacks the match screen twice.
 */
import type { Router } from "expo-router";
import { arenaMatchHref } from "./constants";

export function openMatchToConfirm(router: Pick<Router, "navigate">, matchId: string): void {
  router.navigate(arenaMatchHref(matchId) as never);
}
