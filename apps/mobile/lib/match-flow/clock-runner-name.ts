import { TIMEKEEPER_COPY } from "./timekeeper-copy";

/**
 * The timekeeper's name as the live screen and the face-off print it: their
 * short name, or, when the read carried none (an older backend without the
 * timekeeper's identity), the role (TK-F1), never a blank and never the
 * two-athlete "Opponent" (jits-o47s.27).
 */
export function clockRunnerName(name: string | null | undefined): string {
  return name?.trim() ? name : TIMEKEEPER_COPY["TK-F1"];
}
