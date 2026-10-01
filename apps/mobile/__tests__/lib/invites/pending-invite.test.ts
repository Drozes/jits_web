/**
 * Pre-auth invite persistence (jr_be spec 016, contract 6): TTLs, first-touch
 * preservation, replacement, expiry cleanup, and that broken storage never
 * throws into launch.
 *
 * Source: apps/mobile/lib/invites/pending-invite.ts
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  PENDING_EVENTS_KEY,
  PENDING_INVITE_KEY,
  bufferTokenCaptured,
  clearPendingInvite,
  loadPendingInvite,
  makePendingInvite,
  parsePendingInvite,
  savePendingInvite,
  takeBufferedEvents,
} from "@/lib/invites/pending-invite";

const TOKEN = "Ab3_dE-fGhIjKlMnOpQrSt";
const OTHER = "Zz9_dE-fGhIjKlMnOpQrSt";
const T0 = new Date("2026-10-01T12:00:00.000Z");

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("makePendingInvite", () => {
  it("token lives 7 days, code 30 minutes", () => {
    const t = makePendingInvite({ token: TOKEN }, "universal_link", T0)!;
    expect(t.expires_at).toBe("2026-10-08T12:00:00.000Z");
    const c = makePendingInvite({ code: "k7q-4m2" }, "code", T0)!;
    expect(c).toMatchObject({ token: null, code: "K7Q4M2", expires_at: "2026-10-01T12:30:00.000Z" });
  });
  it("rejects input that is neither a token nor a code", () => {
    expect(makePendingInvite({ token: "short" }, "universal_link")).toBeNull();
    expect(makePendingInvite({ code: "nope" }, "code")).toBeNull();
  });
});

describe("parsePendingInvite", () => {
  it("drops an expired or malformed record", () => {
    const rec = makePendingInvite({ code: "K7Q4M2" }, "code", T0)!;
    expect(parsePendingInvite(JSON.stringify(rec), new Date("2026-10-01T12:29:00Z"))).not.toBeNull();
    expect(parsePendingInvite(JSON.stringify(rec), new Date("2026-10-01T12:31:00Z"))).toBeNull();
    expect(parsePendingInvite("{not json")).toBeNull();
    expect(parsePendingInvite(JSON.stringify({ ...rec, code: "BAD" }), T0)).toBeNull();
  });
});

describe("save / load / clear", () => {
  it("keeps the first touch when the same link is opened again", async () => {
    await savePendingInvite(makePendingInvite({ token: TOKEN }, "universal_link", T0)!);
    await savePendingInvite(makePendingInvite({ token: TOKEN }, "universal_link", new Date("2026-10-02T00:00:00Z"))!);
    const loaded = await loadPendingInvite(new Date("2026-10-02T00:00:01Z"));
    expect(loaded?.first_touch_at).toBe(T0.toISOString());
  });
  it("a different invite replaces the older one", async () => {
    await savePendingInvite(makePendingInvite({ token: TOKEN }, "universal_link", T0)!);
    await savePendingInvite(makePendingInvite({ token: OTHER }, "qr", T0)!);
    expect((await loadPendingInvite(T0))?.token).toBe(OTHER);
  });
  it("load removes an expired record so it never resumes", async () => {
    await savePendingInvite(makePendingInvite({ code: "K7Q4M2" }, "code", T0)!);
    expect(await loadPendingInvite(new Date("2026-10-01T13:00:00Z"))).toBeNull();
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });
  it("clear removes it", async () => {
    await savePendingInvite(makePendingInvite({ token: TOKEN }, "universal_link")!);
    await clearPendingInvite();
    expect(await loadPendingInvite()).toBeNull();
  });
  it("storage failures never throw", async () => {
    // Once each per call below (the library mock's own jest.fn must survive).
    const boom = new Error("boom");
    (AsyncStorage.getItem as jest.Mock)
      .mockRejectedValueOnce(boom)
      .mockRejectedValueOnce(boom)
      .mockRejectedValueOnce(boom);
    await expect(savePendingInvite(makePendingInvite({ token: TOKEN }, "universal_link")!)).resolves.toBeUndefined();
    await expect(loadPendingInvite()).resolves.toBeNull();
    await expect(takeBufferedEvents()).resolves.toEqual([]);
  });
});

describe("buffered token_captured events", () => {
  it("caps at 20 (newest kept) and is emptied when taken", async () => {
    for (let i = 0; i < 25; i++) {
      await bufferTokenCaptured({ token: TOKEN, captured_at: `t${i}`, gateway: "universal_link" });
    }
    const events = await takeBufferedEvents();
    expect(events).toHaveLength(20);
    expect(events[0].captured_at).toBe("t5");
    expect(await AsyncStorage.getItem(PENDING_EVENTS_KEY)).toBeNull();
  });
});
