/**
 * Shared names and routes for the Arena surface.
 *
 * Every spelling that has to agree between two places lives here exactly once.
 * A regression guard that hardcodes its own copy of a route string passes green
 * while the app navigates somewhere else, so tests import these constants
 * instead of re-spelling them.
 */

/**
 * Presence topic. MUST stay byte-identical to web's
 * (`apps/web/hooks/use-lobby-presence.ts`): Supabase Presence only syncs
 * members of the SAME topic, so a mobile-only spelling would give mobile its
 * own private lobby and web users would never appear in it.
 */
export const LOBBY_TOPIC = "lobby:online";

/**
 * Per-challenge broadcast topic. Also cross-client, also identical to web:
 * this is the channel the accepting side uses to tell the challenger the match
 * exists, so both parties land together.
 */
export const challengeTopic = (challengeId: string) =>
  `arena-challenge:${challengeId}`;

/**
 * Incoming `postgres_changes` topic. Unlike the two above this one is NOT
 * cross-client (a postgres_changes subscription is private to the socket that
 * opened it), so the name is free, and mobile adds a per-instance suffix on
 * purpose: `supabase.channel(topic)` returns the EXISTING channel when one
 * with that topic is still registered (RealtimeClient.channel, realtime-js
 * 2.105.4), and `.on("postgres_changes", ...)` on an already subscribed
 * channel throws. A remount that overlaps its own teardown hits exactly that.
 * Same defence as `packages/shared/src/hooks/use-pending-challenges.ts`.
 */
export const incomingTopic = (athleteId: string, instanceId: string) =>
  `arena-incoming:${athleteId}:${instanceId}`;

/**
 * `get_arena_data` applies p_limit to the roster but presence is uncapped, so
 * the RPC's default of 20 silently hid live athletes below the cut and
 * under-reported the "Online now" count. Web learned this the hard way; do not
 * lower it without fixing the split first.
 */
export const ARENA_ROSTER_LIMIT = 100;

/** Where the Arena tab lives. Route groups do not appear in the URL. */
export const ARENA_HREF = "/arena";

/** Exit copy for a match that started in the Arena. */
export const ARENA_EXIT_LABEL = "Back to Arena";

/** The sessionless match route an Arena challenge lands both parties on. */
export const arenaMatchHref = (matchId: string) => `/match/${matchId}`;

/**
 * The ELO band for the Arena's "IN BAND" count: On The Mat rows whose
 * displayed rating is within this many points of yours, either side
 * (spec 6.1, spec 14 D2; `matCounts` in `mat-board.ts`).
 */
export const IN_BAND_ELO = 100;

/**
 * How long the live switch (header chip, Arena toggle) stays locked after a
 * go-live or go-offline is attempted (spec 4.3, F11, AC-H4).
 *
 * The realtime server closes a presence channel after more than 5
 * track/untrack calls per 30s (jits-fa9x). This cooldown REDUCES that churn
 * (and is why there is no undo, which would spend another presence call), but
 * it does NOT guarantee staying under the limit: three full on/off cycles a
 * little over 2s apart still make 6 calls in under 15s. When that happens the
 * server closes `lobby:online` and `use-lobby-presence.ts` rebuilds it under
 * its loss backoff; the lobby counts read unknown (null) until it is back.
 */
export const LIVE_SWITCH_COOLDOWN_MS = 2_000;

/**
 * How long a challenger may be missing from `lobby:online` before the
 * incoming prompt (or the challenge tucked into the chip) clears itself.
 * A grace rather than an instant clear, because a presence sync can drop and
 * re-add a key while its payload is being re-tracked.
 */
export const CHALLENGER_LEFT_GRACE_MS = 3_000;

/**
 * How long the incoming challenge prompt ignores Accept, Decline and Later
 * after it appears (spec 5, AC-S3): a finger already on its way to a button on
 * the screen underneath must not answer a challenge the athlete never saw.
 */
export const PROMPT_INPUT_GUARD_MS = 600;

/**
 * How long a challenge tucked away with Later may sit with no mounted surface
 * that can reopen it (the header chip) before it comes back up as the sheet
 * (AC-S4). A grace rather than an instant reopen, so a header that registers
 * in a later effect, or remounts across a navigation, does not bounce it up.
 */
export const REOPEN_SURFACE_GRACE_MS = 300;

/**
 * The toast after a go-offline whose flag clear failed. The athlete IS
 * offline in the app, and the hook retries the clear by itself, so the copy
 * must not ask for a retry the UI no longer offers (the chip reads GO LIVE).
 */
export const GO_OFFLINE_FAILED_MESSAGE =
  "You're offline here, but we couldn't update your status. We'll retry.";
