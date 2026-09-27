/**
 * The `?rematch=<athlete id>` handoff from a match summary (jits-00fr).
 *
 * The param is copied into local state and then cleared from THIS route at
 * once (route-scoped `navigation.setParams`, not the global router, so it can
 * never land on whichever screen happens to be focused), and a later visit to
 * the tab never re-pins a stale opponent.
 *
 * The pin ends only when a challenge to that opponent actually went out, that
 * is, when the app-wide challenge state holds an outgoing challenge to them.
 * `sendChallenge` resolves the same way on success and failure, so the
 * outgoing slot is the only honest success signal; a refused or failed send
 * keeps the pin and its tag. Leaving the tab also ends it.
 *
 * The roster is a snapshot with no realtime feed, but presence is live: an
 * opponent who goes live after the roster loaded is in the lobby yet missing
 * from the list, so the roster is re-read once for them.
 */
import * as React from "react";
import { useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import type { NavigationProp } from "@react-navigation/native";
import type { ArenaCompetitor } from "./use-arena-roster";
import { toast } from "@/components/ui/toast";

export interface RematchPinInput {
  competitors: ArenaCompetitor[];
  lobbyIds: Set<string>;
  isLoading: boolean;
  /** A background roster read (`refreshQuietly`): nobody pulled for it. */
  refresh: () => void;
  /** Opponent of the current outgoing challenge, if one was sent. */
  outgoingOpponentId: string | null;
}

export interface RematchPin {
  pinnedId: string | null;
  /**
   * Arrived from the verdict's Rematch (`&send=1`): the Arena sends the
   * challenge itself once the opponent is back in the lobby
   * (`useRematchAutoSend`).
   */
  autoSend: boolean;
  /** Display name, known only while the opponent is on the roster. */
  name: string | null;
  /** In the lobby AND on the roster, so their row can be pinned. */
  isOnline: boolean;
}

export function useRematchPin({
  competitors,
  lobbyIds,
  isLoading,
  refresh,
  outgoingOpponentId,
}: RematchPinInput): RematchPin {
  const navigation =
    useNavigation<NavigationProp<{ arena: { rematch?: string; send?: string } }>>();
  const params = useLocalSearchParams<{ rematch?: string | string[]; send?: string | string[] }>();
  const param = Array.isArray(params.rematch)
    ? params.rematch[0]
    : params.rematch;
  const sendParam = Array.isArray(params.send) ? params.send[0] : params.send;
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  const [autoSend, setAutoSend] = React.useState(false);
  const refreshedFor = React.useRef<string | null>(null);

  const paramRef = React.useRef(param);
  paramRef.current = param;

  React.useEffect(() => {
    if (!param) return;
    setPinnedId(param);
    setAutoSend(sendParam === "1");
    refreshedFor.current = null;
    navigation.setParams({ rematch: undefined, send: undefined });
  }, [param, sendParam, navigation]);

  const clear = React.useCallback(() => {
    setPinnedId(null);
    setAutoSend(false);
  }, []);
  // Leaving the tab also drops the param itself. When the match exits into an
  // Arena that is already mounted (exitMatchTo's dismissTo, jits-tlk3), the
  // navigator applies the incoming params in an update scheduled AFTER this
  // screen's effects, so the setParams above is overwritten and the param
  // lingers. Left there, a second rematch of the same opponent would not
  // change it and would never re-pin. Blur is past that update, so this one
  // sticks. Guarded so an unmount with nothing to clear dispatches nothing.
  useFocusEffect(
    React.useCallback(
      () => () => {
        clear();
        if (paramRef.current) navigation.setParams({ rematch: undefined, send: undefined });
      },
      [clear, navigation],
    ),
  );

  React.useEffect(() => {
    if (pinnedId && outgoingOpponentId === pinnedId) clear();
  }, [pinnedId, outgoingOpponentId, clear]);

  const pinned = pinnedId
    ? (competitors.find((c) => c.id === pinnedId) ?? null)
    : null;
  const inLobby = !!pinnedId && lobbyIds.has(pinnedId);

  React.useEffect(() => {
    if (!pinnedId || !inLobby || pinned || isLoading) return;
    if (refreshedFor.current === pinnedId) return;
    refreshedFor.current = pinnedId;
    refresh();
  }, [pinnedId, inLobby, pinned, isLoading, refresh]);

  return {
    pinnedId,
    autoSend: !!pinnedId && autoSend,
    name: pinned?.displayName ?? null,
    isOnline: inLobby && !!pinned,
  };
}

/** Grace before asking to go live: leaving the match restores a live
 * athlete on its own (use-arena-live). The ask itself is idempotent
 * (`goLive`, never a toggle), so a restore still in flight is harmless. */
export const REMATCH_GO_LIVE_GRACE_MS = 1_500;

export interface RematchAutoSendInput {
  pin: RematchPin;
  isLive: boolean;
  isSaving: boolean;
  /** Something else is in flight or on screen: never send over it. */
  blocked: boolean;
  capReached: boolean;
  outgoingOpponentId: string | null;
  /** Idempotent go-live (`arenaActions.goLive`), never a toggle. */
  goLive: () => void;
  send: (opponentId: string, opponentName: string) => Promise<void>;
}

/**
 * The verdict's Rematch, finished in the Arena (match-flow redesign).
 *
 * Sending from the verdict itself fails quietly: the opponent is usually
 * still on THEIR verdict, and an app that is in a match declines every
 * incoming challenge as busy (`settleBusyInsert` in use-arena-challenge.ts),
 * so the rematcher just saw "<name> declined." Instead the verdict lands
 * here with `send=1` and this hook:
 *  - takes the rematcher live if leaving the match did not (only live
 *    athletes can challenge, and the opponent's recovery only offers a
 *    challenge whose challenger is in the lobby);
 *  - sends the challenge once, the moment the opponent is back in the lobby
 *    (so out of their match) and nothing else is in flight;
 *  - says "Rematch sent to <name>" once the outgoing challenge exists.
 *    Refusals (cap, opponent gone) are toasted by `sendChallenge` itself,
 *    and while the opponent is away the Rematch hint says it will send.
 */
export function useRematchAutoSend({
  pin,
  isLive,
  isSaving,
  blocked,
  capReached,
  outgoingOpponentId,
  goLive,
  send,
}: RematchAutoSendInput): void {
  const sentForRef = React.useRef<string | null>(null);
  const sentNameRef = React.useRef<string | null>(null);
  const toastedForRef = React.useRef<string | null>(null);
  const liveRef = React.useRef({ isLive, isSaving });
  liveRef.current = { isLive, isSaving };
  const goLiveRef = React.useRef(goLive);
  goLiveRef.current = goLive;

  const wanted = pin.autoSend ? pin.pinnedId : null;

  // Each arrival from a verdict is its own rematch: once the pin ends (sent,
  // cleared, tab left), forget the last one so a second rematch of the same
  // opponent on this still-mounted screen sends again.
  React.useEffect(() => {
    if (wanted) return;
    if (sentForRef.current && outgoingOpponentId === sentForRef.current && toastedForRef.current !== sentForRef.current) return;
    sentForRef.current = null;
    sentNameRef.current = null;
    toastedForRef.current = null;
  }, [wanted, outgoingOpponentId]);

  // Go live once per rematch if the match exit did not restore it.
  React.useEffect(() => {
    if (!wanted) return;
    const t = setTimeout(() => {
      const { isLive: live, isSaving: saving } = liveRef.current;
      if (!live && !saving) goLiveRef.current();
    }, REMATCH_GO_LIVE_GRACE_MS);
    return () => clearTimeout(t);
  }, [wanted]);

  React.useEffect(() => {
    if (!wanted || !pin.isOnline || !isLive || blocked || capReached) return;
    if (outgoingOpponentId || sentForRef.current === wanted) return;
    sentForRef.current = wanted;
    sentNameRef.current = pin.name;
    void send(wanted, pin.name ?? "your opponent");
  }, [wanted, pin.isOnline, pin.name, isLive, blocked, capReached, outgoingOpponentId, send]);

  React.useEffect(() => {
    const id = sentForRef.current;
    if (!id || outgoingOpponentId !== id || toastedForRef.current === id) return;
    toastedForRef.current = id;
    toast.success({ text1: `Rematch sent to ${sentNameRef.current ?? "your opponent"}` });
  }, [outgoingOpponentId]);
}

/** Moves the row with `id` to the front; everyone else keeps roster order. */
export function pinFirst<T extends { id: string }>(
  list: T[],
  id: string | null,
): T[] {
  const i = id ? list.findIndex((c) => c.id === id) : -1;
  return i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list;
}
