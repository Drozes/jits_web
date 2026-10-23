/**
 * The one shipped line a timekeeper-mode press adds under its shipped failure
 * title (PM29, COPY-DECK Round 9), for the shared match-flow hooks outside
 * the confirm and result steps that branch on timekeeper mode: the live
 * step's pause and resume (`useLiveControls`), the face-off's profile weight
 * edit (`useFaceoff`), the athlete's Leave (`useFaceoffLeave`) and the weight
 * check and re-weigh (`useWeightCheckActions`). The confirm and result steps
 * read the same line through their own adapter, `confirm-copy.ts`.
 *
 * An adapter over `timekeeper-copy.ts`, not a copy module of its own: the
 * line is `SHIPPED_COPY.checkConnection`. Those hooks import this file and
 * not `timekeeper-copy.ts`, so the import-based M-R4 surface rule
 * (`timekeeper-mode-guard.test.ts`) does not see them: importing it would
 * make their two-athlete arms, which keep the shipped DomainError message, a
 * timekeeper-mode surface. Their timekeeper-mode arms read no message.
 */
import { SHIPPED_COPY } from "./timekeeper-copy";

export const PRESS_COPY = {
  /** The description under a timekeeper-mode press's failure title (the two-athlete toasts keep the error's message). */
  checkConnection: SHIPPED_COPY.checkConnection,
} as const;
