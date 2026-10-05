/**
 * The recording-intent queue (jits-n2im.14): fire and forget, the latest
 * wanted value always wins, one retry, final server answers are final.
 */
const mockSetIntent = jest.fn();
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@jits/shared/api/match-video-upload", () => ({
  setMatchRecordingIntent: (...a: unknown[]) => mockSetIntent(...a),
}));

import {
  RECORDING_INTENT_RETRY_MS,
  __resetRecordingIntentForTests,
  persistRecordingIntent,
} from "@/lib/match-flow/recording-intent";

const OK = { ok: true, data: undefined };
const FAIL = { ok: false, error: { code: "UNKNOWN", message: "offline" } };

beforeEach(() => {
  __resetRecordingIntentForTests();
  mockSetIntent.mockReset();
  mockSetIntent.mockResolvedValue(OK);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  (console.warn as jest.Mock).mockRestore();
});

it("sends the value and skips an unchanged repeat", async () => {
  await persistRecordingIntent("M", true);
  await persistRecordingIntent("M", true);
  expect(mockSetIntent).toHaveBeenCalledTimes(1);
  expect(mockSetIntent).toHaveBeenCalledWith(expect.anything(), "M", true);
});

it("a fast ON -> OFF -> ON ends on the last value, in order", async () => {
  let release: (() => void) | null = null;
  mockSetIntent.mockImplementationOnce(
    () => new Promise((resolve) => {
      release = () => resolve(OK);
    }),
  );
  const a = persistRecordingIntent("M", true);
  const b = persistRecordingIntent("M", false);
  const c = persistRecordingIntent("M", true);
  await Promise.resolve();
  await Promise.resolve();
  (release as unknown as () => void)();
  await Promise.all([a, b, c]);
  // The first send (true) was already in flight; the queue then sees the
  // latest wanted value is still true and sends nothing stale.
  expect(mockSetIntent.mock.calls.map((x) => x[2])).toEqual([true]);
});

it("retries a failure once, after the retry delay", async () => {
  jest.useFakeTimers();
  mockSetIntent.mockResolvedValueOnce(FAIL).mockResolvedValueOnce(OK);
  const done = persistRecordingIntent("M", false);
  await jest.advanceTimersByTimeAsync(RECORDING_INTENT_RETRY_MS);
  await done;
  expect(mockSetIntent).toHaveBeenCalledTimes(2);
});

it("gives up after the one retry and never rejects", async () => {
  jest.useFakeTimers();
  mockSetIntent.mockResolvedValue(FAIL);
  const done = persistRecordingIntent("M", true);
  await jest.advanceTimersByTimeAsync(RECORDING_INTENT_RETRY_MS);
  await expect(done).resolves.toBeUndefined();
  expect(mockSetIntent).toHaveBeenCalledTimes(2);
});

it("treats intent_frozen as final (no retry)", async () => {
  mockSetIntent.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "frozen", raw: { hint: "intent_frozen" } } });
  await persistRecordingIntent("M", true);
  expect(mockSetIntent).toHaveBeenCalledTimes(1);
});

it("survives a throwing client", async () => {
  mockSetIntent.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(OK);
  jest.useFakeTimers();
  const done = persistRecordingIntent("M", true);
  await jest.advanceTimersByTimeAsync(RECORDING_INTENT_RETRY_MS);
  await expect(done).resolves.toBeUndefined();
  expect(mockSetIntent).toHaveBeenCalledTimes(2);
});
