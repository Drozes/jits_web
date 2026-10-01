import { describe, expect, it, vi } from "vitest";
import {
  getArenaNearby,
  getMatchLocationRequired,
  parseArenaNearby,
  parseStartInviteBooking,
  reportBrowsePresence,
  reportArenaPresence,
  reportGoLivePresence,
  startInviteBooking,
} from "./location";
import { mapPostgrestError } from "./errors";
import {
  BOOKED_STRIP_MAX_CHARS,
  START_AVAILABLE_COPY,
  START_AVAILABLE_STRIP_COPY,
  ARENA_SELF_LOCATION_MISSING_COPY,
  arenaProximityCopy,
  arenaProximityMessage,
  arenaProximityTitle,
  bookedMessage,
  bookedStripMessage,
  startBookingErrorView,
} from "../utils/invite-copy";

const DASH = String.fromCharCode(0x2014);

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { supabase: { rpc } as never, rpc };
}

function flagClient(result: { data: unknown; error: unknown } | Error) {
  const eq = vi.fn(() => ({
    maybeSingle: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
  }));
  const from = vi.fn(() => ({ select: () => ({ eq }) }));
  return { supabase: { from } as never, from, eq };
}

const READING = { lat: 43.6, lng: -79.4, accuracyM: 20 };

