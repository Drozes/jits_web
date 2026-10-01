/**
 * Friends (jr_be spec 016, contract 3.5, 4.16, 4.17). Friendships are created
 * by the server only (accepting an invite); clients list and remove them.
 * Results never throw; a failure is `{ ok:false, error }`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type Client = SupabaseClient<Database>;

export interface FriendCard {
  athlete_id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  current_elo: number;
  current_weight: number | null;
  is_live: boolean;
  friends_since: string;
  source: string;
}

export type FriendsResult<T> = { ok: true; data: T } | { ok: false; error: { hint: string; message: string } };

type RawError = { message?: string; hint?: string | null } | null;

async function call(supabase: Client, fn: string, args: Record<string, unknown>) {
  const rpc = supabase.rpc as unknown as (
    f: string,
    a: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RawError }>;
  return rpc.call(supabase, fn, args);
}

/** Keep only well-formed cards, live first then by name (the server order). */
export function parseFriends(data: unknown): FriendCard[] | null {
  if (data == null) return [];
  if (!Array.isArray(data)) return null;
  const out: FriendCard[] = [];
  for (const raw of data as Record<string, unknown>[]) {
    if (!raw || typeof raw.athlete_id !== "string") continue;
    out.push({
      athlete_id: raw.athlete_id,
      display_name: typeof raw.display_name === "string" ? raw.display_name : "",
      first_name: typeof raw.first_name === "string" ? raw.first_name : null,
      last_name: typeof raw.last_name === "string" ? raw.last_name : null,
      avatar_url: typeof raw.avatar_url === "string" ? raw.avatar_url : null,
      current_elo: typeof raw.current_elo === "number" ? raw.current_elo : 0,
      current_weight: typeof raw.current_weight === "number" ? raw.current_weight : null,
      is_live: raw.is_live === true,
      friends_since: typeof raw.friends_since === "string" ? raw.friends_since : "",
      source: typeof raw.source === "string" ? raw.source : "",
    });
  }
  return out.sort(
    (a, b) => Number(b.is_live) - Number(a.is_live) || a.display_name.localeCompare(b.display_name),
  );
}

export async function getMyFriends(supabase: Client): Promise<FriendsResult<FriendCard[]>> {
  try {
    const { data, error } = await call(supabase, "get_my_friends", {});
    if (error) return { ok: false, error: { hint: error.hint || "unknown", message: error.message ?? "" } };
    const friends = parseFriends(data);
    if (!friends) return { ok: false, error: { hint: "unknown", message: "Unexpected friends response." } };
    return { ok: true, data: friends };
  } catch (err) {
    return { ok: false, error: { hint: "unknown", message: err instanceof Error ? err.message : String(err) } };
  }
}

export async function removeFriend(supabase: Client, athleteId: string): Promise<FriendsResult<{ removed: boolean }>> {
  try {
    const { data, error } = await call(supabase, "remove_friend", { p_athlete_id: athleteId });
    if (error) return { ok: false, error: { hint: error.hint || "unknown", message: error.message ?? "" } };
    return { ok: true, data: { removed: (data as { removed?: boolean } | null)?.removed === true } };
  } catch (err) {
    return { ok: false, error: { hint: "unknown", message: err instanceof Error ? err.message : String(err) } };
  }
}

/** The set of friend ids, for Arena badges and sorting. */
export async function getMyFriendIds(supabase: Client): Promise<Set<string>> {
  const res = await getMyFriends(supabase);
  return new Set(res.ok ? res.data.map((f) => f.athlete_id) : []);
}

/**
 * Friends first, keeping the incoming order otherwise (a stable partition),
 * so the Arena's own ordering still holds within each group.
 */
export function sortFriendsFirst<T>(items: readonly T[], idOf: (t: T) => string, friendIds: ReadonlySet<string>): T[] {
  if (friendIds.size === 0) return [...items];
  const friends: T[] = [];
  const rest: T[] = [];
  for (const item of items) (friendIds.has(idOf(item)) ? friends : rest).push(item);
  return [...friends, ...rest];
}

// ---------------------------------------------------------------------------
// "Friends on the mat" notification toggle (`notification_preferences.enable_friends`,
// contract 3.9). Absent row or column reads as on. Untyped until database.ts
// is regenerated against the 20261001* migrations.

type LooseTable = {
  select: (cols: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: RawError }> };
  upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => PromiseLike<{ error: RawError }>;
};
const prefsTable = (supabase: Client) =>
  (supabase.from as unknown as (t: string) => LooseTable).call(supabase, "notification_preferences");

export async function getFriendsNotificationsEnabled(supabase: Client): Promise<boolean> {
  try {
    const { data, error } = await prefsTable(supabase).select("enable_friends").maybeSingle();
    if (error || !data) return true;
    return (data as { enable_friends?: boolean }).enable_friends !== false;
  } catch {
    return true;
  }
}

export async function setFriendsNotificationsEnabled(
  supabase: Client,
  athleteId: string,
  enabled: boolean,
): Promise<FriendsResult<void>> {
  try {
    const { error } = await prefsTable(supabase).upsert(
      { athlete_id: athleteId, enable_friends: enabled },
      { onConflict: "athlete_id" },
    );
    if (error) return { ok: false, error: { hint: error.hint || "unknown", message: error.message ?? "" } };
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: { hint: "unknown", message: err instanceof Error ? err.message : String(err) } };
  }
}
