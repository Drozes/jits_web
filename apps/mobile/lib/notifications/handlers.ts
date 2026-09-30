/**
 * Notification handler setup.
 *
 * - Foreground display: when a push arrives while the app is open we still want
 *   the OS banner (mirrors web's toast behaviour).
 * - Tap deep-linking: when the user taps a notification we read the optional
 *   `route` field from the payload data and push it (tab roots: see below);
 *   a challenge push carries its Arena link on `arena_href` instead (see
 *   `arenaHref`). A
 *   route into a family mobile no longer has (sessions, gyms, gym-manager;
 *   jits-gewv) goes Home instead of to an unmatched screen. A
 *   `highlight_ready` push (jr_be spec 015 section 16.4) without a usable
 *   `route` is sent to its viewer, `/highlight/<id>?source=push`.
 * - Cold start (spec 16.6.4): a tap that LAUNCHED the app is read once with
 *   `getLastNotificationResponseAsync()` when `markNotificationRouterReady()`
 *   is called (by Home, the first signed-in screen a launch lands on, so the
 *   router is mounted and the auth redirect in `app/index.tsx` has already
 *   run and cannot replace the pushed screen). A tap that arrives before that
 *   point through the listener is held, not pushed, for the same reason.
 *   Every response is routed at most once, keyed by its notification
 *   identifier, so a tap seen by both the listener and the cold-start read
 *   never navigates twice. The cold-start read uses the synchronous
 *   `getLastNotificationResponse()` / `clearLastNotificationResponse()` when
 *   the installed expo-notifications has them, else the async pair.
 * - During a match: a highlight tap (a reel is never urgent) is HELD while any
 *   match screen is mounted and routed when the athlete leaves the match, so
 *   it never pushes the viewer over a live match. The foreground banner for a
 *   `highlight_ready` push is suppressed while in a match (it still lands in
 *   the notification list).
 * - Tab roots: a tap whose route is a tab root (`/`, `/arena?challenge=<id>`,
 *   ...) is opened in place with `openHref` (lib/deep-links/tab-root-route.ts)
 *   instead of pushed, so it never mounts a second Arena or tab bar. During a
 *   match, opening it would pop back to the tabs and unmount the live match,
 *   so every tab-root tap is DROPPED: the status pushes' plain `/arena`, and
 *   a new challenge's `/arena?challenge=<id>`, which entering the match has
 *   already declined (`settleOthersAfterEntry` declines every other fresh
 *   pending incoming challenge). Held, either would open after the exit,
 *   override the destination the athlete just chose, and show nothing. The
 *   bell still lists them.
 * - Sign-out: `resetNotificationRouterReady()` forgets readiness and drops
 *   every held tap, so the next account never gets the previous one's tap.
 *
 * Call `setupNotificationHandlers()` ONCE at app startup. The function is
 * idempotent so multiple invocations are harmless.
 */
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { HOME_HREF, isRetiredRoute } from "@/lib/deep-links/retired-routes";
import { isInArenaMatch, subscribeArenaMatch } from "@/lib/arena/arena-store";
import { isTabRootHref, openHref } from "@/lib/deep-links/tab-root-route";

let configured = false;
let responseSubscription: Notifications.EventSubscription | null = null;

/** True once a signed-in screen has mounted; see `markNotificationRouterReady`. */
let routerReady = false;
/** The cold-start read runs once per JS process. */
let coldStartChecked = false;
/** A tap received before the router was ready; routed when it becomes ready. */
let pendingResponse: Notifications.NotificationResponse | null = null;
/** Identifiers already routed (or deliberately dropped), never routed again. */
const handledIds = new Set<string>();
/** A highlight tap received during a match; routed when the match screen unmounts. */
let heldTap: Notifications.NotificationResponse | null = null;
let matchUnsubscribe: (() => void) | null = null;

interface NotificationData {
  route?: unknown;
  type?: unknown;
  id?: unknown;
  arena_href?: unknown;
}

/**
 * The jr_be `push` function puts a challenge push's Arena link on its own
 * key, `data.arena_href` (`/arena?challenge=<id>` or `/arena`), NOT on
 * `data.route`: builds without this handler push any `data.route` with a bare
 * `router.push`, which would stack a second Arena (or a second tab bar from a
 * pushed screen). Old builds ignore `arena_href`, so their tap keeps doing
 * nothing and the backend can deploy in any order with the mobile OTA. Only
 * an Arena href is honoured from this key.
 */
function arenaHref(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const href = v.trim();
  return href === "/arena" || href.startsWith("/arena?") ? href : null;
}

/** The push `data.type` of a ready highlight reel (jr_be push function, B10). */
export const HIGHLIGHT_READY_PUSH_TYPE = "highlight_ready";

/** Where a tapped notification leads, or null when it carries nowhere to go. */
export function notificationTarget(data: unknown): string | null {
  const d = (data ?? {}) as NotificationData;
  let route: string | null =
    typeof d.route === "string" && d.route.trim().length > 0 ? d.route : null;
  if (!route) route = arenaHref(d.arena_href);
  if (!route && d.type === HIGHLIGHT_READY_PUSH_TYPE && typeof d.id === "string" && d.id) {
    route = `/highlight/${encodeURIComponent(d.id)}?source=push`;
  }
  if (!route) return null;
  return isRetiredRoute(route) ? HOME_HREF : route;
}

/** A notification that opens a highlight reel (never urgent enough to interrupt a match). */
export function isHighlightNotification(data: unknown): boolean {
  const d = (data ?? {}) as NotificationData;
  if (d.type === HIGHLIGHT_READY_PUSH_TYPE) return true;
  const target = notificationTarget(data);
  return target !== null && target.startsWith("/highlight/");
}

