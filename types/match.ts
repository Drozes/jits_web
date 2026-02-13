import { Tables, TablesInsert, TablesUpdate } from "./database";

export type Match = Tables<"matches">;
export type MatchInsert = TablesInsert<"matches">;
export type MatchUpdate = TablesUpdate<"matches">;
