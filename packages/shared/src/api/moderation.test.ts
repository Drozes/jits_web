import { describe, expect, it, vi } from "vitest";
import {
  AI_PROCESSING_CONSENT_VERSION,
  TIMEKEEPER_CONSENT_VERSION,
  blockAthlete,
  composeConsentVersion,
  consentVersionTokens,
  hasConsentedToText,
  getAiProcessingConsent,
  getMyBlockIds,
  getMyBlockedAthletes,
  normalizeReportDetails,
  parseBlockIds,
  parseBlockedAthletes,
  recordAiProcessingConsent,
  reportContent,
  unblockAthlete,
} from "./moderation";

type Reply = { data: unknown; error: { message?: string; hint?: string | null } | null };

function client(reply: Reply) {
  const rpc = vi.fn(() => Promise.resolve(reply));
  const maybeSingle = vi.fn(() => Promise.resolve(reply));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { c: { rpc, from } as never, rpc, from, select, eq };
}

describe("moderation RPC wrappers (jr_be-m2s)", () => {
  it("block and unblock pass the athlete id", async () => {
    const m = client({ data: null, error: null });
    await expect(blockAthlete(m.c, "a-1")).resolves.toEqual({ ok: true, data: undefined });
    expect(m.rpc).toHaveBeenCalledWith("block_athlete", { p_athlete_id: "a-1" });
    await unblockAthlete(m.c, "a-1");
    expect(m.rpc).toHaveBeenLastCalledWith("unblock_athlete", { p_athlete_id: "a-1" });
  });

  it("a RAISE comes back with its hint, never thrown", async () => {
    const m = client({ data: null, error: { message: "no", hint: "cannot_block_self" } });
    await expect(blockAthlete(m.c, "me")).resolves.toEqual({ ok: false, error: { hint: "cannot_block_self", message: "no" } });
  });

  it("a thrown client error is unknown", async () => {
    const c = { rpc: vi.fn(() => Promise.reject(new Error("offline"))) } as never;
    await expect(blockAthlete(c, "a")).resolves.toEqual({ ok: false, error: { hint: "unknown", message: "offline" } });
  });

  it("blocked athletes: well-formed rows, newest first", async () => {
    const rows = [
      { athlete_id: "a", display_name: "A", blocked_at: "2026-10-01T00:00:00Z" },
      { athlete_id: "b", display_name: null, blocked_at: "2026-10-14T00:00:00Z" },
      { nope: true },
    ];
    expect(parseBlockedAthletes(rows)).toEqual([
      { athlete_id: "b", display_name: "", blocked_at: "2026-10-14T00:00:00Z" },
      { athlete_id: "a", display_name: "A", blocked_at: "2026-10-01T00:00:00Z" },
    ]);
    expect(parseBlockedAthletes(null)).toEqual([]);
    expect(parseBlockedAthletes({})).toBeNull();
    const m = client({ data: rows.slice(0, 1), error: null });
    await expect(getMyBlockedAthletes(m.c)).resolves.toMatchObject({ ok: true, data: [{ athlete_id: "a" }] });
  });

  it("block ids: a setof uuid as strings (or wrapped objects)", async () => {
    expect(parseBlockIds(["a", "", 3, { get_my_block_ids: "b" }])).toEqual(["a", "b"]);
    expect(parseBlockIds("x")).toBeNull();
    const m = client({ data: ["a"], error: null });
    await expect(getMyBlockIds(m.c)).resolves.toEqual({ ok: true, data: ["a"] });
    expect(m.rpc).toHaveBeenCalledWith("get_my_block_ids");
  });

  it("report: details trimmed, empty omitted, capped at 1000", async () => {
    expect(normalizeReportDetails("  hi  ")).toBe("hi");
    expect(normalizeReportDetails("   ")).toBeNull();
    expect(normalizeReportDetails("x".repeat(1200))).toHaveLength(1000);
    const m = client({ data: "r-1", error: null });
    await expect(
      reportContent(m.c, { targetType: "highlight", targetId: "h-1", reason: "spam", details: "  " }),
    ).resolves.toEqual({ ok: true, data: "r-1" });
    expect(m.rpc).toHaveBeenCalledWith("report_content", { p_target_type: "highlight", p_target_id: "h-1", p_reason: "spam" });
    await reportContent(m.c, { targetType: "athlete", targetId: "a", reason: "other", details: " why " });
    expect(m.rpc).toHaveBeenLastCalledWith("report_content", {
      p_target_type: "athlete",
      p_target_id: "a",
      p_reason: "other",
      p_details: "why",
    });
  });

  it("consent: records the shown version and returns the stored time", async () => {
    const m = client({ data: "2026-10-14T12:00:00Z", error: null });
    await expect(recordAiProcessingConsent(m.c)).resolves.toEqual({ ok: true, data: "2026-10-14T12:00:00Z" });
    expect(m.rpc).toHaveBeenCalledWith("record_ai_processing_consent", { p_version: "2026-10-23" });
  });

  it("consent read: the owner's two columns, null when never given", async () => {
    const m = client({ data: { ai_processing_consent_at: null, ai_processing_consent_version: null }, error: null });
    await expect(getAiProcessingConsent(m.c, "me")).resolves.toEqual({ ok: true, data: { consentAt: null, version: null } });
    expect(m.from).toHaveBeenCalledWith("athletes");
    expect(m.select).toHaveBeenCalledWith("ai_processing_consent_at, ai_processing_consent_version");
    expect(m.eq).toHaveBeenCalledWith("id", "me");
  });
});

