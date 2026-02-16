"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/message";
import type {
  RealtimeChannel,
  RealtimePostgresInsertPayload,
} from "@supabase/supabase-js";

interface UseChatChannelOpts {
  conversationId: string;
  currentAthleteId: string;
  onNewMessage: (message: Message) => void;
}

interface UseChatChannelReturn {
  sendTypingEvent: () => void;
  typingUsers: string[];
  isConnected: boolean;
}

const TYPING_DISMISS_MS = 3_000;
const TYPING_DEBOUNCE_MS = 300;

export function useChatChannel({
  conversationId,
  currentAthleteId,
  onNewMessage,
}: UseChatChannelOpts): UseChatChannelReturn {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastTypingSent = useRef(0);
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: RealtimePostgresInsertPayload<Message>) => {
          onNewMessageRef.current(payload.new);
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const userId = payload?.athlete_id as string | undefined;
        if (!userId || userId === currentAthleteId) return;

        setTypingUsers((prev) => {
          if (!prev.includes(userId)) return [...prev, userId];
          return prev;
        });

        // Clear existing timer for this user
        const existing = typingTimers.current.get(userId);
        if (existing) clearTimeout(existing);

        // Auto-dismiss after 3s
        typingTimers.current.set(
          userId,
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((id) => id !== userId));
            typingTimers.current.delete(userId);
          }, TYPING_DISMISS_MS),
        );
      })
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      typingTimers.current.forEach((t) => clearTimeout(t));
      typingTimers.current.clear();
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentAthleteId]);

  const sendTypingEvent = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_DEBOUNCE_MS) return;
    lastTypingSent.current = now;

    channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { athlete_id: currentAthleteId },
    });
  }, [currentAthleteId]);

  return { sendTypingEvent, typingUsers, isConnected };
}
