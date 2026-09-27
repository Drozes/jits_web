import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getHighlightProgress,
  regenerateHighlight,
  retryHighlightRender,
  signHighlightPlayback,
  submitHighlightFeedback,
  toHighlightProgress,
  type HighlightPhase,
  type RawHighlightProgress,
} from "./highlights";
import { HIGHLIGHT_FEEDBACK_CHIPS, HIGHLIGHT_FREE_TEXT_MAX } from "../constants/highlights";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VIDEO = "11111111-1111-4111-8111-111111111111";
const HL = "22222222-2222-4222-8222-222222222222";

function raw(over: Partial<RawHighlightProgress> = {}): RawHighlightProgress {
  return {
    match_video_id: VIDEO,
    athlete_id: "me-1",
    enabled: true,
    phase: "ready",
    highlight_id: HL,
    status: "ready",
    plan_status: "planned",
    render_total: 1,
    render_max: 10,
    renders_remaining: 9,
    can_regenerate: true,
    last_attempt_failed: false,
    playback: {
      storage_path: "m/u/highlights/1.mp4",
      poster_path: "m/u/highlights/1.jpg",
      duration_s: "31.200",
      version: 1,
      segments: [{ start_s: 23, end_s: 29, label: "TAKEDOWN" }, { start_s: 40, end_s: 45 }],
      ready_at: "2026-09-27T10:00:00Z",
    },
    error_message: null,
    identity_disputed: false,
    last_change_summary: null,
    updated_at: "2026-09-27T10:00:00Z",
    ...over,
  };
}

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as never, rpc };
}

