import type { NotificationItem } from "@jits/shared/types/notification";
import type { MyHighlightItem } from "@jits/shared/api/highlight-share";
import type { PendingChallenge } from "@jits/shared/hooks/use-pending-challenges";
import { ARENA_CHALLENGE_FRESH_MS } from "@jits/shared/constants";
import { bellBody, bellTitle, highlightHref } from "@/lib/highlight/discovery";
import { ARENA_HREF } from "@/lib/arena/constants";
import { getServerClockOffsetMs } from "@/lib/arena/incoming-challenges";
import { matchDetailHref } from "@/lib/match-detail/href";

/**
 * A ready-reel row in the bell feed (jr_be spec 015 section 16.6.4). Mobile
 * only: the shared `NotificationItemType` is NOT widened, since web renders
 * that union and would have to change with it.
 */
export interface HighlightNotificationItem {
  type: "highlight_ready";
  id: string;
  title: string;
  body: string;
  route: string;
  createdAt: string;
  unread: boolean;
}

/**
 * A history or pending-challenge row. `unread` is set only on a FRESH pending
 * challenge (one the badge counts), so the panel can show which rows the
 * badge refers to.
 */
export type FeedNotificationItem = NotificationItem & { unread?: boolean };

/** Everything the mobile bell lists. */
export type BellItem = FeedNotificationItem | HighlightNotificationItem;

export function isHighlightItem(item: BellItem): item is HighlightNotificationItem {
  return item.type === "highlight_ready";
}

/** Bell rows for the reels the athlete was notified about (a ledger row exists). */
export function toHighlightNotificationItems(items: MyHighlightItem[]): HighlightNotificationItem[] {
  return items.flatMap((h) =>
    h.notifiedAt
      ? [
          {
            type: "highlight_ready" as const,
            id: `highlight-${h.highlightId}-v${h.version}`,
            title: bellTitle(h.origin),
            body: bellBody(h.opponentName),
            route: highlightHref(h.highlightId, "bell"),
            createdAt: h.notifiedAt,
            unread: h.unseen,
          },
        ]
      : [],
  );
}

