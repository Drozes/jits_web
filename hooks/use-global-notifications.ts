"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { showNotification } from "@/lib/notifications";
import { refreshUnreadCounts } from "@/hooks/use-unread-count";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import type { Message } from "@/types/message";

type SenderMeta = { name: string; avatarUrl: string | null };

async function resolveSender(
  supabase: ReturnType<typeof createClient>,
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

  const meta: SenderMeta = {
    name: data?.display_name ?? "Someone",
    avatarUrl: data?.profile_photo_url ?? null,
  };
  cache.set(senderId, meta);
  return meta;
}

export function useGlobalNotifications(currentAthleteId: string): void {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const senderCache = useRef(new Map<string, SenderMeta>());

  useEffect(() => {
    const supabase = createClient();

    const messageChannel = supabase
      .channel("global-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload: RealtimePostgresInsertPayload<Message>) => {
          const msg = payload.new;

          // Skip own messages
          if (msg.sender_id === currentAthleteId) return;

          // Refresh unread badge immediately
          refreshUnreadCounts();

          // Suppress toast if user is viewing this conversation
          if (
            pathnameRef.current === `/messages/${msg.conversation_id}`
          )
            return;

          const sender = await resolveSender(
            supabase,
            msg.sender_id,
            senderCache.current,
          );

          showNotification({
            type: "message",
            title: sender.name,
            body: msg.body ?? "Sent an image",
            href: `/messages/${msg.conversation_id}`,
            avatarUrl: sender.avatarUrl,
          });
        },
      )
      .subscribe();

    // Listen for updates to challenges this athlete sent (accepted/declined)
    const challengeChannel = supabase
      .channel(`challenge-updates-${currentAthleteId}`)
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
            showNotification({
              type: "challenge",
              title: "Challenge Accepted!",
              body: `${opponent.name} accepted your challenge`,
              href: `/match/lobby/${challenge.id}`,
              avatarUrl: opponent.avatarUrl,
            });
          }

          if (challenge.status === "declined") {
            const opponent = await resolveSender(
              supabase,
              challenge.opponent_id,
              senderCache.current,
            );
            showNotification({
              type: "challenge",
              title: "Challenge Declined",
              body: `${opponent.name} declined your challenge`,
              avatarUrl: opponent.avatarUrl,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(challengeChannel);
    };
  }, [currentAthleteId]);
}
