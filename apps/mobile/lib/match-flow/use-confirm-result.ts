import * as React from "react";
import { toast } from "@/components/ui/toast";
import { markResultFresh } from "@/components/ui/elo-system/play-once";
import { supabase } from "@/lib/supabase/client";
import { confirmMatchResult } from "@jits/shared/api/mutations";
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import { mutationQueue, isQueuedResult } from "@/lib/network/mutation-queue";
import { haptics } from "@/lib/motion";
import { SEND_GRACE_MS, useMatchSyncContext, useStepMatchSync } from "./match-sync-context";
import { useSendCeiling } from "./send-timing";
import { matchHaptics } from "./use-haptics";
import { CONFIRM_COPY } from "./confirm-copy";
import { noteResultConfirmed, useResultEditNotice } from "./use-result-edit-notice";
import { shortName } from "./short-name";
import type { MatchAthleteView } from "./match-roles";

type Athlete = Pick<MatchAthleteView, "athleteId" | "displayName">;

/**
 * Timekeeper mode (A8): the edit count each athlete's confirmation in the
 * DB's list is credited to (null: not listed). The match and its
 * confirmations are two parallel reads (`use-match-reconciler.ts`), so one
 * snapshot can straddle an edit: the new count next to the confirmation the
 * edit deleted. The reconciler keeps one read in flight, so a read is always
 * sent after the one before it came back: a listing on a read is of a result
 * at least as new as the count that earlier read showed. So a read's listing
 * is credited to the lower of its own count and the count the read before it
 * showed (`readCount`): it stands once two reads in a row agree on the count,
 * never on the read that first shows an edit. A new read is a new list (the
 * wizard keeps each read's list as its own array): one that is neither the
 * list the stored credits came from nor the list the last committed render
 * showed (`useConfirmResult`'s `lastListRef`). A read whose credits equal the
 * stored ones is not stored, but it is still the read in hand, so a render
 * of the same read keeps its credit and a re-render changes nothing. The
 * count can also move with no new list (a read whose confirmations failed,
 * or the match-only `refresh()`, which is not one of the reconciler's
 * serialized reads): that keeps every credit and does not move `readCount`,
 * because only a list read after a list at the new count is known to be
 * newer than the edit. A listing stands only when credited to the current
 * count.
 */
interface ConfirmListing {
  /**
   * The list these credits were last stored from. A render-phase update
   * re-renders with the same list before it commits: this keeps that render
   * from counting it as a new read a second time.
   */
  ids: readonly string[];
  /** The count shown with the read in hand, when it first arrived. */
  readCount: number;
  me: number | null;
  opponent: number | null;
}

function nextListing(prev: ConfirmListing, ids: readonly string[], newRead: boolean, count: number, me: string, opponent: string): ConfirmListing {
  const credit = (id: string, was: number | null) => {
    if (!ids.includes(id)) return null;
    if (!newRead && was != null) return was;
    return Math.min(prev.readCount, count);
  };
  return { ids, readCount: newRead ? count : prev.readCount, me: credit(me, prev.me), opponent: credit(opponent, prev.opponent) };
}

/** The same credits: the stored listing still holds (its list may be an older array of the same read). */
function sameCredits(a: ConfirmListing, b: ConfirmListing): boolean {
  return a.readCount === b.readCount && a.me === b.me && a.opponent === b.opponent;
}

interface UseConfirmResultParams {
  matchId: string;
  me: Athlete;
  opponent: Athlete;
  /** Athletes the DB has a confirmation for (from the wizard's reconciler). */
  confirmedAthleteIds: string[];
  /**
   * Timekeeper mode only: the edit count of the result on screen and the
   * timekeeper's name (TK-RC3; a blank name names nobody). Null: the
   * two-athlete confirm, exactly as shipped.
   */
  timekeeper: { editCount: number; recorderName: string } | null;
  /** Leave for the verdict (called once). */
  onCompleted: () => void;
}

