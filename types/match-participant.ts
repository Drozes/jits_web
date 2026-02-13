import { Tables, TablesInsert, TablesUpdate } from "./database";

export type MatchParticipant = Tables<"match_participants">;
export type MatchParticipantInsert = TablesInsert<"match_participants">;
export type MatchParticipantUpdate = TablesUpdate<"match_participants">;
