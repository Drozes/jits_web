"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { refreshUnreadCounts } from "@/hooks/use-unread-count";
import { useChatChannel } from "@/hooks/use-chat-channel";
import { useChatMessages } from "@/hooks/use-chat-messages";
import { MessageBubble } from "@/components/domain/message-bubble";
import { MessageInput } from "@/components/domain/message-input";
import { TypingIndicator } from "@/components/domain/typing-indicator";
import type { Message } from "@/types/message";

interface ChatThreadProps {
  conversationId: string;
  currentAthleteId: string;
  headerName: string;
  otherAthleteId: string | null;
  initialMessages: Message[];
}

export function ChatThread({
  conversationId,
  currentAthleteId,
  headerName,
  initialMessages,
}: ChatThreadProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  const {
    messages,
    sendMessage,
    loadOlderMessages,
    hasMore,
    isSending,
    addRealtimeMessage,
  } = useChatMessages({
    conversationId,
    currentAthleteId,
    initialMessages,
  });

  const markRead = useCallback(async () => {
    const supabase = createClient();
    await supabase.rpc("mark_conversation_read", {
      p_conversation_id: conversationId,
    });
    refreshUnreadCounts();
  }, [conversationId]);

  const handleRealtimeMessage = useCallback(
    (msg: Message) => {
      addRealtimeMessage(msg);
      // Keep last_read_at current while user is viewing the thread
      markRead();
    },
    [addRealtimeMessage, markRead],
  );

  const { sendTypingEvent, typingUsers } = useChatChannel({
    conversationId,
    currentAthleteId,
    onNewMessage: handleRealtimeMessage,
  });

  // Mark as read on mount and on window focus
  useEffect(() => {
    markRead();
    const onFocus = () => markRead();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [markRead]);

  // Auto-scroll to bottom when new messages arrive (if user is near bottom)
  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    isNearBottom.current = scrollHeight - scrollTop - clientHeight < 100;

    // Load older messages when scrolling near top
    if (scrollTop < 50 && hasMore) {
      loadOlderMessages();
    }
  }, [hasMore, loadOlderMessages]);

  const handleSend = useCallback(
    async (body: string) => {
      await sendMessage(body);
      markRead();
    },
    [sendMessage, markRead],
  );

  return (
    <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-md flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <button
          onClick={() => router.push("/messages")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold truncate">{headerName}</h1>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
      >
        {hasMore && (
          <button
            onClick={loadOlderMessages}
            className="mx-auto block text-xs text-muted-foreground hover:text-foreground py-2"
          >
            Load older messages
          </button>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.sender_id === currentAthleteId}
            isPending={"_pending" in msg && msg._pending === true}
          />
        ))}
        <TypingIndicator users={typingUsers} />
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput
        onSend={handleSend}
        onTyping={sendTypingEvent}
        isSending={isSending}
      />
    </div>
  );
}
