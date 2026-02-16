import { Tables, TablesInsert } from "./database";

export type Conversation = Tables<"conversations">;
export type ConversationInsert = TablesInsert<"conversations">;

export type ConversationParticipant = Tables<"conversation_participants">;
export type ConversationParticipantInsert =
  TablesInsert<"conversation_participants">;
