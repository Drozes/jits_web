/**
 * Whether the backend has the instant go-live migration (jr_be
 * `20261004100000_instant_go_live.sql`): this OTA may reach phones before
 * that migration is on prod, and must then behave exactly like the build
 * before it (a fresh reading before every go-live and the 60 s refresh, which
 * an older server's 10 minute expiry needs).
 *
 * - `unknown`: nothing proved either way yet (every app launch starts here).
 *   The ladder runs; its first replay settles it.
 * - `tagged`: a `go_live` answer carried `captured_at` (only the new server
 *   sends it), or a call with `p_captured_at` was accepted or refused with a
 *   code only the new server has.
 * - `legacy`: a call with `p_captured_at` came back `PGRST202` (no such
 *   signature), or a `go_live` answer had no `captured_at`. From then on
 *   this process never replays a stored or cached location (an older server
 *   would store it as fresh, which would let a 3 hour old location pass a 2
 *   minute rule) and keeps the 60 s refresh while live.
 *
 * In memory only: a migration landing while the app runs is picked up on
 * the next launch, or as soon as a go_live answer carries `captured_at`.
 */
import type { PresenceResult } from "@jits/shared/api/invite-rpc";

export type PresenceCapability = "unknown" | "tagged" | "legacy";

let capability: PresenceCapability = "unknown";
const listeners = new Set<() => void>();

export function getPresenceCapability(): PresenceCapability {
  return capability;
}

export function setPresenceCapability(next: PresenceCapability): void {
  if (next === capability) return;
  capability = next;
  for (const l of [...listeners]) l();
}

export function subscribePresenceCapability(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Codes only the instant go-live server returns for a go_live report. */
const TAGGED_ONLY_CODES: ReadonlySet<string> = new Set(["tag_too_old", "captured_at_invalid"]);

/** Learn from a go_live report answer (any rung, the refresh, the drift update). */
export function notePresenceAnswer(res: PresenceResult): void {
  if (res.ok) setPresenceCapability(res.captured_at ? "tagged" : "legacy");
  else if (TAGGED_ONLY_CODES.has(res.code)) setPresenceCapability("tagged");
}

/** Tests only. */
export function __resetPresenceCapabilityForTests(next: PresenceCapability = "unknown"): void {
  capability = next;
  listeners.clear();
}