function pgErr(hint: string) {
  return { code: "P0001", message: "db text", details: "", hint };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// getHighlightProgress
// ---------------------------------------------------------------------------

describe("getHighlightProgress", () => {
  it("calls get_highlight_progress with p_match_video_id and maps to camelCase", async () => {
    const { client, rpc } = rpcClient({ data: raw(), error: null });
    const result = await getHighlightProgress(client, VIDEO);
    expect(rpc).toHaveBeenCalledWith("get_highlight_progress", { p_match_video_id: VIDEO });
    expect(result).toEqual({
      ok: true,
      data: {
        matchVideoId: VIDEO,
        athleteId: "me-1",
        enabled: true,
        phase: "ready",
        highlightId: HL,
        status: "ready",
        planStatus: "planned",
        renderTotal: 1,
        renderMax: 10,
        rendersRemaining: 9,
        canRegenerate: true,
        lastAttemptFailed: false,
        playback: {
          storagePath: "m/u/highlights/1.mp4",
          posterPath: "m/u/highlights/1.jpg",
          durationS: 31.2,
          version: 1,
          segments: [{ start_s: 23, end_s: 29, label: "TAKEDOWN" }, { start_s: 40, end_s: 45 }],
          readyAt: "2026-09-27T10:00:00Z",
        },
        errorMessage: null,
        identityDisputed: false,
        identitySide: null,
        lastChangeSummary: null,
        updatedAt: "2026-09-27T10:00:00Z",
      },
    });
  });

  const PHASE_FIXTURES: [HighlightPhase, Partial<RawHighlightProgress>][] = [
    ["disabled", { enabled: false, highlight_id: null, status: null, plan_status: null, playback: null, render_total: 0 }],
    ["unavailable", { highlight_id: null, status: null, plan_status: null, playback: null }],
    ["waiting_for_analysis", { highlight_id: null, status: null, plan_status: null, playback: null }],
    ["planning", { highlight_id: null, status: null, plan_status: "planning", playback: null }],
    ["rendering", { status: "rendering", playback: null, can_regenerate: false }],
    ["ready", {}],
    ["regenerating", { status: "pending", render_total: 2, renders_remaining: 8, can_regenerate: false }],
    ["failed", { status: "failed", playback: null, error_message: "Render timed out" }],
    ["invalidated", { status: "invalidated", playback: null, plan_status: "invalidated" }],
    ["none", { highlight_id: null, status: null, playback: null }],
  ];

  it.each(PHASE_FIXTURES)("maps phase %s", async (phase, over) => {
    const { client } = rpcClient({ data: raw({ phase, ...over }), error: null });
    const result = await getHighlightProgress(client, VIDEO);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.phase).toBe(phase);
    expect(result.data.playback === null).toBe(over.playback === null);
    if (over.error_message) expect(result.data.errorMessage).toBe(over.error_message);
  });

  it("maps ready-with-failed-attempt (phase ready, last_attempt_failed)", async () => {
    const { client } = rpcClient({
      data: raw({ status: "failed", last_attempt_failed: true, last_change_summary: "Shorter." }),
      error: null,
    });
    const result = await getHighlightProgress(client, VIDEO);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.lastAttemptFailed).toBe(true);
    expect(result.data.lastChangeSummary).toBe("Shorter.");
  });

  it("treats a playback object without a storage_path as no playback", () => {
    const p = toHighlightProgress(raw({ playback: { ...raw().playback!, storage_path: "" } }));
    expect(p.playback).toBeNull();
    const q = toHighlightProgress(
      raw({ playback: { ...raw().playback!, storage_path: undefined as unknown as string } }),
    );
    expect(q.playback).toBeNull();
  });

  it("narrows identity_side, status and plan_status to their unions", () => {
    expect(toHighlightProgress(raw({ identity_side: "swapped" })).identitySide).toBe("swapped");
    expect(toHighlightProgress(raw({ identity_side: "sideways" })).identitySide).toBeNull();
    expect(toHighlightProgress(raw({ identity_side: undefined })).identitySide).toBeNull();
    const odd = toHighlightProgress(raw({ status: "exploded", plan_status: "weird" }));
    expect(odd.status).toBeNull();
    expect(odd.planStatus).toBeNull();
  });

  it("treats a non-object payload (array) as UNKNOWN", async () => {
    const { client } = rpcClient({ data: [], error: null });
    const result = await getHighlightProgress(client, VIDEO);
    expect(!result.ok && result.error.code).toBe("UNKNOWN");
  });

  it("degrades an unknown phase to unavailable", () => {
    expect(toHighlightProgress(raw({ phase: "something_new" })).phase).toBe("unavailable");
  });

  it("drops malformed segments and clamps renders_remaining at 0", () => {
    const p = toHighlightProgress(
      raw({
        renders_remaining: -2,
        playback: { ...raw().playback!, segments: [null, "x", { start_s: "1", end_s: 4, label: "" }] },
      }),
    );
    expect(p.rendersRemaining).toBe(0);
    expect(p.playback!.segments).toEqual([{ start_s: 1, end_s: 4 }]);
  });

  it.each([
    ["highlight_not_participant", "NOT_PARTICIPANT"],
    ["highlight_no_athlete", "ATHLETE_NOT_FOUND"],
  ])("maps hint %s to %s", async (hint, code) => {
    const { client } = rpcClient({ data: null, error: pgErr(hint) });
    const result = await getHighlightProgress(client, VIDEO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it("treats a null payload as UNKNOWN", async () => {
    const { client } = rpcClient({ data: null, error: null });
    const result = await getHighlightProgress(client, VIDEO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNKNOWN");
  });

  it("catches a thrown client error as UNKNOWN", async () => {
    const client = { rpc: vi.fn().mockRejectedValue(new Error("offline")) } as never;
    const result = await getHighlightProgress(client, VIDEO);
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
  });
});

// ---------------------------------------------------------------------------
// signHighlightPlayback
// ---------------------------------------------------------------------------

function storageClient(
  byKey: Record<string, { data: { signedUrl: string } | null; error: unknown }>,
) {
  const createSignedUrl = vi.fn((key: string) =>
    Promise.resolve(byKey[key] ?? { data: null, error: { message: "Object not found" } }),
  );
  const from = vi.fn().mockReturnValue({ createSignedUrl });
  return { client: { storage: { from } } as never, from, createSignedUrl };
}

const PLAYBACK = toHighlightProgress(raw()).playback!;

describe("signHighlightPlayback", () => {
  it("signs the live mp4 and poster in match-videos for 3600 s by default", async () => {
    const { client, from, createSignedUrl } = storageClient({
      "m/u/highlights/1.mp4": { data: { signedUrl: "https://s/v" }, error: null },
      "m/u/highlights/1.jpg": { data: { signedUrl: "https://s/p" }, error: null },
    });
    const result = await signHighlightPlayback(client, PLAYBACK);
    expect(from).toHaveBeenCalledWith("match-videos");
    expect(createSignedUrl).toHaveBeenCalledWith("m/u/highlights/1.mp4", 3600);
    expect(createSignedUrl).toHaveBeenCalledWith("m/u/highlights/1.jpg", 3600);
    expect(result).toEqual({
      ok: true,
      data: { url: "https://s/v", posterUrl: "https://s/p", version: 1, durationS: 31.2 },
    });
  });

  it("passes a custom expiry", async () => {
    const { client, createSignedUrl } = storageClient({
      "m/u/highlights/1.mp4": { data: { signedUrl: "https://s/v" }, error: null },
    });
    await signHighlightPlayback(client, PLAYBACK, 60);
    expect(createSignedUrl).toHaveBeenCalledWith("m/u/highlights/1.mp4", 60);
  });

  it("returns a null poster when poster signing fails (best effort)", async () => {
    const { client } = storageClient({
      "m/u/highlights/1.mp4": { data: { signedUrl: "https://s/v" }, error: null },
    });
    const result = await signHighlightPlayback(client, PLAYBACK);
    expect(result.ok && result.data.posterUrl).toBeNull();
  });

  it("skips poster signing when there is no poster path", async () => {
    const { client, createSignedUrl } = storageClient({
      "m/u/highlights/1.mp4": { data: { signedUrl: "https://s/v" }, error: null },
    });
    await signHighlightPlayback(client, { ...PLAYBACK, posterPath: null });
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("maps a 404 object-not-found to VIDEO_FILE_MISSING", async () => {
    const { client } = storageClient({
      "m/u/highlights/1.mp4": { data: null, error: { message: "Object not found", statusCode: "404" } },
    });
    const result = await signHighlightPlayback(client, PLAYBACK);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VIDEO_FILE_MISSING");
  });

  it("maps a bucket-not-found to UNKNOWN (config, not a missing file)", async () => {
    const { client } = storageClient({
      "m/u/highlights/1.mp4": { data: null, error: { message: "Bucket not found" } },
    });
    const result = await signHighlightPlayback(client, PLAYBACK);
    expect(!result.ok && result.error.code).toBe("UNKNOWN");
  });
});

// ---------------------------------------------------------------------------
// submitHighlightFeedback / retryHighlightRender
// ---------------------------------------------------------------------------

describe("submitHighlightFeedback", () => {
  it("sends the exact RPC args with trimmed, capped text", async () => {
    const { client, rpc } = rpcClient({ data: "fb-1", error: null });
    const long = `  ${"x".repeat(HIGHLIGHT_FREE_TEXT_MAX + 20)}  `;
    const result = await submitHighlightFeedback(client, {
      highlightId: HL,
      rating: -1,
      chips: ["not_me", "too_long"],
      freeText: long,
    });
    expect(rpc).toHaveBeenCalledWith("submit_highlight_feedback", {
      p_highlight_id: HL,
      p_rating: -1,
      p_chips: ["not_me", "too_long"],
      p_free_text: "x".repeat(HIGHLIGHT_FREE_TEXT_MAX),
    });
    expect(result).toEqual({ ok: true, data: { feedbackId: "fb-1" } });
  });

  it("omits a null rating and blank text so the SQL defaults apply", async () => {
    const { client, rpc } = rpcClient({ data: "fb-1", error: null });
    await submitHighlightFeedback(client, { highlightId: HL, rating: null, chips: ["too_long"], freeText: "   " });
    expect(rpc).toHaveBeenCalledWith("submit_highlight_feedback", {
      p_highlight_id: HL,
      p_chips: ["too_long"],
    });
  });

  it.each([
    ["highlight_bad_feedback", "HIGHLIGHT_FEEDBACK_INVALID"],
    ["highlight_feedback_limit", "HIGHLIGHT_FEEDBACK_LIMIT"],
    ["highlight_not_ready", "HIGHLIGHT_NOT_READY"],
    ["highlight_not_found", "HIGHLIGHT_NOT_FOUND"],
  ])("maps %s to %s", async (hint, code) => {
    const { client } = rpcClient({ data: null, error: pgErr(hint) });
    const result = await submitHighlightFeedback(client, {
      highlightId: HL,
      rating: 1,
      chips: [],
      freeText: null,
    });
    expect(!result.ok && result.error.code).toBe(code);
  });
});

describe("retryHighlightRender", () => {
  it("calls retry_highlight_render with p_highlight_id", async () => {
    const { client, rpc } = rpcClient({ data: HL, error: null });
    const result = await retryHighlightRender(client, HL);
    expect(rpc).toHaveBeenCalledWith("retry_highlight_render", { p_highlight_id: HL });
    expect(result).toEqual({ ok: true, data: { highlightId: HL } });
  });

  it.each([
    ["highlight_not_retryable", "HIGHLIGHT_NOT_RETRYABLE"],
    ["highlight_render_limit", "HIGHLIGHT_RENDER_LIMIT"],
    ["highlight_clips_disabled", "HIGHLIGHTS_DISABLED"],
    ["highlight_not_found", "HIGHLIGHT_NOT_FOUND"],
    ["highlight_source_not_ready", "HIGHLIGHT_SOURCE_NOT_READY"],
  ])("maps %s to %s", async (hint, code) => {
    const { client } = rpcClient({ data: null, error: pgErr(hint) });
    const result = await retryHighlightRender(client, HL);
    expect(!result.ok && result.error.code).toBe(code);
  });
});

// ---------------------------------------------------------------------------
// regenerateHighlight (edge function)
// ---------------------------------------------------------------------------

function fnClient(result: { data: unknown; error: unknown }) {
  const invoke = vi.fn().mockResolvedValue(result);
  return { client: { functions: { invoke } } as never, invoke };
}

/** A FunctionsHttpError-shaped error: `context` is the fetch Response. */
function httpError(status: number, body: string) {
  return Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    name: "FunctionsHttpError",
    context: new Response(body, { status, headers: { "Content-Type": "application/json" } }),
  });
}

const PARAMS = {
  highlightId: HL,
  rating: -1 as const,
  chips: ["not_me" as const, "slow_start" as const],
  freeText: "  add the sweep near the end  ",
};

describe("regenerateHighlight", () => {
  it("invokes highlight-regenerate with the snake_case body and maps the 200", async () => {
    const { client, invoke } = fnClient({
      data: {
        ok: true,
        feedback_id: "fb-9",
        highlight_id: HL,
        render_total: 2,
        renders_remaining: 8,
        change_summary: "Built from your moments.",
      },
      error: null,
    });
    const result = await regenerateHighlight(client, PARAMS);
    expect(invoke).toHaveBeenCalledWith("highlight-regenerate", {
      body: {
        highlight_id: HL,
        rating: -1,
        chips: ["not_me", "slow_start"],
        free_text: "add the sweep near the end",
      },
    });
    expect(result).toEqual({
      ok: true,
      data: {
        feedbackId: "fb-9",
        highlightId: HL,
        renderTotal: 2,
        rendersRemaining: 8,
        changeSummary: "Built from your moments.",
      },
    });
  });

  it.each([
    [401, "highlight_no_athlete", "ATHLETE_NOT_FOUND"],
    [400, "highlight_bad_feedback", "HIGHLIGHT_FEEDBACK_INVALID"],
    [404, "highlight_not_found", "HIGHLIGHT_NOT_FOUND"],
    [409, "highlight_render_in_progress", "HIGHLIGHT_RENDER_IN_PROGRESS"],
    [409, "highlight_render_limit", "HIGHLIGHT_RENDER_LIMIT"],
    [409, "highlight_regen_unavailable", "HIGHLIGHT_REGEN_UNAVAILABLE"],
    [409, "highlight_not_ready", "HIGHLIGHT_NOT_READY"],
    [409, "highlight_clips_disabled", "HIGHLIGHTS_DISABLED"],
    [422, "highlight_regen_ai_failed", "HIGHLIGHT_REGEN_FAILED"],
  ])("maps HTTP %i hint %s to %s", async (status, hint, code) => {
    const body = JSON.stringify({ ok: false, error: { hint, message: "user-safe" } });
    const { client } = fnClient({ data: null, error: httpError(status, body) });
    const result = await regenerateHighlight(client, PARAMS);
    expect(!result.ok && result.error.code).toBe(code);
  });

  it("maps the 500 'unknown' hint to UNKNOWN with the server message", async () => {
    const body = JSON.stringify({ ok: false, error: { hint: "unknown", message: "Try later." } });
    const { client } = fnClient({ data: null, error: httpError(500, body) });
    const result = await regenerateHighlight(client, PARAMS);
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "Try later." } });
  });

  it("treats a non-JSON error body as UNKNOWN", async () => {
    const { client } = fnClient({ data: null, error: httpError(502, "<html>Bad gateway</html>") });
    const result = await regenerateHighlight(client, PARAMS);
    expect(!result.ok && result.error.code).toBe("UNKNOWN");
  });

  it("maps a non-JSON gateway 401 to ATHLETE_NOT_FOUND (signed out), not UNKNOWN", async () => {
    const { client } = fnClient({ data: null, error: httpError(401, "Unauthorized") });
    const result = await regenerateHighlight(client, PARAMS);
    expect(!result.ok && result.error.code).toBe("ATHLETE_NOT_FOUND");
  });

  it("maps HTTP 409 highlight_feedback_limit to HIGHLIGHT_FEEDBACK_LIMIT", async () => {
    const body = JSON.stringify({ ok: false, error: { hint: "highlight_feedback_limit", message: "x" } });
    const { client } = fnClient({ data: null, error: httpError(409, body) });
    const result = await regenerateHighlight(client, PARAMS);
    expect(!result.ok && result.error.code).toBe("HIGHLIGHT_FEEDBACK_LIMIT");
  });

  it("never sends more than 280 characters of free text (the function rejects, not truncates)", async () => {
    const { client, invoke } = fnClient({ data: { ok: true, feedback_id: "fb" }, error: null });
    await regenerateHighlight(client, { ...PARAMS, freeText: "z".repeat(400) });
    expect(invoke.mock.calls[0][1].body.free_text).toHaveLength(HIGHLIGHT_FREE_TEXT_MAX);
  });

  it("maps a gateway 401 without a hint (invalid JWT) to ATHLETE_NOT_FOUND", async () => {
    const { client } = fnClient({ data: null, error: httpError(401, '{"msg":"Invalid JWT"}') });
    const result = await regenerateHighlight(client, PARAMS);
    expect(!result.ok && result.error.code).toBe("ATHLETE_NOT_FOUND");
  });

  it("treats a relay/fetch error (no Response context) as UNKNOWN", async () => {
    const err = Object.assign(new Error("Failed to send a request"), { name: "FunctionsFetchError" });
    const { client } = fnClient({ data: null, error: err });
    const result = await regenerateHighlight(client, PARAMS);
    expect(result).toEqual({
      ok: false,
      error: { code: "UNKNOWN", message: "Failed to send a request" },
    });
  });

  it("treats a 200 without a feedback_id as UNKNOWN", async () => {
    const { client } = fnClient({ data: { ok: true, highlight_id: HL, render_total: 2 }, error: null });
    const result = await regenerateHighlight(client, PARAMS);
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "No feedback id returned." } });
  });

  it("maps a 2xx body with ok:false through the hint table", async () => {
    const { client } = fnClient({
      data: { ok: false, error: { hint: "highlight_render_limit", message: "x" } },
      error: null,
    });
    const result = await regenerateHighlight(client, PARAMS);
    expect(!result.ok && result.error.code).toBe("HIGHLIGHT_RENDER_LIMIT");
  });
});

describe("highlight constants", () => {
  it("lists the six DB chip codes in order with their labels", () => {
    expect(HIGHLIGHT_FEEDBACK_CHIPS).toEqual([
      { code: "not_me", label: "That's not me" },
      { code: "missed_best_moment", label: "Missed my best moment" },
      { code: "too_long", label: "Too long" },
      { code: "too_short", label: "Too short" },
      { code: "slow_start", label: "Slow start" },
      { code: "wrong_label", label: "Wrong moment labelled" },
    ]);
    expect(HIGHLIGHT_FREE_TEXT_MAX).toBe(280);
  });
});
