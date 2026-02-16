import { Tables, TablesInsert } from "./database";

export type Message = Tables<"messages">;
export type MessageInsert = TablesInsert<"messages">;