export interface ConfirmResultState {
  /**
   * This athlete's confirmation stands (for the result on screen). The
   * two-athlete flow: from the tap, as shipped. Timekeeper mode (PM29): only
   * once the server took a confirm made here at the edit count on screen (ok,
   * or queued offline), or the DB's list credits one to that count; never on
   * the tap alone.
   */
  myConfirmed: boolean;
  opponentConfirmed: boolean;
  /**
   * Arm the step's timer for `advance`: `myConfirmed`, in both modes (the
   * two-athlete flow from the tap, as shipped; timekeeper mode once the
   * server has the confirm).
   */
  canAdvance: boolean;
  /**
   * Timekeeper mode (PM29): this phone's confirm is out and has not answered
   * (Confirm busy, Dispute disabled). Ends with the reply, or as failed after
   * `SEND_CEILING_MS`. Always false in the two-athlete flow.
   */
  sending: boolean;
  /**
   * Timekeeper mode (PM29): the server refused a confirm as RESULT_CHANGED
   * (TK-RC4) and no read with a newer edit count is on screen yet: Confirm
   * and Dispute wait for it (disabled, not busy). Always false in the
   * two-athlete flow.
   */
  waitingForNewResult: boolean;
  /**
   * The confirm-driven move to the verdict, for the step's timer once
   * `canAdvance` (never on a confirm an edit has since superseded, A8).
   */
  advance: () => void;
  /** Confirm the result on screen. */
  confirm: () => Promise<void>;
  /** The dispute form submitted: tell the opponent, then leave for the verdict. */
  disputed: () => Promise<void>;
}

/**
 * The confirm step's state (`steps/confirm-step.tsx`): confirm the recorded
 * result, hear the opponent's confirm and dispute, and move on to the verdict
 * once. Leaving counts as confirming (jits-02vo.7), so once this athlete has
 * confirmed the step moves on (`advance`, on the step's own timer, which the
 * match-loop harness pins in the step's source); the verdict itself waits on
 * (and polls for) an opponent who has not confirmed yet.
 *
 * Signals, fastest first: result_confirmed / match_disputed broadcasts, then
 * the wizard's reconciler (confirmations from the DB), which also moves the
 * wizard to the verdict once both rows exist or the match is disputed.
 *
 * Timekeeper mode (`timekeeper`): both athletes confirm the result the
 * timekeeper recorded, at its edit count. A confirm is of THAT result: the
 * server refuses a stale count (RESULT_CHANGED, TK-RC4, and the new result
 * is read), and once an edit moves the count past the one this phone
 * confirmed at, the confirmation is gone (the edit deleted it) and the step
 * never completes into the verdict on it (A8; the wizard's A8 baseline in
 * `use-wizard-sync.ts` relies on that). The same holds for a confirmation
 * known only from the DB's list (the relaunch path onto confirm): it stands
 * only when credited to the current count, never on a read that straddles an
 * edit (`ConfirmListing`). And a confirm made here stands only once the
 * server has taken it (PM29: ok, or queued offline): until then the row
 * keeps WAITING ON YOU and Confirm is busy (`sending`), because a reply can
 * still come back RESULT_CHANGED, and the athlete must never see CONFIRMED,
 * or the verdict, of a result that did not stand. The press is bounded
 * (`SEND_CEILING_MS`: the step has no exit, and no layer times a request
 * out), and its reply sorts into confirmed, result changed (TK-RC4 once,
 * then `waitingForNewResult` until a read shows a newer count), moved on (the
 * match is disputed or voided: no toast, the read moves the wizard) and
 * failed (`Couldn't confirm` / `Check your connection and try again.`). A
 * failure for a confirmation the DB already credits shows nothing, and a
 * reply after the step unmounted shows nothing. A broadcast only triggers a read
 * (M-R8): a confirmation heard by broadcast may be of a result the
 * timekeeper has since edited. And the athlete is told once when an edit
 * resets their confirmation (TK-RC3, `useResultEditNotice`): mounted here,
 * where the wizard brings them back after an edit; its record of their
 * confirm survives the confirm, verdict and confirm remounts, and a relaunch
 * (it is kept on the device).
 */
