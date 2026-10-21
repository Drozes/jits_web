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
 * - Timekeeper mode (spec 8): the asked person's `timekeep_href` opens the
 *   timekeep sheet, a non-tab-root route, so it opens even during a match;
 *   an admin's `admin_href` (TK-N12) is held during a match like a highlight;
 *   athletes and the timekeeper get `match_href`. A timekeeper-mode push
 *   about the match already on screen shows no foreground banner, and its
 *   tap does not open that match a second time. One about ANOTHER match
 *   keeps its banner (spec 8 quiets only the match on screen), but its tap
 *   is held during a match like a highlight: pushed over the live match,
 *   that match's wizard would pop the live one when it exits (`exitMatchTo`
 *   dismisses to the tabs). While the non-dismissable challenge prompt (or
 *   a blocked start's sheet) is up, a `timekeep_href` tap waits and opens
 *   the sheet once it closes (spec 9.1); if it closed because the athlete
 *   entered a match, the tap is dropped (the OS notification list keeps
 *   it), as a tab-root tap during a match is. During the practice run (a
 *   match screen with no real match) a `timekeep_href` tap waits for its
 *   exit like a highlight: the server refuses an Accept during a real match,
 *   but nothing refuses one during practice, and the match would open over
 *   the practice screen and its camera.
 * - Sign-out: `resetNotificationRouterReady()` forgets readiness and drops
 *   every held tap, so the next account never gets the previous one's tap.
 *
 * Call `setupNotificationHandlers()` ONCE at app startup. The function is
 * idempotent so multiple invocations are harmless.
 */
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { HOME_HREF, isRetiredRoute } from "@/lib/deep-links/retired-routes";
import { isInArenaMatch, isInArenaMatchFor, isInPracticeOnly, subscribeArenaMatch } from "@/lib/arena/arena-store";
import { isTabRootHref, openHref } from "@/lib/deep-links/tab-root-route";
import {
  isTimekeepSheetOpenFor,
  isTimekeepTapHeld,
  subscribeTimekeepTapHold,
} from "@/lib/match-flow/timekeep-sheet-store";

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
/** A TK-N1 tap received while the Arena's challenge prompt (or a blocked start's sheet) is up. */
let heldTimekeepTap: Notifications.NotificationResponse | null = null;
let tapHoldUnsubscribe: (() => void) | null = null;

interface NotificationData {
  route?: unknown;
  type?: unknown;
  id?: unknown;
  arena_href?: unknown;
  match_href?: unknown;
  profile_href?: unknown;
  timekeep_href?: unknown;
  admin_href?: unknown;
  match_id?: unknown;
}

const MATCH_HREF_RE = /^\/match\/[0-9a-f-]{36}$/;
const PROFILE_HREF_RE = /^\/athlete\/[0-9a-f-]{36}$/;
const TIMEKEEP_HREF_RE = /^\/match\/[0-9a-f-]{36}\/timekeep$/;

/** The push `data.type` of every timekeeper-mode push (jr_be 024 section 8, BE-F). */
export const TIMEKEEPER_PUSH_TYPE = "timekeeper";

/** Admin > Timekeeper reviews, the one `admin_href` (TK-N12, A27). */
export const ADMIN_TIMEKEEPER_REVIEWS_HREF = "/settings/admin/timekeeper-reviews";

/**
 * Timekeeper-mode pushes (spec 8): the asked person's TK-N1 carries
 * `timekeep_href` (`/match/<id>/timekeep`, the sheet: a non-tab-root route,
 * so it is never dropped during a match) and an admin's TK-N12 `admin_href`;
 * every other recipient gets `match_href`, handled with the invite pushes.
 * Each is validated against its exact shape.
 */
function timekeeperHref(d: NotificationData): string | null {
  if (typeof d.timekeep_href === "string" && TIMEKEEP_HREF_RE.test(d.timekeep_href)) return d.timekeep_href;
  if (d.admin_href === ADMIN_TIMEKEEPER_REVIEWS_HREF) return ADMIN_TIMEKEEPER_REVIEWS_HREF;
  return null;
}

/** The match a timekeeper-mode push is about (`data.match_id`), or null. */
function timekeeperMatchId(data: unknown): string | null {
  const d = (data ?? {}) as NotificationData;
  if (d.type !== TIMEKEEPER_PUSH_TYPE || typeof d.match_id !== "string") return null;
  return /^[0-9a-f-]{36}$/.test(d.match_id) ? d.match_id : null;
}

/**
 * A timekeeper-mode push about what is already on screen: the match whose
 * screen is up, or, for the asked person's TK-N1, the timekeep sheet of that
 * match, or that match's own screen (the asked person can only be on it once
 * they accepted and were seated, so the request is over and the match shows
 * the truth). The screen already shows it (spec 8), so it gets no foreground
 * banner (it still lands in the list), and its tap does nothing rather than
 * stack a second screen of it.
 */
export function isAboutCurrentMatch(data: unknown): boolean {
  const matchId = timekeeperMatchId(data);
  if (matchId === null) return false;
  if (typeof ((data ?? {}) as NotificationData).timekeep_href === "string") {
    return isTimekeepSheetOpenFor(matchId) || isInArenaMatchFor(matchId);
  }
  return isInArenaMatchFor(matchId);
}

/** TK-N1: the asked person's push, which opens the timekeep sheet. */
export function isTimekeepRequestNotification(data: unknown): boolean {
  const href = ((data ?? {}) as NotificationData).timekeep_href;
  return typeof href === "string" && TIMEKEEP_HREF_RE.test(href);
}

/** TK-N12: an admin's review push (never urgent enough to push a page over a live match). */
export function isAdminReviewNotification(data: unknown): boolean {
  return ((data ?? {}) as NotificationData).admin_href === ADMIN_TIMEKEEPER_REVIEWS_HREF;
}

/**
 * A timekeeper-mode push that opens a match (`match_href`: TK-N2 to TK-N7,
 * TK-N9 to TK-N11, TK-N13 to TK-N15) other than the one on screen. During a
 * match it waits for the exit: pushed over the live match, that match's
 * wizard would leave through `exitMatchTo` (a `dismissTo` the tabs) and pop
 * the live match with it. Not the asked person's `timekeep_href` (its sheet
 * leaves with `router.back`, and its request lapses in 2 minutes) nor an
 * admin's `admin_href` (held on its own). Only `data.type` "timekeeper", so
 * invite `match_href` pushes route as before.
 */
export function isOtherMatchTimekeeperNotification(data: unknown): boolean {
  if (timekeeperMatchId(data) === null) return false;
  const href = ((data ?? {}) as NotificationData).match_href;
  if (typeof href !== "string" || !MATCH_HREF_RE.test(href)) return false;
  return !isTimekeepRequestNotification(data) && !isAdminReviewNotification(data) && !isAboutCurrentMatch(data);
}

/**
 * Invite and friend pushes (jr_be spec 016, contract 5): precedence
 * `match_href` (face-off ready) > `profile_href` (a friend joined) >
 * `arena_href` (booked, or a friend on the mat). Each is validated against
 * its exact shape; anything else is ignored.
 */
function inviteHref(d: NotificationData): string | null {
  if (typeof d.match_href === "string" && MATCH_HREF_RE.test(d.match_href)) return d.match_href;
  if (typeof d.profile_href === "string" && PROFILE_HREF_RE.test(d.profile_href)) return d.profile_href;
  return null;
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

/**
 * The match video pushes (jr_be-1qz.16, INTEGRATION 11.3: one per athlete
 * per match). Each carries `data.route = "/match-detail/<match_id>"`, which
 * opens the match page on its Film status plate (jits-n2im.13).
 */
export const MATCH_VIDEO_PUSH_TYPES: ReadonlySet<string> = new Set(["film_ready", "no_film", "timekeeper_film_ready"]);

const MATCH_DETAIL_ROUTE_RE = /^\/(?:\(app\)\/)?match-detail\/[0-9a-f-]{36}$/;

/** A match video push (film ready, no film, the timekeeper's film ready). */
export function isMatchVideoNotification(data: unknown): boolean {
  const d = (data ?? {}) as NotificationData;
  return typeof d.type === "string" && MATCH_VIDEO_PUSH_TYPES.has(d.type);
}

/** Where a tapped notification leads, or null when it carries nowhere to go. */
export function notificationTarget(data: unknown): string | null {
  const d = (data ?? {}) as NotificationData;
  let route: string | null =
    typeof d.route === "string" && d.route.trim().length > 0 ? d.route : null;
  if (!route) route = inviteHref(d);
  if (!route) route = timekeeperHref(d);
  if (!route) route = arenaHref(d.arena_href);
  if (!route && d.type === HIGHLIGHT_READY_PUSH_TYPE && typeof d.id === "string" && d.id) {
    route = `/highlight/${encodeURIComponent(d.id)}?source=push`;
  }
  // A video push without a usable route still knows its match (`data.id`).
  if (route && isMatchVideoNotification(d) && !MATCH_DETAIL_ROUTE_RE.test(route)) route = null;
  if (!route && isMatchVideoNotification(d) && typeof d.id === "string" && /^[0-9a-f-]{36}$/.test(d.id)) {
    route = `/match-detail/${d.id}`;
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
 * A tap that waits for the match to end: a highlight or a match video push
 * (film ready, no film), an admin's timekeeper review (TK-N12, a 24 hour
 * target), or a timekeeper-mode push about another match (see
 * `isOtherMatchTimekeeperNotification`): never worth pushing a page over a
 * live match. One held slot keeps the latest such tap. The asked person's
 * `timekeep_href` is NOT held: its request lapses in 2 minutes, so it opens
 * at once like any other non-tab-root route (spec 8, 11), except during
 * the practice run (`isInPracticeOnly`, held in `handleResponse`). A
 * timekeeper-mode push about the match on screen is not held either: its
 * tap does nothing.
 */
export function holdsDuringMatch(data: unknown): boolean {
  return (
    isHighlightNotification(data) ||
    isMatchVideoNotification(data) ||
    isAdminReviewNotification(data) ||
    isOtherMatchTimekeeperNotification(data)
  );
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
  // The practice run: the sheet opens after it ends (see the header).
  if (isInPracticeOnly() && isTimekeepRequestNotification(data)) {
    holdUntilMatchExit(response);
    return;
  }
  // Never two modals (spec 9.1): the sheet opens after the challenge prompt closes.
  if (isTimekeepTapHeld() && isTimekeepRequestNotification(data)) {
    holdUntilModalCloses(response);
    return;
  }
  if (id) handledIds.add(id);
  // A timekeeper-mode push opening the match (or the timekeep sheet) already on screen: it is there.
  if (isAboutCurrentMatch(data)) return;
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
    // A held timekeeper-mode tap whose match the athlete opened meanwhile is
    // done: opening it after the exit would show that match a second time.
    if (heldTap && isAboutCurrentMatch(heldTap.notification?.request?.content?.data)) {
      const id = responseId(heldTap);
      if (id) handledIds.add(id);
      heldTap = null;
    }
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

function stopWatchingTapHold(): void {
  if (tapHoldUnsubscribe) tapHoldUnsubscribe();
  tapHoldUnsubscribe = null;
}

/**
 * Keep the (latest) TK-N1 tap until the Arena owner's non-dismissable modal
 * closes, then route it. If the athlete answered the prompt by entering a
 * match, the tap is dropped: that choice came after the tap, and the sheet
 * would open over the match they just entered.
 */
function holdUntilModalCloses(response: Notifications.NotificationResponse): void {
  heldTimekeepTap = response;
  if (tapHoldUnsubscribe) return;
  tapHoldUnsubscribe = subscribeTimekeepTapHold(() => {
    if (isTimekeepTapHeld()) return;
    stopWatchingTapHold();
    // Next tick: the prompt's own outcome (a match entry) settles first.
    setTimeout(() => {
      const held = heldTimekeepTap;
      heldTimekeepTap = null;
      if (!held) return;
      if (isInArenaMatch()) {
        const id = responseId(held);
        if (id) handledIds.add(id);
        return;
      }
      handleResponse(held);
    }, 0);
  });
}

export function setupNotificationHandlers(): void {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // A reel is never worth a banner over a live match, nor a
      // timekeeper-mode push over the match it is about (that screen shows
      // it, spec 8); both stay in the list. A timekeeper-mode push about
      // another match keeps its banner (only its tap waits for the exit).
      const data = notification?.request?.content?.data;
      const quiet =
        (isInArenaMatch() && (isHighlightNotification(data) || isMatchVideoNotification(data))) ||
        isAboutCurrentMatch(data);
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
  heldTimekeepTap = null;
  stopWatchingMatch();
  stopWatchingTapHold();
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
  heldTimekeepTap = null;
  stopWatchingMatch();
  stopWatchingTapHold();
  handledIds.clear();
}
