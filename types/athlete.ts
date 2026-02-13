import { Tables, TablesInsert, TablesUpdate } from "./database";

export type Athlete = Tables<"athletes">;
export type AthleteInsert = TablesInsert<"athletes">;
export type AthleteUpdate = TablesUpdate<"athletes">;
