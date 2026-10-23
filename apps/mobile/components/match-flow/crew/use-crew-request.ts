import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";
import {
  cancelTimekeeperRequest,
  getLatestTimekeeperRequest,
  type LatestTimekeeperRequest,
  type TimekeeperMatchState,
} from "@jits/shared/api/timekeeper";
import type { MatchRoles } from "@/lib/match-flow/match-roles";
import { useMatchSyncContext } from "@/lib/match-flow/match-sync-context";
import { shortName } from "@/lib/match-flow/short-name";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { crewStatus, type CrewStatus } from "./crew-view";
import type { AskedRequest } from "./use-crew-candidates";
import { hasPassed, useRerenderAt } from "./use-seconds-left";

/**
 * How long this phone's own Ask (or withdrawal) stands in for the state: a
 * state read that started before the request committed must not flicker the
 * card away (or back). Longer than the crew poll (4 s), so a fresh read has
 * landed by then; after it the state alone decides.
 */
export const OWN_CHANGE_GRACE_MS = 6_000;

type OpenRequest = NonNullable<TimekeeperMatchState["openRequest"]>;

interface Params {
  matchId: string;
  viewerId: string;
  roles: MatchRoles;
  tkState: TimekeeperMatchState | null;
  /** The open request ended (declined, lapsed, withdrawn): the list re-reads (a decliner drops out). */
  onRequestEnded: () => void;
}

export interface CrewRequest {
  status: CrewStatus;
  /** One open request per match (R4): nobody can be asked while one is up. */
  canAsk: boolean;
  noteAsked: (request: AskedRequest) => void;
  withdraw: () => void;
  withdrawing: boolean;
}

/**
 * The picker's open request and the line above the list (spec 4.2 Pick):
 * the timekeeper-mode state's open request and last outcome, this phone's
 * own Ask and withdrawal until the state shows them, an open request past
 * its `expires_at` read as lapsed at once (TK-P22), and, read once on
 * mount, the match's newest request (an accepted one with nobody seated is a
 * pre-start drop-out, TK-D1). A seat flashes TK-P23 as the wizard leaves
 * `crew` for the face-off (a toast, since this step unmounts with the seat).
 */
export function useCrewRequest({ matchId, viewerId, roles, tkState, onRequestEnded }: Params): CrewRequest {
  const { subscribeSnapshot } = useMatchSyncContext();
  const [own, setOwn] = React.useState<{ request: OpenRequest | null; hides: string | null; until: number } | null>(null);
  const [withdrawing, setWithdrawing] = React.useState(false);
  const [latest, setLatest] = React.useState<LatestTimekeeperRequest | null>(null);
  const alive = React.useRef(true);
  React.useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  // TK-D1: the newest request, once (the drop-out lands the athletes here).
  React.useEffect(() => {
    getLatestTimekeeperRequest(supabase, matchId)
      .then((res) => {
        if (alive.current && res.ok) setLatest(res.data);
      })
      .catch(() => undefined);
  }, [matchId]);

  // TK-P23 as the seat lands (the snapshot reaches this step before the wizard leaves it).
  React.useEffect(() => {
    let flashed = false;
    return subscribeSnapshot((fresh) => {
      const name = fresh.timekeeper?.display_name;
      if (flashed || !fresh.timekeeper_id || !name) return;
      flashed = true;
      toast.success(C["TK-P23"](shortName(name)));
    });
  }, [subscribeSnapshot]);

  // This phone's own change stands in only for its grace window.
  React.useEffect(() => {
    if (!own) return;
    const t = setTimeout(() => setOwn(null), Math.max(0, own.until - Date.now()));
    return () => clearTimeout(t);
  }, [own]);

  const server = tkState?.openRequest ?? null;
  const ownAsk = own?.request ?? null;
  // A request this phone withdrew never comes back from a stale read, even
  // once this phone has asked someone else: its own Ask stands in instead.
  const serverOpen = server && server.id !== own?.hides ? server : null;
  // The state's open request has no expiry filter: it reads `pending` past
  // `expires_at` until a request RPC or the minute tick lapses it (spec 7).
  // This phone's own Ask after such a lapse replaced it (the request RPC
  // lapses it first), so a stale read of the old one gives way.
  const serverLapsed = !!serverOpen && hasPassed(serverOpen.expiresAt);
  let open: OpenRequest | null = (serverOpen && !(serverLapsed && ownAsk) ? serverOpen : null) ?? ownAsk;
  // The state caught up with an Ask: it rules from here.
  React.useEffect(() => {
    if (server && own?.request && server.id === own.request.id) setOwn(null);
  }, [server, own]);

  // Lapsed on the server's clock: over now, not at the next tick. The card
  // goes, the picker returns and TK-P22 names the person until the state's
  // own outcome (the same line) takes over.
  useRerenderAt(open?.expiresAt);
  const lapsed = open && hasPassed(open.expiresAt) ? open : null;
  if (lapsed) open = null;

  // A newer request or outcome supersedes the mount read (TK-D1 is only for the drop-out itself).
  const superseded = !!open || !!lapsed || !!tkState?.lastRequestOutcome;
  React.useEffect(() => {
    if (superseded) setLatest(null);
  }, [superseded]);

  const openId = open?.id ?? null;
  const prevOpen = React.useRef(openId);
  const ended = React.useRef(onRequestEnded);
  ended.current = onRequestEnded;
  React.useEffect(() => {
    if (prevOpen.current && !openId) ended.current();
    prevOpen.current = openId;
  }, [openId]);

  const noteAsked = React.useCallback(
    (r: AskedRequest) =>
      setOwn((prev) => ({
        request: { id: r.requestId, invitee: r.invitee, requestedBy: viewerId, expiresAt: r.expiresAt },
        // Asking again right after a withdrawal keeps the withdrawn one hidden.
        hides: prev?.hides ?? null,
        until: Date.now() + OWN_CHANGE_GRACE_MS,
      })),
    [viewerId],
  );

  const withdraw = React.useCallback(() => {
    if (!openId || withdrawing) return;
    setWithdrawing(true);
    cancelTimekeeperRequest(supabase, openId)
      .then((res) => {
        if (!alive.current) return;
        // Withdrawn, or already over (answered or lapsed): the card goes either way.
        if (res.ok || res.error.code === "REQUEST_CLOSED") {
          setOwn({ request: null, hides: openId, until: Date.now() + OWN_CHANGE_GRACE_MS });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive.current) setWithdrawing(false);
      });
  }, [openId, withdrawing]);

  const athleteShort = (id: string) => roles.athletes.find((a) => a.athleteId === id)?.shortName ?? "";
  const status = crewStatus({
    openRequest: open,
    lastRequestOutcome: lapsed
      ? { status: "expired", inviteeName: lapsed.invitee.displayName, at: lapsed.expiresAt }
      : (tkState?.lastRequestOutcome ?? null),
    latest,
    viewerId,
    athleteShort,
  });
  return { status, canAsk: !open, noteAsked, withdraw, withdrawing };
}
