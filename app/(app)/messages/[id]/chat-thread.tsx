"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { refreshUnreadCounts } from "@/hooks/use-unread-count";
import { useChatChannel } from "@/hooks/use-chat-channel";
import { useChatMessages } from "@/hooks/use-chat-messages";
import { MessageBubble } from "@/components/domain/message-bubble";
import { MessageInput } from "@/components/domain/message-input";
import { TypingIndicator } from "@/components/domain/typing-indicator";
import { DateSeparator } from "@/components/domain/date-separator";
import { getInitials } from "@/lib/utils";
import type { Message } from "@/types/message";

export interface ParticipantInfo {
  displayName: string;
  profilePhotoUrl: string | null;
}

interface ChatThreadProps {
  conversationId: string;
  conversationType: string;
  currentAthleteId: string;
  headerName: string;
  headerPhotoUrl: string | null;
  otherAthleteId: string | null;
  participants: Record<string, ParticipantInfo>;
  initialMessages: Message[];
}

export function ChatThread({
  conversationId,
  conversationType,
  currentAthleteId,
  headerName,
  headerPhotoUrl,
  otherAthleteId,
  participants,
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
      markRead();
    },
    [addRealtimeMessage, markRead],
  );

  const { sendTypingEvent, typingUsers } = useChatChannel({
    conversationId,
    currentAthleteId,
    onNewMessage: handleRealtimeMessage,
  });

  useEffect(() => {
    markRead();
    const onFocus = () => markRead();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [markRead]);

  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    isNearBottom.current = scrollHeight - scrollTop - clientHeight < 100;

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

  const isGroupChat = conversationType === "gym";

  return (
    <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-md flex-col bg-background pt-[env(safe-area-inset-top)]">
      <ThreadHeader
        name={headerName}
        photoUrl={headerPhotoUrl}
        isGroupChat={isGroupChat}
        otherAthleteId={otherAthleteId}
        onBack={() => router.push("/messages")}
      />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
      >
        {hasMore && (
          <button
            onClick={loadOlderMessages}
            className="mx-auto block text-xs text-muted-foreground hover:text-foreground py-2"
          >
            Load older messages
          </button>
        )}
        <MessageList
          messages={messages}
          currentAthleteId={currentAthleteId}
          participants={participants}
          showSenderInfo={isGroupChat}
        />
        <TypingIndicator users={typingUsers} />
        <div ref={bottomRef} />
      </div>

      <MessageInput
        onSend={handleSend}
        onTyping={sendTypingEvent}
        isSending={isSending}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Thread header with avatar + tap-to-profile                         */
/* ------------------------------------------------------------------ */

function ThreadHeader({
  name,
  photoUrl,
  isGroupChat,
  otherAthleteId,
  onBack,
}: {
  name: string;
  photoUrl: string | null;
  isGroupChat: boolean;
  otherAthleteId: string | null;
  onBack: () => void;
}) {
  const headerContent = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar className="h-8 w-8 border-2 border-accent/20 bg-gradient-to-br from-primary to-primary/80 text-white" size="default">
        {!isGroupChat && photoUrl && (
          <AvatarImage src={photoUrl} alt={name} />
        )}
        <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 font-bold text-white text-xs">
          {isGroupChat ? <Users className="h-3.5 w-3.5" /> : getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-base font-semibold">{name}</span>
    </div>
  );

  return (
    <div className="flex items-center gap-3 border-b px-4 py-3">
      <button
        onClick={onBack}
        className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground active:bg-muted"
        aria-label="Go back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      {!isGroupChat && otherAthleteId ? (
        <Link href={`/athlete/${otherAthleteId}`} className="min-w-0 flex-1">
          {headerContent}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{headerContent}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Message list with grouping + date separators                       */
/* ------------------------------------------------------------------ */

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function MessageList({
  messages,
  currentAthleteId,
  participants,
  showSenderInfo,
}: {
  messages: (Message & { _pending?: boolean })[];
  currentAthleteId: string;
  participants: Record<string, ParticipantInfo>;
  showSenderInfo: boolean;
}) {
  return (
    <div className="flex flex-col">
      {messages.map((msg, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const isOwn = msg.sender_id === currentAthleteId;

        // Date separator: show when day changes between messages
        const showDate = !prev || !isSameDay(prev.created_at, msg.created_at);

        // Grouping: consecutive messages from the same sender within 2 minutes
        const sameSenderAsPrev =
          prev &&
          prev.sender_id === msg.sender_id &&
          isSameDay(prev.created_at, msg.created_at) &&
          new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 120_000;

        const sameSenderAsNext =
          next &&
          next.sender_id === msg.sender_id &&
          isSameDay(msg.created_at, next.created_at) &&
          new Date(next.created_at).getTime() - new Date(msg.created_at).getTime() < 120_000;

        const isFirstInGroup = !sameSenderAsPrev;
        const isLastInGroup = !sameSenderAsNext;

        // Resolve sender data for received messages (avatar + optional label)
        const sender = !isOwn ? participants[msg.sender_id] : undefined;
        const senderName = sender?.displayName ?? undefined;
        const senderPhotoUrl =
          !isOwn && isLastInGroup
            ? (sender?.profilePhotoUrl ?? null)
            : null;
        const showSenderLabel = showSenderInfo && !isOwn && isFirstInGroup;

        return (
          <div
            key={msg.id}
            className={isFirstInGroup && i > 0 ? "mt-3" : "mt-0.5"}
          >
            {showDate && <DateSeparator date={msg.created_at} />}
            <MessageBubble
              message={msg}
              isOwn={isOwn}
              isPending={"_pending" in msg && msg._pending === true}
              isFirstInGroup={isFirstInGroup}
              isLastInGroup={isLastInGroup}
              senderName={senderName}
              senderPhotoUrl={senderPhotoUrl}
              showAvatar={!isOwn}
              showSenderLabel={showSenderLabel}
            />
          </div>
        );
      })}
    </div>
  );
}