/** Newest first, the order the panel groups by date in. */
export function mergeBellItems(
  base: FeedNotificationItem[],
  highlights: HighlightNotificationItem[],
): BellItem[] {
  return [...base, ...highlights].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// ---- pending challenges: fresh (badge) vs missed (jits-dq85.8) -------------

/**
 * `now` (device time) on the server's clock: the device clock minus the offset
 * the Arena learned (`getServerClockOffsetMs`). Every server timestamp the bell
 * compares against goes through this, so on a phone with a skewed clock the
 * bell, the Arena tab badge and the Arena lapse a challenge at the same moment.
 */
function toServerTime(now: number): number {
  return now - getServerClockOffsetMs();
}

/**
 * Whether a pending challenge is still inside the live Arena window, with
 * `now` in DEVICE time corrected by the learned server-clock offset. The SAME
 * rule as the Arena's `freshDeadline` / `isFreshIncoming`: the window ends at
 * min(createdAt + `ARENA_CHALLENGE_FRESH_MS`, expiresAt), exclusive. So the
 * bell, the Arena tab's red count (the larger of the two counts) and the
 * Arena lapse a challenge at the same instant, even one whose `expiresAt` is
 * sooner than the 10-minute window. An unparseable `createdAt` is NOT fresh:
 * a row the bell cannot date never badges.
 */
export function isFreshPendingChallenge(
  challenge: Pick<PendingChallenge, "createdAt"> & { expiresAt?: string | null },
  now: number,
): boolean {
  const deadline = freshEndsAt(challenge);
  return deadline !== null && toServerTime(now) < deadline;
}

/** The server instant the live window ends (exclusive), or null when undatable. */
function freshEndsAt(challenge: { createdAt?: string | null; expiresAt?: string | null }): number | null {
  if (!challenge.createdAt) return null;
  const created = Date.parse(challenge.createdAt);
  if (Number.isNaN(created)) return null;
  const end = created + ARENA_CHALLENGE_FRESH_MS;
  const expires = challenge.expiresAt ? Date.parse(challenge.expiresAt) : Number.NaN;
  return Number.isNaN(expires) ? end : Math.min(end, expires);
}

/**
 * Whether a pending challenge is past its server `expiresAt`. The shared hook
 * only filters expiry on a full read, and the pg_cron expiry UPDATE can be
 * missed while realtime is down, so the bell drops these itself. An
 * unparseable `expiresAt` is treated as not expired (the server is the
 * source of truth for it).
 */
export function isExpiredPendingChallenge(
  challenge: Pick<PendingChallenge, "expiresAt">,
  now: number,
): boolean {
  const expires = Date.parse(challenge.expiresAt);
  return !Number.isNaN(expires) && expires <= toServerTime(now);
}

/**
 * Splits pending incoming challenges into fresh (counted) and missed (listed
 * only). Expired ones are in neither.
 *
 * `isDismissed` names challenges this device took off the Arena for good
 * without answering (decision Q3: a manual go-offline drops a challenge tucked
 * with Later; no decline is sent, so it is still pending server-side). Those
 * are listed as Missed even inside the window: no Arena surface will raise
 * them again, so a red count or a deep link to them would lead nowhere.
 */
export function splitPendingByFreshness(
  pending: PendingChallenge[],
  now: number,
  isDismissed: (challengeId: string) => boolean = () => false,
): { fresh: PendingChallenge[]; missed: PendingChallenge[] } {
  const fresh: PendingChallenge[] = [];
  const missed: PendingChallenge[] = [];
  for (const c of pending) {
    if (isExpiredPendingChallenge(c, now)) continue;
    (isFreshPendingChallenge(c, now) && !isDismissed(c.id) ? fresh : missed).push(c);
  }
  return { fresh, missed };
}

/**
 * The next instant (DEVICE time) the bell's lists change on their own: a
 * fresh challenge turns into a missed one, or a listed challenge reaches its
 * `expiresAt`. Null when nothing is listed. The bell re-derives then instead
 * of ticking.
 */
export function nextFreshnessChangeAt(pending: PendingChallenge[], now: number): number | null {
  const offset = getServerClockOffsetMs();
  const serverNow = now - offset;
  let next: number | null = null;
  const consider = (at: number | null) => {
    if (at !== null && at > serverNow && (next === null || at < next)) next = at;
  };
  for (const c of pending) {
    if (isExpiredPendingChallenge(c, now)) continue;
    if (isFreshPendingChallenge(c, now)) consider(freshEndsAt(c));
    const expires = Date.parse(c.expiresAt);
    if (!Number.isNaN(expires)) consider(expires);
  }
  return next === null ? null : next + offset;
}

/**
 * A live pending challenge as a bell row. Same id and copy as the history
 * builder's `challenge_received` row, so the two never both appear. A `fresh`
 * row (counted by the badge) is marked unread; a Missed one is not.
 */
export function pendingChallengeToBellItem(
  c: PendingChallenge,
  fresh = false,
): FeedNotificationItem {
  const typeLabel = c.matchType === "ranked" ? "ranked" : "casual";
  return {
    id: `challenge-recv-${c.id}`,
    type: "challenge_received",
    title: "Challenge Received",
    body: `${c.challengerName} sent you a ${typeLabel} challenge`,
    challengeId: c.id,
    createdAt: c.createdAt,
    ...(fresh ? { unread: true } : {}),
  };
}

/**
 * The bell panel's two lists. `feed` is the history (challenges answered,
 * match results), ready reels and the FRESH pending challenges, newest first.
 * `missed` holds the pending challenges past the freshness window (or
 * dismissed on this device, see `splitPendingByFreshness`), newest first. History's own pending rows are dropped: the realtime pending list is
 * the source of truth for what is still waiting.
 *
 * Accepted gap: if every pending read fails (mount and SUBSCRIBED re-reads
 * both error or reject) while the history read succeeds, the pending
 * challenges are missing from both lists until a foreground, panel open or
 * pull re-read succeeds. History is not used as a fallback because its
 * pending rows carry no `expiresAt` (the query does not filter on expiry), so
 * it could list lapsed challenges as actionable, and the panel would then
 * disagree with the badge, which counts only the pending list.
 */
export function buildBellLists(
  history: NotificationItem[],
  highlights: HighlightNotificationItem[],
  pending: PendingChallenge[],
  now: number,
  isDismissed?: (challengeId: string) => boolean,
): { feed: BellItem[]; missed: BellItem[] } {
  const { fresh, missed } = splitPendingByFreshness(pending, now, isDismissed);
  const answered = history.filter((i) => i.type !== "challenge_received");
  const feed = mergeBellItems(
    [...answered, ...fresh.map((c) => pendingChallengeToBellItem(c, true))],
    highlights,
  );
  return { feed, missed: mergeBellItems(missed.map((c) => pendingChallengeToBellItem(c)), []) };
}

/**
 * Where tapping a bell row goes, or null for a row that is not tappable.
 * Ready reels open the viewer, challenge rows (fresh and Missed alike, spec
 * 4.5 / AC-H15) the Arena, match results the match detail screen (from
 * `matchId`). Only highlight rows carry a `route`; the shared feed type
 * dropped it because it used to carry the retired `/session/<id>` path
 * (jits-r01i).
 *
 * A FRESH incoming challenge (`unread`, the rows the badge counts) opens
 * `/arena?challenge=<id>`, the same deep link its push carries (spec F1,
 * AC-A8), so an offline athlete is offered go-live for that challenge and a
 * live one gets it raised. Missed rows stay plain `/arena`: they are past the
 * window and the deep-link hook would ignore them anyway.
 *
 * Callers open the result with `openHref` (lib/deep-links/tab-root-route) so
 * a tab-root href never stacks a second Arena.
 */
export function bellItemRoute(item: BellItem): string | null {
  if (isHighlightItem(item)) return item.route;
  switch (item.type) {
    case "challenge_received":
      return item.unread && item.challengeId
        ? `${ARENA_HREF}?challenge=${encodeURIComponent(item.challengeId)}`
        : ARENA_HREF;
    case "challenge_accepted":
    case "challenge_declined":
      return ARENA_HREF;
    case "match_result":
      return item.matchId ? matchDetailHref(item.matchId) : null;
    default:
      return null;
  }
}
