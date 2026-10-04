/**
 * Instant go-live (jr_be 016 addendum, "optimistic go-live"): the shared
 * contract the mobile ladder codes against, and how it degrades against an
 * older backend (before migration 20261004100000).
 *
 * Source: packages/shared/src/api/location.ts, invite-rpc.ts,
 * constants/go-live.ts
 */
import { describe, expect, it, vi } from "vitest";
import {
  getLiveLocationDriftCheck,
  getMatchProximityRequired,
  logLocationEvent,
  reportGoLivePresence,
} from "./location";
import { isMissingRpcSignature, parsePresence } from "./invite-rpc";
import {
  GO_LIVE_TAG_MARGIN_MS,
  GO_LIVE_TAG_MAX_AGE_MS,
  haversineM,
  isDrifted,
  isGoLiveTagValid,
} from "../constants/go-live";
import {
  DRIFT_PROMPT_BODY,
  DRIFT_PROMPT_TITLE,
  GO_LIVE_LOCATION_DENIED_COPY,
  GO_LIVE_LOCATION_EXPLAIN_COPY,
  LOCATION_FIX_FAILED_GO_LIVE_CTA_COPY,
  PRECISE_LOCATION_COPY,
  SERVER_ENDED_LIVE_CTA_COPY,
} from "../utils/invite-copy";

const READING = { lat: 43.65, lng: -79.38, accuracyM: 20 };
const MISSING = { message: "Could not find the function", code: "PGRST202", hint: "Perhaps you meant ..." };

function rpcSequence(...results: { data: unknown; error: unknown }[]) {
  const rpc = vi.fn();
  for (const r of results) rpc.mockResolvedValueOnce(r);
  return { supabase: { rpc } as never, rpc };
}

describe("reportGoLivePresence with a capture time (rungs 2 and 3)", () => {
  it("without one: exactly the six arguments an older backend accepts", async () => {
    const { supabase, rpc } = rpcSequence({ data: { ok: true, verdict: "recorded" }, error: null });
    await reportGoLivePresence(supabase, READING);
    expect(rpc).toHaveBeenCalledWith("report_match_presence", {
      p_lat: 43.65,
      p_lng: -79.38,
      p_accuracy_m: 20,
      p_context: "go_live",
      p_challenge_id: null,
      p_invite_id: null,
    });
  });

  it("with one: p_captured_at as ISO", async () => {
    const { supabase, rpc } = rpcSequence({ data: { ok: true, verdict: "recorded" }, error: null });
    await reportGoLivePresence(supabase, READING, { capturedAt: Date.parse("2026-10-04T10:00:00.000Z") });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_captured_at: "2026-10-04T10:00:00.000Z" });
  });

  it("parses the new answer keys (captured_at, tag_valid_until) and the new refusal codes", async () => {
    const { supabase } = rpcSequence(
      {
        data: {
          ok: true,
          verdict: "recorded",
          captured_at: "2026-10-04T10:00:00Z",
          tag_valid_until: "2026-10-04T14:00:00Z",
        },
        error: null,
      },
      { data: { ok: false, code: "tag_too_old" }, error: null },
      { data: { ok: false, code: "captured_at_invalid" }, error: null },
    );
    const ok = await reportGoLivePresence(supabase, READING, { capturedAt: Date.now() });
    expect(ok).toMatchObject({
      ok: true,
      data: { ok: true, captured_at: "2026-10-04T10:00:00Z", tag_valid_until: "2026-10-04T14:00:00Z" },
    });
    expect(await reportGoLivePresence(supabase, READING, { capturedAt: Date.now() })).toEqual({
      ok: true,
      data: { ok: false, code: "tag_too_old" },
    });
    expect(await reportGoLivePresence(supabase, READING, { capturedAt: Date.now() })).toEqual({
      ok: true,
      data: { ok: false, code: "captured_at_invalid" },
    });
  });

  it("an older backend answers PGRST202 for p_captured_at: the code is kept so the caller can tell", async () => {
    const { supabase } = rpcSequence({ data: null, error: MISSING });
    const r = await reportGoLivePresence(supabase, READING, { capturedAt: Date.now() });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("PGRST202");
      expect(isMissingRpcSignature(r.error)).toBe(true);
    }
  });

  it("an older backend's ok answer has no captured_at (how the client learns it is legacy)", () => {
    expect(parsePresence({ ok: true, verdict: "recorded" })).not.toHaveProperty("captured_at");
  });

  it("a network error is not a missing signature", () => {
    expect(isMissingRpcSignature({ hint: "unknown", message: "offline" })).toBe(false);
  });
});

describe("logLocationEvent p_source (3.11)", () => {
  it("sends p_source for a go_live_attempt that has one", async () => {
    const { supabase, rpc } = rpcSequence({ data: { ok: true, logged: true }, error: null });
    await logLocationEvent(supabase, { event: "go_live_attempt", outcome: "ok", source: "device" });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_source: "device" });
  });

  it("never sends p_source for another event", async () => {
    const { supabase, rpc } = rpcSequence({ data: { ok: true, logged: true }, error: null });
    await logLocationEvent(supabase, { event: "drift_prompt", outcome: "retagged", source: "device" });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_source");
  });

  it("an older backend without p_source: logged once more without it, with an outcome its CHECK knows", async () => {
    const { supabase, rpc } = rpcSequence(
      { data: null, error: MISSING },
      { data: { ok: true, logged: true }, error: null },
    );
    const r = await logLocationEvent(supabase, { event: "go_live_attempt", outcome: "tag_too_old", source: "device" });
    expect(r).toEqual({ ok: true, data: { logged: true } });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).not.toHaveProperty("p_source");
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_outcome: "location_required" });
  });

  it("an ok outcome keeps its value on the fallback", async () => {
    const { supabase, rpc } = rpcSequence(
      { data: null, error: MISSING },
      { data: { ok: true, logged: true }, error: null },
    );
    await logLocationEvent(supabase, { event: "go_live_attempt", outcome: "ok", source: "os_cache" });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_outcome: "ok" });
  });
});