describe("per-text consent versions (jits-o47s.46)", () => {
  const A = AI_PROCESSING_CONSENT_VERSION;
  const T = TIMEKEEPER_CONSENT_VERSION;

  it("the two texts have different versions, and both together fit the 32-character column", () => {
    expect(A).not.toBe(T);
    expect(`${A}+${T}`.length).toBeLessThanOrEqual(32);
  });

  it("splits a stored version into its tokens", () => {
    expect(consentVersionTokens(null)).toEqual([]);
    expect(consentVersionTokens("")).toEqual([]);
    expect(consentVersionTokens(A)).toEqual([A]);
    expect(consentVersionTokens(` ${A} + ${T} `)).toEqual([A, T]);
  });

  it("each text counts only its own current version", () => {
    expect(hasConsentedToText(A, "athlete")).toBe(true);
    expect(hasConsentedToText(A, "timekeeper")).toBe(false);
    expect(hasConsentedToText(T, "timekeeper")).toBe(true);
    expect(hasConsentedToText(T, "athlete")).toBe(false);
    expect(hasConsentedToText(`${A}+${T}`, "athlete")).toBe(true);
    expect(hasConsentedToText(`${A}+${T}`, "timekeeper")).toBe(true);
    // The shipped 2026-10-14 text is stale for both.
    expect(hasConsentedToText("2026-10-14", "athlete")).toBe(false);
    expect(hasConsentedToText("2026-10-14", "timekeeper")).toBe(false);
    expect(hasConsentedToText(null, "athlete")).toBe(false);
  });

  it("agreeing to one text keeps a current consent to the other, in a fixed order", () => {
    expect(composeConsentVersion(null, "athlete")).toBe(A);
    expect(composeConsentVersion(null, "timekeeper")).toBe(T);
    expect(composeConsentVersion(A, "timekeeper")).toBe(`${A}+${T}`);
    expect(composeConsentVersion(T, "athlete")).toBe(`${A}+${T}`);
    expect(composeConsentVersion(`${A}+${T}`, "athlete")).toBe(`${A}+${T}`);
    expect(composeConsentVersion(`${A}+${T}`, "timekeeper")).toBe(`${A}+${T}`);
  });

  it("a stale version drops out instead of growing the token", () => {
    expect(composeConsentVersion("2026-10-14", "timekeeper")).toBe(T);
    expect(composeConsentVersion("2026-10-14+tk-old", "athlete")).toBe(A);
  });
});