describe("getMatchLocationRequired", () => {
  it("reads the flag row", async () => {
    const { supabase, from, eq } = flagClient({ data: { enabled: true }, error: null });
    expect(await getMatchLocationRequired(supabase)).toEqual({ ok: true, data: true });
    expect(from).toHaveBeenCalledWith("feature_flags");
    expect(eq).toHaveBeenCalledWith("key", "match_location_required");
  });

  it("a missing row is off", async () => {
    const { supabase } = flagClient({ data: null, error: null });
    expect(await getMatchLocationRequired(supabase)).toEqual({ ok: true, data: false });
  });

  it("a failed read is an error, never a silent false", async () => {
    const { supabase } = flagClient({ data: null, error: { message: "offline", code: "x" } });
    const res = await getMatchLocationRequired(supabase);
    expect(res.ok).toBe(false);
  });

  it("a thrown read is an error too", async () => {
    const { supabase } = flagClient(new Error("boom"));
    const res = await getMatchLocationRequired(supabase);
    expect(res).toEqual({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
  });
});

describe("report_match_presence contexts", () => {
  it("go_live sends no scope and reads the recorded verdict", async () => {
    const { supabase, rpc } = rpcClient({
      data: { ok: true, verdict: "recorded", started: false, match_id: null },
      error: null,
    });
    const res = await reportGoLivePresence(supabase, READING);
    expect(rpc).toHaveBeenCalledWith("report_match_presence", {
      p_lat: 43.6,
      p_lng: -79.4,
      p_accuracy_m: 20,
      p_context: "go_live",
      p_challenge_id: null,
      p_invite_id: null,
    });
    expect(res.ok && res.data.ok && res.data.verdict).toBe("recorded");
  });

  it("go_live accuracy_too_low is a returned code", async () => {
    const { supabase } = rpcClient({ data: { ok: false, code: "accuracy_too_low" }, error: null });
    const res = await reportGoLivePresence(supabase, READING);
    expect(res.ok && !res.data.ok && res.data.code).toBe("accuracy_too_low");
  });

  it("arena is scoped to the challenge", async () => {
    const { supabase, rpc } = rpcClient({
      data: { ok: true, verdict: "waiting", started: false, match_id: null },
      error: null,
    });
    await reportArenaPresence(supabase, READING, "c1");
    expect(rpc).toHaveBeenCalledWith(
      "report_match_presence",
      expect.objectContaining({ p_context: "arena", p_challenge_id: "c1", p_invite_id: null }),
    );
  });

  it("a RAISE keeps its hint", async () => {
    const { supabase } = rpcClient({ data: null, error: { message: "no", hint: "not_participant" } });
    const res = await reportArenaPresence(supabase, READING, "c1");
    expect(res).toEqual({ ok: false, error: { hint: "not_participant", message: "no" } });
  });
});

describe("startInviteBooking", () => {
  it("returns the match id", async () => {
    const { supabase, rpc } = rpcClient({ data: { ok: true, match_id: "m1" }, error: null });
    const res = await startInviteBooking(supabase, "c1");
    expect(rpc).toHaveBeenCalledWith("start_invite_booking", { p_challenge_id: "c1" });
    expect(res).toEqual({ ok: true, data: { ok: true, match_id: "m1" } });
  });

  it.each(["location_required", "inviter_busy", "claimer_busy", "booking_closed", "inviter_weekly_cap"])(
    "returns the %s code",
    async (code) => {
      const { supabase } = rpcClient({ data: { ok: false, code }, error: null });
      expect(await startInviteBooking(supabase, "c1")).toEqual({ ok: true, data: { ok: false, code } });
    },
  );

  it("a missing RPC (old stack) is rpc_missing, not a crash", async () => {
    const { supabase } = rpcClient({ data: null, error: { message: "nope", code: "PGRST202" } });
    const res = await startInviteBooking(supabase, "c1");
    expect(res).toEqual({ ok: false, error: { hint: "rpc_missing", message: "nope" } });
  });

  it("an ok answer without a match id is malformed", () => {
    expect(parseStartInviteBooking({ ok: true })).toBeNull();
    expect(parseStartInviteBooking("x")).toBeNull();
  });
});

describe("location hints", () => {
  it.each([
    ["location_required", "LOCATION_REQUIRED"],
    ["proximity_required", "PROXIMITY_REQUIRED"],
    ["proximity_failed", "PROXIMITY_FAILED"],
  ])("maps %s", (hint, code) => {
    expect(mapPostgrestError({ message: "x", hint, code: "P0001", details: "" } as never).code).toBe(code);
  });
});

describe("location copy", () => {
  it("start_available reads as the Start match line", () => {
    expect(bookedMessage("start_available", "Alex")).toBe(START_AVAILABLE_COPY);
    expect(bookedStripMessage("start_available", "Alex")).toBe(START_AVAILABLE_STRIP_COPY);
    expect(START_AVAILABLE_STRIP_COPY.length).toBeLessThanOrEqual(BOOKED_STRIP_MAX_CHARS);
  });

  it("names the opponent for a proximity refusal", () => {
    expect(arenaProximityMessage("ALEX")).toBe("You need to be on the same mat as ALEX to start.");
    expect(arenaProximityMessage(null)).toBe("You need to be on the same mat as your opponent to start.");
  });

  it.each([
    ["inviter_busy", "inviter", "Finish your match first."],
    ["inviter_busy", "invitee", "Alex is mid-match. We'll hold your spot."],
    ["claimer_busy", "invitee", "Finish your match first."],
    ["claimer_busy", "inviter", "Alex is mid-match. We'll hold your spot."],
    ["inviter_weekly_cap", "inviter", "No invite matches left this week."],
    ["inviter_weekly_cap", "invitee", "No invite matches left this week."],
    ["booking_closed", "invitee", "This booking was cancelled."],
    ["location_required", "invitee", "Location needed to start. Try again."],
    ["mystery", "invitee", "Couldn't start. Try again."],
  ] as const)("%s as %s", (code, role, short) => {
    const view = startBookingErrorView(code, { role, opponentName: "Alex" });
    expect(view.short).toBe(short);
    expect(view.short.length).toBeLessThanOrEqual(BOOKED_STRIP_MAX_CHARS);
    expect(view.full.includes(DASH)).toBe(false);
    expect(Boolean(view.closed)).toBe(code === "booking_closed");
  });

  it("the weekly cap names whose cap it is", () => {
    expect(startBookingErrorView("inviter_weekly_cap", { role: "invitee", opponentName: "Alex" }).full).toMatch(
      /^Alex has played/,
    );
    expect(startBookingErrorView("inviter_weekly_cap", { role: "inviter", opponentName: "Alex" }).full).toMatch(
      /^You've played/,
    );
  });
});

describe("arena presence replies carry no verdict or distance", () => {
  it("reportArenaPresence parses the privacy reply as recorded", async () => {
    const { supabase } = rpcClient({
      data: { ok: true, verdict: "recorded", started: false, match_id: null },
      error: null,
    });
    const res = await reportArenaPresence(supabase, READING, "ch-1");
    expect(res).toEqual({
      ok: true,
      data: {
        ok: true,
        verdict: "recorded",
        reason: null,
        distance_m: null,
        started: false,
        match_id: null,
        start_blocked_reason: null,
      },
    });
  });

  it("reportBrowsePresence sends the browse context with no scope", async () => {
    const { supabase, rpc } = rpcClient({ data: { ok: true, verdict: "recorded", started: false, match_id: null }, error: null });
    await reportBrowsePresence(supabase, READING);
    expect(rpc).toHaveBeenCalledWith("report_match_presence", {
      p_lat: 43.6,
      p_lng: -79.4,
      p_accuracy_m: 20,
      p_context: "browse",
      p_challenge_id: null,
      p_invite_id: null,
    });
  });

  it("reportBrowsePresence passes a refusal through as data (implausible speed, rate limit)", async () => {
    const { supabase } = rpcClient({ data: { ok: false, code: "implausible_movement" }, error: null });
    expect(await reportBrowsePresence(supabase, READING)).toEqual({ ok: true, data: { ok: false, code: "implausible_movement" } });
  });
});

describe("getArenaNearby", () => {
  it("parses nearby mode with both lists", async () => {
    const { supabase, rpc } = rpcClient({
      data: {
        ok: true,
        mode: "nearby",
        on_the_mat: [{ athlete_id: "a-1", distance_band: "on_the_mat" }],
        close: [
          { athlete_id: "a-2", distance_band: "under_500m" },
          { athlete_id: "a-3", distance_band: "under_2km" },
        ],
      },
      error: null,
    });
    expect(await getArenaNearby(supabase)).toEqual({
      ok: true,
      data: {
        mode: "nearby",
        onTheMat: ["a-1"],
        close: [
          { athleteId: "a-2", band: "under_500m" },
          { athleteId: "a-3", band: "under_2km" },
        ],
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_arena_nearby", {});
  });

  it.each(["flag_off", "no_location"])("parses %s with empty lists", (mode) => {
    expect(parseArenaNearby({ ok: true, mode, on_the_mat: [], close: [] })).toEqual({ mode, onTheMat: [], close: [] });
  });

  it("drops rows with an unknown band and refuses unknown shapes", () => {
    expect(
      parseArenaNearby({ ok: true, mode: "nearby", on_the_mat: [], close: [{ athlete_id: "a", distance_band: "under_5km" }] }),
    ).toEqual({ mode: "nearby", onTheMat: [], close: [] });
    expect(parseArenaNearby({ ok: false, code: "not_active" })).toBeNull();
    expect(parseArenaNearby({ ok: true, mode: "weird" })).toBeNull();
    expect(parseArenaNearby(null)).toBeNull();
  });

  it("a RAISE is an error, never a mode", async () => {
    const { supabase } = rpcClient({ data: null, error: { message: "nope", code: "PGRST202" } });
    const res = await getArenaNearby(supabase);
    expect(res.ok).toBe(false);
  });
});

describe("arenaProximityCopy", () => {
  it.each([
    ["challenger", "challenger", ARENA_SELF_LOCATION_MISSING_COPY],
    ["opponent", "opponent", ARENA_SELF_LOCATION_MISSING_COPY],
    ["challenger", "opponent", "Waiting for ALEX's location."],
    ["opponent", "challenger", "Waiting for ALEX's location."],
    ["both", "opponent", "You need to be on the same mat as ALEX to start."],
    [null, "opponent", "You need to be on the same mat as ALEX to start."],
  ] as const)("DETAIL %s seen by the %s", (detail, selfRole, copy) => {
    expect(arenaProximityCopy({ hint: "proximity_required", detail, selfRole, opponentName: "ALEX" })).toBe(copy);
  });

  it("proximity_failed is always the same-mat copy", () => {
    expect(arenaProximityCopy({ hint: "proximity_failed", detail: "opponent", selfRole: "opponent", opponentName: "ALEX" })).toBe(
      "You need to be on the same mat as ALEX to start.",
    );
  });
});

describe("booking_closed start-blocked reason", () => {
  it("reads as the closed-booking copy on the full and strip lines", () => {
    expect(bookedMessage("booking_closed", "Alex")).toBe("This booking was cancelled.");
    expect(bookedStripMessage("booking_closed", "Alex")).toBe("This booking was cancelled.");
  });
});

describe("arenaProximityTitle (matches the message)", () => {
  it.each([
    ["opponent", "opponent", "Location needed"],
    ["challenger", "challenger", "Location needed"],
    ["challenger", "opponent", "Waiting for ALEX"],
    ["opponent", "challenger", "Waiting for ALEX"],
    ["both", "opponent", "Not on the same mat"],
    [null, "opponent", "Not on the same mat"],
  ] as const)("DETAIL %s seen by the %s", (detail, selfRole, title) => {
    expect(arenaProximityTitle({ hint: "proximity_required", detail, selfRole, opponentName: "ALEX" })).toBe(title);
  });

  it("proximity_failed is always Not on the same mat; a missing name says your opponent", () => {
    expect(
      arenaProximityTitle({ hint: "proximity_failed", detail: "opponent", selfRole: "opponent", opponentName: "ALEX" }),
    ).toBe("Not on the same mat");
    expect(
      arenaProximityTitle({ hint: "proximity_required", detail: "challenger", selfRole: "opponent", opponentName: " " }),
    ).toBe("Waiting for your opponent");
  });
});