describe("the two new flags read off when the row is missing (older backend)", () => {
  function flagClient(data: unknown) {
    const eq = vi.fn(() => ({ maybeSingle: () => Promise.resolve({ data, error: null }) }));
    const from = vi.fn(() => ({ select: () => ({ eq }) }));
    return { supabase: { from } as never, eq };
  }

  it("match_proximity_required", async () => {
    const { supabase, eq } = flagClient(null);
    expect(await getMatchProximityRequired(supabase)).toEqual({ ok: true, data: false });
    expect(eq).toHaveBeenCalledWith("key", "match_proximity_required");
  });

  it("live_location_drift_check", async () => {
    const { supabase, eq } = flagClient({ enabled: true });
    expect(await getLiveLocationDriftCheck(supabase)).toEqual({ ok: true, data: true });
    expect(eq).toHaveBeenCalledWith("key", "live_location_drift_check");
  });
});

describe("tag validity on the device (4 h minus the 2 minute margin, 100 m)", () => {
  const NOW = Date.parse("2026-10-04T12:00:00Z");
  const edge = GO_LIVE_TAG_MAX_AGE_MS - GO_LIVE_TAG_MARGIN_MS;

  it.each([
    ["just captured", 0, 20, true],
    ["3 h 57 min", edge - 60_000, 20, true],
    ["at the margin", edge, 20, false],
    ["4 h old", GO_LIVE_TAG_MAX_AGE_MS, 20, false],
    ["100 m", 0, 100, true],
    ["101 m", 0, 101, false],
    ["a clock 10 min ahead", -10 * 60_000, 20, false],
  ])("%s", (_case, age, acc, valid) => {
    expect(isGoLiveTagValid({ capturedAt: NOW - age, accuracyM: acc }, NOW)).toBe(valid);
  });

  it("null is not a tag", () => {
    expect(isGoLiveTagValid(null, NOW)).toBe(false);
  });
});

describe("the drift rule (4.4): haversine minus LEAST(acc sum, 100) over 500 m", () => {
  const TAG = { lat: 43.65, lng: -79.38, accuracyM: 30 };
  // Metres north of the tag, as latitude.
  const north = (m: number, accuracyM: number) => ({ lat: TAG.lat + m / 111_195, lng: TAG.lng, accuracyM });

  it("haversine agrees with the latitude step", () => {
    expect(haversineM(TAG, north(1000, 0))).toBeCloseTo(1000, 0);
  });

  it("drifted at 501 m net of accuracy, not at 499 m", () => {
    // Accuracy sum 30 + 70 = 100 (the cap).
    expect(isDrifted(TAG, north(601, 70))).toBe(true);
    expect(isDrifted(TAG, north(599, 70))).toBe(false);
  });

  it("the allowance is capped at 100 m", () => {
    expect(isDrifted(TAG, north(601, 500))).toBe(true);
  });
});

describe("copy (UX 019, section 4, C3, C6, C7)", () => {
  it("drops the match-start claims, and adds the new toasts and the drift prompt", () => {
    expect(GO_LIVE_LOCATION_EXPLAIN_COPY).toBe(
      "ELO RATED uses your location to put you on the mat with athletes near you. We only check it when you go live.",
    );
    expect(GO_LIVE_LOCATION_DENIED_COPY).toBe("Location is off for ELO RATED. Turn it on in Settings to go live.");
    expect(PRECISE_LOCATION_COPY).toBe(
      "Settings > ELO RATED > Location > Precise Location. Already on? Move near a window or turn on Wi-Fi, then Retry.",
    );
    expect(LOCATION_FIX_FAILED_GO_LIVE_CTA_COPY).toBe("Couldn't find your location. Tap to go live again.");
    expect(SERVER_ENDED_LIVE_CTA_COPY).toBe("You're offline now. Tap to go live again.");
    expect(DRIFT_PROMPT_TITLE).toBe("Still on the same mat?");
    expect(DRIFT_PROMPT_BODY).toBe(
      "You've moved since you went live. Update your location so people nearby can find you.",
    );
  });

  it("no em dash anywhere in the new copy", () => {
    for (const c of [
      GO_LIVE_LOCATION_EXPLAIN_COPY,
      GO_LIVE_LOCATION_DENIED_COPY,
      PRECISE_LOCATION_COPY,
      LOCATION_FIX_FAILED_GO_LIVE_CTA_COPY,
      SERVER_ENDED_LIVE_CTA_COPY,
      DRIFT_PROMPT_TITLE,
      DRIFT_PROMPT_BODY,
    ]) {
      expect(c).not.toContain(String.fromCharCode(0x2014));
    }
  });
});