/**
 * A tap that waits for the match to end: a highlight (never urgent). Only
 * highlights are held, so one held slot never has to choose between kinds.
 */
export function holdsDuringMatch(data: unknown): boolean {
  return isHighlightNotification(data);
}

/**
 * A tap that is dropped during a match: any tab root. Opening one would pop
 * back to the tabs and unmount the live match, and held until the exit it
 * would override where the athlete chose to go, for Arena state that is stale
 * by then: a status push's plain `/arena`, and a new challenge's
 * `/arena?challenge=<id>` too, because entering the match already declined
 * every other fresh pending incoming challenge (`settleOthersAfterEntry`).
 * The bell still lists the challenge.
 *
 * This is deliberately broader than challenges: ANY push whose target is a
 * tab root (`/`, `/leaderboard`, `/profile`, `/arena...`) is dropped during a
 * match, whatever its `type`. A future push that must survive a match should
 * target a non-tab-root screen, or be added to `holdsDuringMatch`.
 */
export function dropsDuringMatch(data: unknown): boolean {
  const target = notificationTarget(data);
  return target !== null && isTabRootHref(target);
}

function responseId(response: Notifications.NotificationResponse): string | null {
  const id = response?.notification?.request?.identifier;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function navigate(response: Notifications.NotificationResponse): void {
  const data = response?.notification?.request?.content?.data;
  const target = notificationTarget(data);
  if (!target) return;
  try {
    // A tab root (the challenge push's `/arena?challenge=<id>`) is opened in
    // place; pushing it would mount a second copy (see tab-root-route.ts).
    openHref(router, target);
  } catch (err) {
    console.warn("[notifications] failed to deep-link", target, err);
  }
}

/**
 * Route a tap at most once. Before the router is ready the (latest) tap is
 * held; the identifier is only claimed when it is actually routed.
 */
function handleResponse(response: Notifications.NotificationResponse | null): void {
  if (!response) return;
  const id = responseId(response);
  if (id && handledIds.has(id)) return;
  if (!routerReady) {
    pendingResponse = response;
    return;
  }
  const data = response?.notification?.request?.content?.data;
  if (isInArenaMatch() && dropsDuringMatch(data)) {
    if (id) handledIds.add(id);
    return;
  }
  if (isInArenaMatch() && holdsDuringMatch(data)) {
    holdUntilMatchExit(response);
    return;
  }
  if (id) handledIds.add(id);
  navigate(response);
}

function stopWatchingMatch(): void {
  if (matchUnsubscribe) matchUnsubscribe();
  matchUnsubscribe = null;
}

/** Keep the (latest) held tap (see `holdsDuringMatch`) until no match screen is mounted. */
function holdUntilMatchExit(response: Notifications.NotificationResponse): void {
  heldTap = response;
  if (matchUnsubscribe) return;
  matchUnsubscribe = subscribeArenaMatch(() => {
    if (isInArenaMatch()) return;
    stopWatchingMatch();
    // Next tick: the exit's own navigation (dismissTo) settles first, and a
    // match that mounts right after this one (nested) can still re-hold it.
    setTimeout(() => {
      const held = heldTap;
      heldTap = null;
      // Still (or again) in a match: handleResponse re-holds it.
      handleResponse(held);
    }, 0);
  });
}

export function setupNotificationHandlers(): void {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // A reel is never worth a banner over a live match; it stays in the list.
      const quiet =
        isInArenaMatch() && isHighlightNotification(notification?.request?.content?.data);
      return {
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: !quiet,
        shouldShowList: true,
      };
    },
  });

  responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
}

/**
 * Called by the first signed-in screen (Home) once it has mounted. Routes a
 * tap held from before this point, then (once per process) the tap that
 * launched the app. Idempotent.
 */
export function markNotificationRouterReady(): void {
  if (routerReady && coldStartChecked) return;
  routerReady = true;
  const held = pendingResponse;
  pendingResponse = null;
  handleResponse(held);
  if (coldStartChecked) return;
  coldStartChecked = true;
  const api = Notifications as unknown as {
    getLastNotificationResponse?: () => Notifications.NotificationResponse | null;
    clearLastNotificationResponse?: () => void;
  };
  if (typeof api.getLastNotificationResponse === "function") {
    try {
      const last = api.getLastNotificationResponse();
      handleResponse(last);
      // A JS reload in the same native process would otherwise read it again.
      if (last) api.clearLastNotificationResponse?.();
    } catch (err) {
      console.warn("[notifications] cold-start read failed", err);
    }
    return;
  }
  void (async () => {
    try {
      const last = await Notifications.getLastNotificationResponseAsync();
      handleResponse(last);
      if (last) await Notifications.clearLastNotificationResponseAsync?.();
    } catch (err) {
      console.warn("[notifications] cold-start read failed", err);
    }
  })();
}

/**
 * Sign-out: the router is no longer on a signed-in screen and any held tap
 * belongs to the account that just left, so forget readiness and drop every
 * held tap. The next sign-in's Home marks the router ready again. The
 * cold-start read stays done (it is once per process).
 */
export function resetNotificationRouterReady(): void {
  routerReady = false;
  pendingResponse = null;
  heldTap = null;
  stopWatchingMatch();
}

export function teardownNotificationHandlers(): void {
  if (responseSubscription) {
    responseSubscription.remove();
    responseSubscription = null;
  }
  configured = false;
}

/** Test-only: forget readiness, the held tap and every routed identifier. */
export function resetNotificationRoutingForTests(): void {
  routerReady = false;
  coldStartChecked = false;
  pendingResponse = null;
  heldTap = null;
  stopWatchingMatch();
  handledIds.clear();
}
