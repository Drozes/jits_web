/**
 * getMatchDetails (queries.ts) and the timekeeper-mode keys of
 * `get_match_details` (BE-G, jr_be 024 5.1; jits_web ARCHITECTURE 2.6): the
 * `match` object's keys pass through, the two top-level keys (`viewer_role`,
 * `timekeeper`) join the match only when the backend sends them, and an
 * older backend's payload maps exactly as before.
 *
 * getMatchDetailsWithConfirmations: the same read plus its top-level
 * `confirmations`, the only place the seated timekeeper can see the athletes'
 * confirmations (the `match_confirmations` RLS admits participants only, and
 * the timekeeper is never one; spec 4.4).
 */
import { describe, it, expect, vi } from "vitest";
import { getMatchDetails, getMatchDetailsWithConfirmations } from "./queries";

function rpcClient(data: unknown, error: unknown = null) {
  const rpc = vi.fn(() => Promise.resolve({ data, error }));
  return { client: { rpc } as never, rpc };
}

const MATCH = {
  id: "M1",
  challenge_id: "C1",
  session_id: null,
  match_type: "ranked",
  duration_seconds: 300,
  status: "pending",
  result: null,
  started_at: null,
  completed_at: null,
  paused_at: null,
  total_paused_duration: 0,
  timekeeper_id: null,
};
const PARTICIPANTS = [{ athlete_id: "a", display_name: "Mina Park" }];

describe("getMatchDetails", () => {
  it("an older backend: the match and its participants, nothing added", async () => {
    const { client, rpc } = rpcClient({ match: MATCH, participants: PARTICIPANTS, videos: [], confirmations: [] });
    const m = await getMatchDetails(client, "M1");
    expect(rpc).toHaveBeenCalledWith("get_match_details", { p_match_id: "M1" });
    expect(m).toStrictEqual({ ...MATCH, participants: PARTICIPANTS });
    expect(m && "viewer_role" in m).toBe(false);
    expect(m && "timekeeper" in m).toBe(false);
  });

  it("a timekeeper-mode match: the new match keys pass through, the top-level ones join it", async () => {
    const tk = {
      ...MATCH,
      requires_timekeeper: true,
      tk_weight_check_required: true,
      challenger_id: "a",
      ended_at: null,
      final_elapsed_s: null,
      timekeeper_deadline_at: "2026-10-20T10:10:00Z",
      cancel_reason: null,
      result_edit_count: 0,
      result_edited_at: null,
      result_recorded_by_admin: false,
      timekeeper_id: "c",
    };
    const timekeeper = { id: "c", display_name: "Jo Cruz", profile_photo_url: null };
    const { client } = rpcClient({ viewer_role: "challenger", timekeeper, match: tk, participants: PARTICIPANTS });
    expect(await getMatchDetails(client, "M1")).toStrictEqual({
      ...tk,
      participants: PARTICIPANTS,
      viewer_role: "challenger",
      timekeeper,
    });
  });

  it("a flag-OFF match on the new backend: false / null keys, a null timekeeper", async () => {
    const { client } = rpcClient({
      viewer_role: "opponent",
      timekeeper: null,
      match: { ...MATCH, requires_timekeeper: false },
      participants: PARTICIPANTS,
    });
    const m = await getMatchDetails(client, "M1");
    expect(m?.requires_timekeeper).toBe(false);
    expect(m?.viewer_role).toBe("opponent");
    expect(m?.timekeeper).toBeNull();
  });

  it("is null on an error or an empty read", async () => {
    expect(await getMatchDetails(rpcClient(null, { message: "not_participant" }).client, "M1")).toBeNull();
    expect(await getMatchDetails(rpcClient(null).client, "M1")).toBeNull();
  });
});

describe("getMatchDetailsWithConfirmations", () => {
  const CONFIRMED = [{ athlete_id: "a", confirmed_at: "2026-10-20T19:23:49.151103+00:00" }];

  it("makes the one get_match_details call and hands back getMatchDetails' match with the confirmations", async () => {
    const payload = { viewer_role: "timekeeper", timekeeper: null, match: MATCH, participants: PARTICIPANTS, videos: [], confirmations: CONFIRMED };
    const { client, rpc } = rpcClient(payload);
    const read = await getMatchDetailsWithConfirmations(client, "M1");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_match_details", { p_match_id: "M1" });
    expect(read).toStrictEqual({ match: await getMatchDetails(rpcClient(payload).client, "M1"), confirmations: CONFIRMED });
    // The confirmations never join the match itself (getMatchDetails is unchanged).
    expect(read && "confirmations" in read.match).toBe(false);
  });

  it("an empty array is 'nobody confirmed'", async () => {
    const { client } = rpcClient({ match: MATCH, participants: PARTICIPANTS, confirmations: [] });
    expect((await getMatchDetailsWithConfirmations(client, "M1"))?.confirmations).toEqual([]);
  });

  it("no confirmations array is unknown (null), not 'nobody confirmed'", async () => {
    for (const confirmations of [undefined, null, "x", { athlete_id: "a" }]) {
      const { client } = rpcClient({ match: MATCH, participants: PARTICIPANTS, confirmations });
      expect((await getMatchDetailsWithConfirmations(client, "M1"))?.confirmations).toBeNull();
    }
  });

  it("drops an entry with no athlete id, and reads a missing time as empty", async () => {
    const { client } = rpcClient({
      match: MATCH,
      participants: PARTICIPANTS,
      confirmations: [null, { confirmed_at: "T" }, { athlete_id: 7 }, { athlete_id: "b" }, ...CONFIRMED],
    });
    expect((await getMatchDetailsWithConfirmations(client, "M1"))?.confirmations).toEqual([
      { athlete_id: "b", confirmed_at: "" },
      ...CONFIRMED,
    ]);
  });

  it("is null on an error or an empty read", async () => {
    expect(await getMatchDetailsWithConfirmations(rpcClient(null, { message: "not_participant" }).client, "M1")).toBeNull();
    expect(await getMatchDetailsWithConfirmations(rpcClient(null).client, "M1")).toBeNull();
  });
});