export function useConfirmResult({
  matchId,
  me,
  opponent,
  confirmedAthleteIds,
  timekeeper,
  onCompleted,
}: UseConfirmResultParams): ConfirmResultState {
  const timekeeperMode = timekeeper != null;
  const editCount = timekeeper?.editCount ?? 0;
  /** The two-athlete flow: the edit count this phone confirmed at, from the tap (always 0); null before. Timekeeper mode never sets it (PM29). */
  const [confirmedAt, setConfirmedAt] = React.useState<number | null>(null);
  /** Timekeeper mode: the edit count the server took this phone's confirm at (ok, or queued offline); null before. */
  const [acceptedAt, setAcceptedAt] = React.useState<number | null>(null);
  /** Timekeeper mode: this phone's confirm is out (PM29); the ref guards a second tap before the render. */
  const [sending, setSending] = React.useState(false);
  const sendingRef = React.useRef(false);
  /** Timekeeper mode: the edit count a confirm was refused at as RESULT_CHANGED (PM29); null before. */
  const [staleAt, setStaleAt] = React.useState<number | null>(null);
  const [opponentConfirmedLocal, setOpponentConfirmed] = React.useState(false);
  const { reconcileNow } = useMatchSyncContext();
  const ceiling = useSendCeiling();
  // Timekeeper mode: credit the listings of each new snapshot (A8,
  // `ConfirmListing`), kept from the previous render (React's derived-state
  // pattern). The two-athlete flow never edits, so it reads the list as shipped.
  // The list in hand on mount has no read before it here: it is credited to
  // the count shown with it.
  const [storedListing, setListing] = React.useState<ConfirmListing>(() =>
    nextListing({ ids: [], readCount: editCount, me: null, opponent: null }, confirmedAthleteIds, true, editCount, me.athleteId, opponent.athleteId),
  );
  /**
   * The list the last committed render showed (set after commit, so a render
   * React throws away never moves it): a read whose credits equal the stored
   * ones is not stored, and this keeps it the read in hand.
   */
  const lastListRef = React.useRef<readonly string[]>(confirmedAthleteIds);
  React.useEffect(() => {
    lastListRef.current = confirmedAthleteIds;
  }, [confirmedAthleteIds]);
  let listing = storedListing;
  if (timekeeperMode) {
    const newRead = confirmedAthleteIds !== storedListing.ids && confirmedAthleteIds !== lastListRef.current;
    const next = nextListing(storedListing, confirmedAthleteIds, newRead, editCount, me.athleteId, opponent.athleteId);
    // Stored only when a credit or the read's count changes: a caller that
    // hands a fresh but equal array on every render then settles at once.
    if (!sameCredits(next, storedListing)) {
      listing = next;
      setListing(next);
    }
  }
  /** The DB's list has this athlete's confirmation of the result on screen. */
  const listedNow = (id: string, credit: number | null) => (timekeeperMode ? credit === editCount : confirmedAthleteIds.includes(id));
  const listedMine = listedNow(me.athleteId, listing.me);
  // The two-athlete flow: a confirm made here stands from the tap, as
  // shipped; otherwise the DB's list says. Timekeeper mode (PM29): a confirm
  // the server took at the count still on screen (an edit deletes it), or
  // the DB's list credited to that count; never the tap alone.
  const myConfirmed = timekeeperMode
    ? acceptedAt === editCount || listedMine
    : confirmedAt != null
      ? confirmedAt === editCount
      : listedMine;
  // Timekeeper mode never sets the local flag (M-R8, below): there the DB's
  // list, which an edit clears, is the only word on the opponent.
  const opponentConfirmed = opponentConfirmedLocal || listedNow(opponent.athleteId, listing.opponent);
  // Both modes arm the move once the confirmation stands: the two-athlete flow
  // on the tap, as shipped; timekeeper mode once the server has it.
  const canAdvance = myConfirmed;
  // PM29: hold Confirm and Dispute after a RESULT_CHANGED refusal until a read
  // with a newer count is on screen (the plate, TK-RC1 and TK-RC2 change in
  // that same render).
  const waitingForNewResult = timekeeperMode && staleAt != null && editCount <= staleAt;
  /** Read when a failed reply lands: a confirmation that already stands (a lost reply) shows nothing. */
  const standsRef = React.useRef(myConfirmed);
  standsRef.current = myConfirmed;

  const recorderName = timekeeper?.recorderName.trim() ?? "";
  useResultEditNotice({
    matchId,
    athleteId: me.athleteId,
    enabled: timekeeperMode,
    resultEditCount: editCount,
    confirmedAthleteIds,
    timekeeperName: recorderName ? shortName(recorderName) : "",
  });

  const advancedRef = React.useRef(false);
  const onCompletedRef = React.useRef(onCompleted);
  onCompletedRef.current = onCompleted;
  // Read when the advance timer fires: the timer is cleared once an edit
  // supersedes the confirm (`canAdvance` turns false), but it can fire after
  // the render that carries the newer count and before that clean-up runs.
  // A confirmation known only from the DB's list stands while it is credited
  // to the current count (timekeeper mode); the two-athlete flow never edits.
  const stillCurrentRef = React.useRef<() => boolean>(() => true);
  stillCurrentRef.current = () => !timekeeperMode || canAdvance;
  /** Leave for the verdict, once (a dispute leaves this way, whatever the count). */
  const leave = React.useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onCompletedRef.current();
  }, []);
  /**
   * The confirm-driven move to the verdict. A8: never on a confirm that an
   * edit landing after it has superseded (the edit deleted it); this athlete
   * stays to confirm the new result. In a two-athlete match the count is
   * always 0, so this is `leave`.
   */
  const advance = React.useCallback(() => {
    if (stillCurrentRef.current()) leave();
  }, [leave]);

  const sync = useStepMatchSync({
    matchId,
    onResultConfirmed: (athleteId) => {
      // Timekeeper mode (M-R8): a broadcast only re-reads. The confirmation
      // it announces may be of a result the timekeeper has since edited.
      if (timekeeperMode) {
        reconcileNow();
        return;
      }
      if (athleteId === opponent.athleteId) setOpponentConfirmed(true);
    },
    onMatchDisputed: (athleteId) => {
      // Timekeeper mode (M-R8): the read of the disputed match moves the wizard.
      if (timekeeperMode) {
        reconcileNow();
        return;
      }
      if (athleteId === me.athleteId) return;
      toast.info({ text1: "Result disputed", description: `${opponent.displayName} disputed the result. An admin will review it.` });
      advance();
    },
  });

  async function confirm() {
    if (myConfirmed || sendingRef.current || waitingForNewResult) return;
    const at = editCount;
    if (timekeeperMode) {
      // PM29: Confirm busy, Dispute disabled, the row unchanged until the reply.
      sendingRef.current = true;
      setSending(true);
    } else {
      // The two-athlete row flips at the tap, as shipped.
      setConfirmedAt(at);
    }
    const call = mutationQueue.enqueue(`confirm-result:${matchId}:${me.athleteId}`, () =>
      timekeeperMode ? confirmMatchResult(supabase, matchId, at) : confirmMatchResult(supabase, matchId),
    );
    // Timekeeper mode: bounded by the ceiling, and silent once the step has gone (PM29).
    const res = timekeeperMode ? await ceiling.within(call) : await call;
    if (timekeeperMode) {
      sendingRef.current = false;
      setSending(false);
    }
    if (!res.ok) {
      if (!timekeeperMode) setConfirmedAt(null);
      const code = res.error.code;
      if (timekeeperMode && code === "RESULT_CHANGED") {
        // The timekeeper edited the result under this confirm: show the new
        // one, and hold the buttons until it is on screen (TK-RC4 once per edit).
        setStaleAt(at);
        toast.info({ text1: CONFIRM_COPY.resultChanged.title, description: CONFIRM_COPY.resultChanged.description });
      } else if (!timekeeperMode || (code !== "MATCH_NOT_PENDING" && !standsRef.current)) {
        void matchHaptics.error();
        // Timekeeper mode shows no DomainError message (M-R4), only the guidance (PM29); the two-athlete toast keeps its shipped description.
        toast.error(timekeeperMode ? { text1: CONFIRM_COPY.couldNotConfirm, description: CONFIRM_COPY.checkConnection } : { text1: CONFIRM_COPY.couldNotConfirm, description: res.error.message });
      }
      // Timekeeper mode, moved on (MATCH_NOT_PENDING: the opponent disputed,
      // or the match was voided) or a confirmation that already stands: no
      // toast. In every case the read moves the screen.
      reconcileNow();
      return;
    }
    if (timekeeperMode) {
      // The server took it (or holds it to sync): the confirmation stands at this count.
      setAcceptedAt(at);
      noteResultConfirmed(matchId, me.athleteId, at);
    }
    // The one haptic for confirming (a commit action, Light). If the Confirm
    // button ever gains a `press` haptic of its own, drop this call: one
    // haptic per event. The verdict's `ratingGain` is a later, separate moment.
    void haptics.press();
    // The verdict that follows is fresh even if the match completed long ago.
    markResultFresh(matchId);
    if (isQueuedResult(res.data)) {
      toast.success({ text1: "Saved locally", description: "Confirmation will sync when you're back online." });
    }
    void sync.broadcastResultConfirmed(me.athleteId);
  }

  async function disputed() {
    await settleWithin(sync.broadcastMatchDisputed(me.athleteId), SEND_GRACE_MS);
    leave();
  }

  return { myConfirmed, opponentConfirmed, canAdvance, sending, waitingForNewResult, advance, confirm, disputed };
}
