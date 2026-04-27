import { Tables, TablesInsert, TablesUpdate } from "./database";

export type Challenge = Tables<"challenges">;
export type ChallengeInsert = TablesInsert<"challenges">;
export type ChallengeUpdate = TablesUpdate<"challenges">;
