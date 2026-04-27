import { Tables, TablesInsert, TablesUpdate } from "./database";

export type Gym = Tables<"gyms">;
export type GymInsert = TablesInsert<"gyms">;
export type GymUpdate = TablesUpdate<"gyms">;
