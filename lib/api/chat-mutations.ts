import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Message } from "@/types/message";
import { type Result, mapPostgrestError, mapRpcError } from "./errors";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

interface CreateConversationResponse {
  conversation_id: string;
  already_exists: boolean;
}

/** Create or return an existing direct conversation with another athlete */
export async function createDirectConversation(
  supabase: Client,
  otherAthleteId: string,
): Promise<Result<CreateConversationResponse>> {
  const { data, error } = await supabase.rpc("create_direct_conversation", {
    p_other_athlete_id: otherAthleteId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  const response = data as unknown as
    | CreateConversationResponse
    | { success: boolean; error?: string };

  if ("success" in response && !response.success) {
    return { ok: false, error: mapRpcError(response as { success: boolean; error?: string }) };
  }

  return { ok: true, data: response as CreateConversationResponse };
}

/** Mark a conversation as read (updates last_read_at to now) */
export async function markConversationRead(
  supabase: Client,
  conversationId: string,
): Promise<Result<void>> {
  const { data, error } = await supabase.rpc("mark_conversation_read", {
    p_conversation_id: conversationId,
  });

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  const response = data as unknown as { success?: boolean; error?: string };
  if (response && "success" in response && !response.success) {
    return { ok: false, error: mapRpcError(response as { success: boolean; error?: string }) };
  }

  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

interface SendMessageParams {
  conversationId: string;
  body: string;
  clientId?: string; // Client-generated UUID for optimistic updates
}

/** Send a text message. Returns the inserted message row. */
export async function sendMessage(
  supabase: Client,
  params: SendMessageParams,
): Promise<Result<Message>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Look up the athlete_id for the current user
  const { data: athlete } = await supabase
    .from("athletes")
    .select("id")
    .eq("id", user!.id)
    .single();

  if (!athlete) {
    return {
      ok: false,
      error: { code: "SEND_REQUIRES_ACTIVE", message: "No active athlete profile" },
    };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      id: params.clientId,
      conversation_id: params.conversationId,
      sender_id: athlete.id,
      body: params.body,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, error: mapPostgrestError(error) };
  }

  return { ok: true, data: data as Message };
}
