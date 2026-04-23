import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Message } from "@/types/message";

type Client = SupabaseClient<Database>;

/** Row shape returned by the get_conversations RPC */
export type ConversationRow =
  Database["public"]["Functions"]["get_conversations"]["Returns"][number];

/** Row shape returned by the get_unread_counts RPC */
export type UnreadCountRow =
  Database["public"]["Functions"]["get_unread_counts"]["Returns"][number];

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/** Fetch all conversations with last message preview and unread counts */
export async function getConversations(
  supabase: Client,
): Promise<ConversationRow[]> {
  const { data, error } = await supabase.rpc("get_conversations");
  if (error) {
    console.error("getConversations:", error);
    return [];
  }
  return (data as ConversationRow[]) ?? [];
}

/** Fetch unread counts for conversations that have unread messages */
export async function getUnreadCounts(
  supabase: Client,
): Promise<UnreadCountRow[]> {
  const { data, error } = await supabase.rpc("get_unread_counts");
  if (error) {
    console.error("getUnreadCounts:", error);
    return [];
  }
  return (data as UnreadCountRow[]) ?? [];
}

// ---------------------------------------------------------------------------
// Messages (direct query, not RPC — for thread pagination)
// ---------------------------------------------------------------------------

/** Fetch messages for a conversation, newest first, with cursor-based pagination */
export async function getMessages(
  supabase: Client,
  conversationId: string,
  opts?: { before?: string; limit?: number },
): Promise<Message[]> {
  const limit = opts?.limit ?? 50;

  let query = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts?.before) {
    query = query.lt("created_at", opts.before);
  }

  const { data, error } = await query;
  if (error) {
    console.error("getMessages:", error);
    return [];
  }
  return (data as Message[]) ?? [];
}
