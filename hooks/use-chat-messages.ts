"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/message";

interface UseChatMessagesOpts {
  conversationId: string;
  currentAthleteId: string;
  initialMessages: Message[];
}

interface PendingMessage extends Message {
  _pending?: boolean;
}

interface UseChatMessagesReturn {
  messages: PendingMessage[];
  sendMessage: (body: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  hasMore: boolean;
  isSending: boolean;
  addRealtimeMessage: (message: Message) => void;
}

const PAGE_SIZE = 50;

export function useChatMessages({
  conversationId,
  currentAthleteId,
  initialMessages,
}: UseChatMessagesOpts): UseChatMessagesReturn {
  const [messages, setMessages] = useState<PendingMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialMessages.length >= PAGE_SIZE);
  const [isSending, setIsSending] = useState(false);
  const seenIds = useRef(new Set(initialMessages.map((m) => m.id)));

  /** Add a message from realtime, deduplicating against pending/existing */
  const addRealtimeMessage = useCallback((msg: Message) => {
    if (seenIds.current.has(msg.id)) {
      // Replace pending version with confirmed version
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...msg, _pending: false } : m)),
      );
      return;
    }
    seenIds.current.add(msg.id);
    setMessages((prev) => [...prev, msg]);
  }, []);

  /** Send a message optimistically */
  const sendMessage = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;

      setIsSending(true);
      const clientId = crypto.randomUUID();

      // Optimistic local message
      const pending: PendingMessage = {
        id: clientId,
        conversation_id: conversationId,
        sender_id: currentAthleteId,
        body: trimmed,
        image_url: null,
        message_type: "user",
        created_at: new Date().toISOString(),
        _pending: true,
      };
      seenIds.current.add(clientId);
      setMessages((prev) => [...prev, pending]);

      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("messages")
          .insert({
            id: clientId,
            conversation_id: conversationId,
            sender_id: currentAthleteId,
            body: trimmed,
          });

        if (error) {
          // Remove failed optimistic message
          seenIds.current.delete(clientId);
          setMessages((prev) => prev.filter((m) => m.id !== clientId));
        } else {
          // Confirm the optimistic message immediately
          setMessages((prev) =>
            prev.map((m) =>
              m.id === clientId ? { ...m, _pending: false } : m,
            ),
          );
        }
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, currentAthleteId],
  );

  /** Load older messages (cursor-based pagination) */
  const loadOlderMessages = useCallback(async () => {
    const oldest = messages[0];
    if (!oldest) return;

    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    const older = ((data as Message[]) ?? []).reverse();
    if (older.length < PAGE_SIZE) setHasMore(false);

    for (const m of older) seenIds.current.add(m.id);
    setMessages((prev) => [...older, ...prev]);
  }, [messages, conversationId]);

  return {
    messages,
    sendMessage,
    loadOlderMessages,
    hasMore,
    isSending,
    addRealtimeMessage,
  };
}
