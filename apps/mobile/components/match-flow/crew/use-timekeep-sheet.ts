import * as React from "react";
import { useRouter } from "expo-router";
import { isUuid } from "@jits/shared/utils";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";
import {
  getLatestTimekeeperRequest,
  getMyTimekeepingMatch,
  getTimekeeperRequest,
  respondTimekeeperRequest,
  type TimekeeperRequest,
} from "@jits/shared/api/timekeeper";
import { giveAiConsent, hasAiConsentFor } from "@/lib/moderation/ai-consent";
import { AI_CONSENT_COPY } from "@/lib/moderation/moderation-copy";
import { arenaMatchHref } from "@/lib/arena/constants";
import { HOME_HREF } from "@/lib/deep-links/retired-routes";
import { subscribeIncomingTimekeeperRequests } from "@/lib/match-flow/use-incoming-timekeeper-requests";
import { useScreenFocused } from "@/lib/navigation/use-screen-focused";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { useSecondsLeft } from "./use-seconds-left";

/** How often an open sheet re-reads its request (a missed realtime row cannot leave it up). */
export const TIMEKEEP_SHEET_POLL_MS = 4_000;

/** Refusals that end the sheet with TK-T6 (Round 5: also an accept refused because the asked person turned busy). */
const CLOSED_CODES = new Set(["REQUEST_CLOSED", "NOT_REQUESTED", "TIMEKEEPER_BUSY", "ATHLETE_IN_TIMEKEEPER_MATCH"]);

interface Params {
  matchId: string;
  /** From the realtime row; a push carries only the match, then the newest request sent to me is read. */
  requestId: string | null;
  athleteId: string | null;
}

type ConsentSheet = { visible: boolean; busy: boolean; error: string | null };
const CONSENT_HIDDEN: ConsentSheet = { visible: false, busy: false, error: null };

export interface TimekeepSheetState {
  /** Null while it loads. */
  request: TimekeeperRequest | null;
  /** TK-T5, to `expires_at`. */
  secondsLeft: number | null;
  answering: "accept" | "decline" | null;
  /** TK-T8: Not now on the consent sheet (or the server's `consent_required`). */
  consentRefused: boolean;
  accept: () => void;
  decline: () => void;
  /** The shipped "Before you film" sheet, opened by Accept without consent (D12). */
  consent: ConsentSheet & { onAllow: () => void; onNotNow: () => void; onDismiss: () => void };
}

/**
 * The asked person's sheet (spec 4.2 Seat, 11; board P-TK-B4). Reads the
 * request with `get_timekeeper_request` (the asked person cannot read the
 * match, review tech M6) and keeps it current: its realtime row, a poll and
 * a read when the TK-T5 countdown reaches 0:00. A request the server reports
 * no longer open (withdrawn, lapsed, declined on another device) closes the
 * sheet with TK-T6. One reported accepted, but not by this sheet, was
 * accepted by this person (only the asked person can accept): on another
 * device, or before the app was killed and reopened from the TK-N1 push,
 * the only way back to the match (spec 11). While they are still seated
 * (`get_my_timekeeping_match`) the sheet opens the match, with no notice;
 * otherwise (left before the start, or the match is over past its edit
 * window) TK-T6. Accept asks for AI consent first when it is missing (the
 * shipped sheet, unchanged); Not now leaves TK-T8 with Accept still
 * available. Accept seats the timekeeper and opens the match (the asked
 * person's own tap); Decline closes the sheet.
 */
