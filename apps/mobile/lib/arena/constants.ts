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
 * Home's challenge-inbox `postgres_changes` topic.
 *
 * A SECOND subscriber on `challenges` for the same athlete, because the Arena
 * prompt and the Home inbox have different lifetimes and neither owns the
 * other. It carries the same per-instance suffix as `incomingTopic`, for the
 * same reason: `supabase.channel(topic)` hands back the EXISTING channel when
 * one with that topic is still registered, and `.on("postgres_changes", ...)`
 * on an already-subscribed channel throws, which is exactly what a remount
 * overlapping its own teardown produces.
 *
 * The PREFIX has to differ from `incomingTopic`'s too. Both hooks are mounted
 * at once as soon as the athlete has visited the Arena tab (tabs stay
 * mounted), so a shared prefix plus a colliding instance id would hand one
 * hook the other's channel and throw on the second `.on`.
 */
export const challengeInboxTopic = (athleteId: string, instanceId: string) =>
  `home-challenge-inbox:${athleteId}:${instanceId}`;

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
