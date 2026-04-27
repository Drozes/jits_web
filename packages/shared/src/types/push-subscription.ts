import { Tables, TablesInsert } from "./database";

export type PushSubscription = Tables<"push_subscriptions">;
export type PushSubscriptionInsert = TablesInsert<"push_subscriptions">;
