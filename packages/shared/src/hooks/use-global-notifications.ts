import { useEffect, useRef } from "react";
import type {
  RealtimePostgresInsertPayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { Message } from "../types/message";
import type { NotificationPayload } from "../types/notification";

type SenderMeta = { name: string; avatarUrl: string | null };

async function resolveSender(
  supabase: SupabaseClient,
  senderId: string,
  cache: Map<string, SenderMeta>,
): Promise<SenderMeta> {
  const cached = cache.get(senderId);
  if (cached) return cached;

  const { data } = await supabase
    .from("athletes")
    .select("display_name, profile_photo_url")
    .eq("id", senderId)
    .single();

  // Don't cache failed lookups -- allow retry on next notification
  if (!data) return { name: "Someone", avatarUrl: null };

  const meta: SenderMeta = {
    name: data.display_name ?? "Someone",
    avatarUrl: data.profile_photo_url ?? null,
  };
  cache.set(senderId, meta);
  return meta;
}

export interface UseGlobalNotificationsParams {
  supabase: SupabaseClient;
  currentAthleteId: string;
  /** Show a notification toast / banner. Web wraps `sonner.toast.custom`; mobile wraps `react-native-toast-message`. */
  notify: (payload: NotificationPayload) => void;
  /**
   * Returns the current route (pathname) so we can suppress message toasts
   * when the user is already viewing the conversation. Web returns the
   * `usePathname()` value; mobile returns the active route segment.
   * Called on every notification -- keep it cheap.
   */
  getCurrentRoute: () => string | null;
  /** Optional: invoked after a new message arrives so a host-managed unread badge can re-poll. */
  onUnreadRefresh?: () => void;
  /** Build the deep link for a conversation -- e.g. `/messages/{id}` on web, `/(app)/messages/{id}` on mobile. */
  buildMessageHref?: (conversationId: string) => string;
  /** Build the deep link for an accepted challenge match lobby -- e.g. `/match/lobby/{challengeId}` on web. */
  buildLobbyHref?: (challengeId: string) => string;
}

/**
 * Subscribes to two global postgres-changes channels:
 *  - `global-messages`: new messages from other athletes -> toast notifications
 *  - `challenge-updates-{athleteId}`: challenge UPDATEs (accepted/declined/expired) -> toast notifications
 *
 * Platform-specific concerns are injected via callbacks so the same hook runs
 * on Next.js (web) and React Native (mobile).
 */
export function useGlobalNotifications({
  supabase,
  currentAthleteId,
  notify,
  getCurrentRoute,
  onUnreadRefresh,
  buildMessageHref,
  buildLobbyHref,
}: UseGlobalNotificationsParams): void {
  // Stash the latest callbacks in refs so the realtime subscription
  // doesn't have to re-subscribe when they change identity.
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const getRouteRef = useRef(getCurrentRoute);
  getRouteRef.current = getCurrentRoute;
  const onUnreadRefreshRef = useRef(onUnreadRefresh);
  onUnreadRefreshRef.current = onUnreadRefresh;
  const buildMessageHrefRef = useRef(buildMessageHref);
  buildMessageHrefRef.current = buildMessageHref;
  const buildLobbyHrefRef = useRef(buildLobbyHref);
  buildLobbyHrefRef.current = buildLobbyHref;

  const senderCache = useRef(new Map<string, SenderMeta>());
  const mountIdRef = useRef(0);

  useEffect(() => {
    const mountId = ++mountIdRef.current;
    const messageChannel = supabase
      .channel(`global-messages:${mountId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload: RealtimePostgresInsertPayload<Message>) => {
          const msg = payload.new;

          // Skip own messages and system messages (no sender)
          if (!msg.sender_id || msg.sender_id === currentAthleteId) return;

          // Refresh unread badge immediately
          onUnreadRefreshRef.current?.();

          // Suppress toast if user is viewing this conversation
          const route = getRouteRef.current();
          const messageHref =
            buildMessageHrefRef.current?.(msg.conversation_id) ??
            `/messages/${msg.conversation_id}`;
          if (route === messageHref) return;

          const sender = await resolveSender(
            supabase,
            msg.sender_id,
            senderCache.current,
          );

          notifyRef.current({
            type: "message",
            title: sender.name,
            body: msg.body ?? "Sent an image",
            href: messageHref,
            avatarUrl: sender.avatarUrl,
          });
        },
      )
      .subscribe();

    // Listen for updates to challenges this athlete sent (accepted/declined)
    const challengeChannel = supabase
      .channel(`challenge-updates-${currentAthleteId}:${mountId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `challenger_id=eq.${currentAthleteId}`,
        },
        async (payload) => {
          const challenge = payload.new as {
            id: string;
            status: string;
            opponent_id: string;
          };

          if (challenge.status === "accepted") {
            const opponent = await resolveSender(
              supabase,
              challenge.opponent_id,
              senderCache.current,
            );
            notifyRef.current({
              type: "challenge",
              title: "Challenge Accepted!",
              body: `${opponent.name} accepted your challenge`,
              href:
                buildLobbyHrefRef.current?.(challenge.id) ??
                `/match/lobby/${challenge.id}`,
              avatarUrl: opponent.avatarUrl,
            });
          }

          if (challenge.status === "declined") {
            const opponent = await resolveSender(
              supabase,
              challenge.opponent_id,
              senderCache.current,
            );
            notifyRef.current({
              type: "challenge",
              title: "Challenge Declined",
              body: `${opponent.name} declined your challenge`,
              avatarUrl: opponent.avatarUrl,
            });
          }

          if (challenge.status === "expired") {
            const opponent = await resolveSender(
              supabase,
              challenge.opponent_id,
              senderCache.current,
            );
            notifyRef.current({
              type: "challenge",
              title: "Challenge Expired",
              body: `Your challenge to ${opponent.name} has expired`,
              avatarUrl: opponent.avatarUrl,
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${currentAthleteId}`,
        },
        async (payload) => {
          const challenge = payload.new as {
            id: string;
            status: string;
            challenger_id: string;
          };

          if (challenge.status === "expired") {
            const challenger = await resolveSender(
              supabase,
              challenge.challenger_id,
              senderCache.current,
            );
            notifyRef.current({
              type: "challenge",
              title: "Challenge Expired",
              body: `${challenger.name}'s challenge has expired`,
              avatarUrl: challenger.avatarUrl,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(challengeChannel);
    };
  }, [supabase, currentAthleteId]);
}