export function useTimekeepSheet({ matchId, requestId, athleteId }: Params): TimekeepSheetState {
  const router = useRouter();
  const routerRef = React.useRef(router);
  routerRef.current = router;
  const [request, setRequest] = React.useState<TimekeeperRequest | null>(null);
  const [answering, setAnswering] = React.useState<"accept" | "decline" | null>(null);
  const [consentRefused, setConsentRefused] = React.useState(false);
  const [consent, setConsent] = React.useState<ConsentSheet>(CONSENT_HIDDEN);
  const alive = React.useRef(true);
  const closed = React.useRef(false);
  const answeringRef = React.useRef(false);
  const needsConsent = React.useRef(false);
  const idRef = React.useRef<string | null>(requestId);
  const requestRef = React.useRef<TimekeeperRequest | null>(null);
  // Only the screen on top may navigate: a sheet under another screen (the
  // privacy policy opened from the consent sheet, a second sheet) that sees
  // its request end leaves when it is back on top, never by popping the
  // screen above it.
  const focused = useScreenFocused();
  const focusedRef = React.useRef(focused);
  focusedRef.current = focused;
  const onTopAgain = React.useRef<"over" | "accepted" | null>(null);

  /** Leave the sheet: back where the asked person was, or Home from a cold start. */
  const leave = React.useCallback((to?: string) => {
    closed.current = true;
    const r = routerRef.current;
    if (to) r.replace(to as never);
    else if (r.canGoBack()) r.back();
    else r.replace(HOME_HREF as never);
  }, []);
  /** Over without an answer from here: TK-T6, unless this sheet is answering it right now. */
  const over = React.useCallback(() => {
    if (closed.current || answeringRef.current || !alive.current) return;
    if (!focusedRef.current) {
      onTopAgain.current = "over";
      return;
    }
    toast.info(C["TK-T6"]);
    leave();
  }, [leave]);
  /**
   * Accepted, not by this sheet's answer: by this person on another device,
   * or before the app was killed. Still seated: on to the match (the wizard
   * shows where it stands), with no notice. Not seated: TK-T6. A failed read
   * keeps the sheet; the next poll asks again.
   */
  const accepted = React.useCallback(async () => {
    if (closed.current || answeringRef.current || !alive.current) return;
    if (!focusedRef.current) {
      onTopAgain.current = "accepted";
      return;
    }
    const seat = await getMyTimekeepingMatch(supabase).catch(() => null);
    if (closed.current || answeringRef.current || !alive.current || !seat?.ok) return;
    if (seat.data?.matchId !== matchId) return over();
    if (!focusedRef.current) {
      onTopAgain.current = "accepted";
      return;
    }
    leave(arenaMatchHref(matchId));
  }, [matchId, leave, over]);
  React.useEffect(() => {
    const next = onTopAgain.current;
    if (!focused || !next) return;
    onTopAgain.current = null;
    if (next === "over") over();
    else void accepted();
  }, [focused, over, accepted]);

  const refresh = React.useCallback(async () => {
    if (closed.current) return;
    // A malformed id (a crafted `elorated://match/x/timekeep` link, a bad
    // `request` param) can never be read (22P02 maps to UNKNOWN, which the
    // poll would retry forever): it is a closed request.
    if (!isUuid(matchId) || (idRef.current !== null && !isUuid(idRef.current))) return over();
    if (!idRef.current) {
      const latest = await getLatestTimekeeperRequest(supabase, matchId);
      if (!alive.current || !latest.ok) return;
      if (!latest.data) return over();
      idRef.current = latest.data.requestId;
    }
    const res = await getTimekeeperRequest(supabase, idRef.current);
    if (!alive.current) return;
    if (res.ok && res.data.status === "pending") {
      // A poll that finds nothing new does not re-render the sheet.
      const prev = requestRef.current;
      if (prev?.requestId === res.data.requestId && prev.expiresAt === res.data.expiresAt) return;
      requestRef.current = res.data;
      setRequest(res.data);
    } else if (res.ok && res.data.status === "accepted") await accepted();
    else if (res.ok || res.error.code === "NOT_REQUESTED") over();
    // Any other failure keeps the sheet; the next poll tries again.
  }, [matchId, over, accepted]);

  React.useEffect(() => {
    alive.current = true;
    const run = () => void refresh().catch(() => undefined);
    run();
    const poll = setInterval(run, TIMEKEEP_SHEET_POLL_MS);
    const unsubscribe = subscribeIncomingTimekeeperRequests((row) => {
      if (row.id !== idRef.current || row.status === "pending") return;
      if (row.status === "accepted") void accepted();
      else over();
    });
    return () => {
      alive.current = false;
      clearInterval(poll);
      unsubscribe();
    };
  }, [refresh, over, accepted]);

  // TK-T5 counts on the server's clock (as learned); at 0:00 the server's
  // read decides (`get_timekeeper_request` reads a pending request past
  // `expires_at` as `expired`), so a phone whose clock runs ahead never
  // closes a request that is still open, and the poll keeps asking.
  const secondsLeft = useSecondsLeft(request?.expiresAt);
  React.useEffect(() => {
    if (secondsLeft === 0) void refresh().catch(() => undefined);
  }, [secondsLeft, refresh]);

  const respond = React.useCallback(
    async (accept: boolean) => {
      const req = requestRef.current;
      if (!req || answeringRef.current || closed.current) return;
      answeringRef.current = true;
      setAnswering(accept ? "accept" : "decline");
      try {
        const res = await respondTimekeeperRequest(supabase, req.requestId, accept);
        if (!alive.current) return;
        if (res.ok) return leave(accept ? arenaMatchHref(res.data.matchId) : undefined);
        answeringRef.current = false;
        setAnswering(null);
        if (res.error.code === "CONSENT_REQUIRED") {
          needsConsent.current = true;
          setConsentRefused(true);
        } else if (CLOSED_CODES.has(res.error.code)) over();
      } catch {
        // A failed send: the answer stays available.
        answeringRef.current = false;
        if (alive.current) setAnswering(null);
      }
    },
    [leave, over],
  );

  const accept = React.useCallback(() => {
    if (needsConsent.current || !hasAiConsentFor(athleteId, "timekeeper")) setConsent({ visible: true, busy: false, error: null });
    else void respond(true);
  }, [athleteId, respond]);

  const onAllow = React.useCallback(async () => {
    setConsent({ visible: true, busy: true, error: null });
    const ok = await giveAiConsent("timekeeper").catch(() => false);
    if (!alive.current) return;
    if (!ok) return setConsent({ visible: true, busy: false, error: AI_CONSENT_COPY.failed });
    setConsent(CONSENT_HIDDEN);
    needsConsent.current = false;
    setConsentRefused(false);
    void respond(true);
  }, [respond]);

  return {
    request,
    secondsLeft,
    answering,
    consentRefused,
    accept,
    decline: () => void respond(false),
    consent: {
      ...consent,
      onAllow: () => void onAllow(),
      onNotNow: () => {
        setConsent(CONSENT_HIDDEN);
        setConsentRefused(true);
      },
      onDismiss: () => setConsent(CONSENT_HIDDEN),
    },
  };
}
