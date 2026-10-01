/**
 * M5: the web location layer goes through `@jits/shared` (the same flag read,
 * presence wrappers and copy as mobile); only the browser reading is local.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const shared = vi.hoisted(() => ({
  getMatchLocationRequired: vi.fn(),
  reportGoLivePresence: vi.fn(),
  reportArenaPresence: vi.fn(),
}));
vi.mock("@jits/shared/api/location", () => shared);

import * as utils from "@jits/shared/utils";
import {
  GO_LIVE_DENIED_COPY,
  LOCATION_ACCURACY_COPY,
  LOCATION_DENIED_COPY,
  LOCATION_DENIED_HELP_COPY,
  LOCATION_EXPLAIN_COPY,
  LOCATION_IMPLAUSIBLE_COPY,
  LOCATION_SELF_MISSING_COPY,
  proximityCopy,
  readMatchLocationRequired,
  reportMatchPresence,
  waitingForLocationCopy,
} from "./match-location";

const client = {} as Parameters<typeof readMatchLocationRequired>[0];
const reading = { lat: 43.65, lng: -79.38, accuracy: 12 };
const RECORDED = { ok: true, data: { ok: true, verdict: "recorded", started: false, match_id: null } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("web location goes through the shared layer", () => {
  it("the flag read is getMatchLocationRequired; a failed read is false", async () => {
    shared.getMatchLocationRequired.mockResolvedValueOnce({ ok: true, data: true });
    expect(await readMatchLocationRequired(client)).toBe(true);
    shared.getMatchLocationRequired.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    expect(await readMatchLocationRequired(client)).toBe(false);
    expect(shared.getMatchLocationRequired).toHaveBeenCalledWith(client);
  });

  it("go_live reports through reportGoLivePresence with the shared reading shape", async () => {
    shared.reportGoLivePresence.mockResolvedValue(RECORDED);
    expect(await reportMatchPresence(client, reading, "go_live")).toEqual({ ok: true });
    expect(shared.reportGoLivePresence).toHaveBeenCalledWith(client, { lat: 43.65, lng: -79.38, accuracyM: 12 });
    expect(shared.reportArenaPresence).not.toHaveBeenCalled();
  });

  it("arena reports through reportArenaPresence for the challenge", async () => {
    shared.reportArenaPresence.mockResolvedValue(RECORDED);
    expect(await reportMatchPresence(client, reading, "arena", "c1")).toEqual({ ok: true });
    expect(shared.reportArenaPresence).toHaveBeenCalledWith(client, { lat: 43.65, lng: -79.38, accuracyM: 12 }, "c1");
  });

  it("maps a refusal body and a raised HINT", async () => {
    shared.reportArenaPresence.mockResolvedValueOnce({ ok: true, data: { ok: false, code: "accuracy_too_low" } });
    expect(await reportMatchPresence(client, reading, "arena", "c1")).toEqual({ ok: false, code: "accuracy_too_low" });
    shared.reportArenaPresence.mockResolvedValueOnce({ ok: false, error: { hint: "not_participant", message: "x" } });
    expect(await reportMatchPresence(client, reading, "arena", "c1")).toEqual({
      ok: false,
      code: "error",
      hint: "not_participant",
    });
    shared.reportArenaPresence.mockResolvedValueOnce({ ok: false, error: { hint: "unknown", message: "net" } });
    expect(await reportMatchPresence(client, reading, "arena", "c1")).toEqual({ ok: false, code: "error", hint: null });
  });
});

describe("web copy is the shared copy", () => {
  it("every location line is the shared constant (no drift), plus the web-only browser line", () => {
    expect(LOCATION_EXPLAIN_COPY).toBe(utils.GO_LIVE_LOCATION_EXPLAIN_COPY);
    expect(LOCATION_DENIED_COPY).toBe(utils.LOCATION_DENIED_COPY);
    expect(GO_LIVE_DENIED_COPY).toBe(utils.GO_LIVE_LOCATION_DENIED_COPY);
    expect(LOCATION_ACCURACY_COPY).toBe(utils.GO_LIVE_ACCURACY_COPY);
    expect(LOCATION_IMPLAUSIBLE_COPY).toBe(utils.IMPLAUSIBLE_MOVEMENT_COPY);
    expect(LOCATION_SELF_MISSING_COPY).toBe(utils.ARENA_SELF_LOCATION_MISSING_COPY);
    expect(proximityCopy("Ana")).toBe(utils.arenaProximityMessage("Ana"));
    expect(waitingForLocationCopy("Ana")).toBe("Waiting for Ana's location.");
    expect(LOCATION_DENIED_HELP_COPY).toBe("Allow location for this site in your browser settings, then try again.");
  });
});
