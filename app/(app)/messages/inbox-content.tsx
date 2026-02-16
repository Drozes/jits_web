"use client";

import { MessageSquare } from "lucide-react";
import type { ConversationRow } from "@/lib/api/chat-queries";
import { ConversationCard } from "@/components/domain/conversation-card";

interface InboxContentProps {
  conversations: ConversationRow[];
}

export function InboxContent({ conversations }: InboxContentProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-1">No conversations yet</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Challenge someone or visit their profile to start chatting!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-bold mb-2">Messages</h1>
      {conversations.map((conv) => (
        <ConversationCard key={conv.conversation_id} conversation={conv} />
      ))}
    </div>
  );
}
