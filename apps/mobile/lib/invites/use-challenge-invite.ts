/**
 * The inviter's challenge invite (jr_be spec 016, M2): created once on open,
 * code refreshed when its 30 minutes run out (link unchanged), a location
 * reading every 60 s while foregrounded (`invite_waiting`), and the claim
 * followed live on the invite row. When claimed, the inviter reports a reading
 * for the challenge, which tells it (or makes it) started vs booked.
 *
 * Invites are single use and the server caps open ones at 5, so an invite
 * that was never shared, never claimed and not explicitly kept is withdrawn
 * when the screen goes away (it would otherwise sit open for 7 days).
 */
import * as React from "react";
import { AppState } from "react-native";
import {
  createInvite,
  getInviteStatus,
  getMyBookings,
  refreshInviteCode,
  reportMatchPresence,
  revokeInvite,
  subscribeToInvite,
  logInviteEvent,
  type ChallengeInvite,
  type InviteEntryPoint,
} from "@jits/shared/api/invites";
import { createInviteErrorMessage, revokeInviteErrorMessage } from "@jits/shared/utils";
import { supabase } from "@/lib/supabase/client";
import { readLocationOnce } from "./location";

export type InviterPhase =
  | { kind: "creating" }
  | { kind: "error"; message: string; hint: string }
  | { kind: "open" }
  | { kind: "claimed"; claimerName: string | null }
  | { kind: "started"; matchId: string }
  | { kind: "booked"; challengeId: string; opponentName: string | null }
  | { kind: "revoked" }
  | { kind: "expired" };

const PRESENCE_EVERY_MS = 60_000;
const REFRESH_RETRY_MS = 15_000;

async function athleteFirstName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data, error } = await supabase.from("athletes").select("first_name, display_name").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const row = data as { first_name: string | null; display_name: string | null };
  return row.first_name || row.display_name || null;
}

