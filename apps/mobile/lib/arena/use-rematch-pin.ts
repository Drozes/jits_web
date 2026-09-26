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

export interface RematchPinInput {
  competitors: ArenaCompetitor[];
  lobbyIds: Set<string>;
  isLoading: boolean;
  refresh: () => void;
  /** Opponent of the current outgoing challenge, if one was sent. */
  outgoingOpponentId: string | null;
}

export interface RematchPin {
  pinnedId: string | null;
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
    useNavigation<NavigationProp<{ arena: { rematch?: string } }>>();
  const params = useLocalSearchParams<{ rematch?: string | string[] }>();
  const param = Array.isArray(params.rematch)
    ? params.rematch[0]
    : params.rematch;
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  const refreshedFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!param) return;
    setPinnedId(param);
    refreshedFor.current = null;
    navigation.setParams({ rematch: undefined });
  }, [param, navigation]);

  const clear = React.useCallback(() => setPinnedId(null), []);
  useFocusEffect(React.useCallback(() => clear, [clear]));

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
    name: pinned?.displayName ?? null,
    isOnline: inLobby && !!pinned,
  };
}

/** Moves the row with `id` to the front; everyone else keeps roster order. */
export function pinFirst<T extends { id: string }>(
  list: T[],
  id: string | null,
): T[] {
  const i = id ? list.findIndex((c) => c.id === id) : -1;
  return i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list;
}