export function useChallengeInvite(entryPoint: InviteEntryPoint | null) {
  const [invite, setInvite] = React.useState<ChallengeInvite | null>(null);
  const [phase, setPhase] = React.useState<InviterPhase>({ kind: "creating" });
  const [locationDenied, setLocationDenied] = React.useState(false);
  const [codeStale, setCodeStale] = React.useState(false);
  const inviteRef = React.useRef<ChallengeInvite | null>(null);
  inviteRef.current = invite;
  const phaseRef = React.useRef<InviterPhase>(phase);
  phaseRef.current = phase;
  // Shared (a share target opened) or explicitly kept: survives leaving.
  const keepRef = React.useRef(false);

  const create = React.useCallback(async () => {
    setPhase({ kind: "creating" });
    const res = await createInvite(supabase, entryPoint);
    if (!res.ok) {
      setPhase({ kind: "error", message: createInviteErrorMessage(res.error.hint), hint: res.error.hint });
      return;
    }
    keepRef.current = false;
    setCodeStale(false);
    setInvite(res.data);
    setPhase({ kind: "open" });
    void logInviteEvent(supabase, "qr_shown", { inviteId: res.data.invite_id });
  }, [entryPoint]);

  // Once per screen: a remount (or a dev double effect) must not mint a second invite.
  const createdRef = React.useRef(false);
  React.useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    void create();
  }, [create]);

  // Withdraw an unshared, unclaimed, unkept invite when the screen goes away.
  React.useEffect(
    () => () => {
      const current = inviteRef.current;
      if (!current || keepRef.current || phaseRef.current.kind !== "open") return;
      void revokeInvite(supabase, current.invite_id);
    },
    [],
  );

  // Refresh the short code when it expires (the link stays the same). A
  // failed refresh (offline) marks the code stale and retries every 15 s.
  const [refreshAttempt, setRefreshAttempt] = React.useState(0);
  React.useEffect(() => {
    if (!invite || phase.kind !== "open") return;
    const ms = Date.parse(invite.code_expires_at) - Date.now();
    const t = setTimeout(
      async () => {
        const res = await refreshInviteCode(supabase, invite.invite_id);
        if (res.ok) {
          setCodeStale(false);
          setRefreshAttempt(0);
          setInvite((cur) => (cur ? { ...cur, ...res.data } : cur));
        } else if (res.error.hint === "invite_not_open") {
          setPhase({ kind: "expired" });
        } else {
          setCodeStale(true);
          setRefreshAttempt((n) => n + 1);
        }
      },
      refreshAttempt > 0 ? REFRESH_RETRY_MS : Math.max(0, ms) + 500,
    );
    return () => clearTimeout(t);
  }, [invite, phase.kind, refreshAttempt]);

  const settleClaim = React.useCallback(async (challengeId: string) => {
    const loc = await readLocationOnce({ ask: false });
    if (loc.status === "ok") {
      const res = await reportMatchPresence(supabase, loc.reading, "booking_open", { challengeId });
      if (res.ok && res.data.ok && res.data.match_id) {
        setPhase({ kind: "started", matchId: res.data.match_id });
        return;
      }
    }
    const { data: match } = await supabase.from("matches").select("id").eq("challenge_id", challengeId).maybeSingle();
    if (match?.id) {
      setPhase({ kind: "started", matchId: match.id });
      return;
    }
    const bookings = await getMyBookings(supabase);
    const mine = bookings.ok ? bookings.data.find((b) => b.challenge_id === challengeId) : undefined;
    setPhase({
      kind: "booked",
      challengeId,
      opponentName: mine?.opponent.first_name ?? mine?.opponent.display_name ?? null,
    });
  }, []);

  // A status change of the invite row, from realtime or the fallback read.
  // Settled once: realtime and the fallback can both report the claim.
  const settledRef = React.useRef(false);
  const onRow = React.useCallback(
    (row: { status: string; claimed_by?: string | null; challenge_id: string | null }) => {
      if (settledRef.current) return;
      if (row.status === "claimed" && row.challenge_id) {
        settledRef.current = true;
        const challengeId = row.challenge_id;
        setPhase({ kind: "claimed", claimerName: null });
        void athleteFirstName(row.claimed_by ?? null).then((name) => {
          if (name) setPhase((cur) => (cur.kind === "claimed" ? { kind: "claimed", claimerName: name } : cur));
        });
        void settleClaim(challengeId);
      } else if (row.status === "expired") {
        setPhase({ kind: "expired" });
      } else if (row.status === "revoked") {
        setPhase({ kind: "revoked" });
      }
    },
    [settleClaim],
  );

  // Live claim updates on the invite row, keyed by id so a code refresh
  // (a new invite object, same row) does not resubscribe.
  const inviteId = invite?.invite_id ?? null;
  React.useEffect(() => {
    if (!inviteId) return;
    settledRef.current = false;
    return subscribeToInvite(supabase, inviteId, onRow);
  }, [inviteId, onRow]);

  // A reading on open, every 60 s and on every return to the foreground while
  // the invite is open. Each tick also re-reads the row, in case a realtime
  // event was missed while the app was in the background.
  const deniedLoggedRef = React.useRef(false);
  const isOpen = phase.kind === "open";
  React.useEffect(() => {
    if (!inviteId || !isOpen) return;
    let cancelled = false;
    const tick = async () => {
      if (AppState.currentState === "background") return;
      const row = await getInviteStatus(supabase, inviteId);
      if (cancelled) return;
      if (row) onRow(row);
      const loc = await readLocationOnce({ ask: true });
      if (cancelled) return;
      setLocationDenied(loc.status === "denied");
      if (loc.status === "denied" && !deniedLoggedRef.current) {
        deniedLoggedRef.current = true;
        void logInviteEvent(supabase, "location_denied", { inviteId, detail: { context: "invite_waiting" } });
      }
      if (loc.status === "ok") {
        void reportMatchPresence(supabase, loc.reading, "invite_waiting", { inviteId });
      }
    };
    void tick();
    const t = setInterval(() => void tick(), PRESENCE_EVERY_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void tick();
    });
    return () => {
      cancelled = true;
      clearInterval(t);
      sub.remove();
    };
  }, [inviteId, isOpen, onRow]);

  const revoke = React.useCallback(async () => {
    const current = inviteRef.current;
    if (!current) return { ok: true as const };
    const res = await revokeInvite(supabase, current.invite_id);
    if (res.ok) setPhase({ kind: "revoked" });
    return res.ok
      ? { ok: true as const }
      : { ok: false as const, hint: res.error.hint, message: revokeInviteErrorMessage(res.error.hint) };
  }, []);

  /** A share target opened, or the inviter chose to keep it: never auto-withdrawn. */
  const keepOpen = React.useCallback(() => {
    keepRef.current = true;
  }, []);
  /** Whether leaving now would withdraw the invite (open, unshared, unkept). */
  const wouldWithdrawOnLeave = React.useCallback(
    () => Boolean(inviteRef.current) && !keepRef.current && phaseRef.current.kind === "open",
    [],
  );

  return { invite, phase, locationDenied, codeStale, revoke, retry: create, keepOpen, wouldWithdrawOnLeave };
}
