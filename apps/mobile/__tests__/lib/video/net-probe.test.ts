/**
 * The background upload probe (lib/video/net-probe.ts; specs/
 * dynamic-capture-bitrate 16.3 E7, E8, 16.5, AC M5): a fake XHR exposing
 * upload.onprogress, onload, onerror and abort, driven on Jest's fake clock.
 */
jest.mock("@/lib/supabase/client", () => ({ supabase: { auth: { getSession: jest.fn() } } }));

import {
  NET_PROBE_MAX_BYTES,
  NET_PROBE_MAX_MS,
  __resetNetProbeForTests,
  isNetProbeAbsent,
  probeRate,
  runNetProbe,
  type NetProbeOptions,
  type NetProbeResult,
  type ProbeSignal,
} from "@/lib/video/net-probe";

class FakeXhr {
  static all: FakeXhr[] = [];
  method: string | null = null;
  url: string | null = null;
  headers: Record<string, string> = {};
  body: unknown = undefined;
  timeout = -1;
  status = 0;
  responseText = "";
  upload: { onprogress: ((e: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  abort = jest.fn(() => this.onabort?.());
  constructor() {
    FakeXhr.all.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(body: unknown) {
    this.body = body;
  }
  /** Progress at `t` ms after send (the clock is advanced to it first). */
  progressAt(t: number, loaded: number, t0: number) {
    jest.setSystemTime(t0 + t);
    this.upload.onprogress?.({ loaded });
  }
  answerAt(t: number, status: number, text: string, t0: number) {
    jest.setSystemTime(t0 + t);
    this.status = status;
    this.responseText = text;
    this.onload?.();
  }
}

function signal(): { signal: ProbeSignal; abort: () => void } {
  let aborted = false;
  const cbs = new Set<() => void>();
  return {
    signal: {
      get aborted() {
        return aborted;
      },
      addEventListener: (_t, cb) => void cbs.add(cb),
      removeEventListener: (_t, cb) => void cbs.delete(cb),
    },
    abort: () => {
      aborted = true;
      for (const cb of [...cbs]) cb();
    },
  };
}

const T0 = 1_800_000_000_000;
const getAccessToken = jest.fn(async (): Promise<string | null> => "tok");

function start(over: Partial<NetProbeOptions> = {}) {
  const sig = signal();
  const p = runNetProbe({
    network: "wifi",
    signal: sig.signal,
    createXhr: () => new FakeXhr() as unknown as XMLHttpRequest,
    getAccessToken,
    baseUrl: "https://proj.supabase.co",
    anonKey: "anon",
    ...over,
  });
  return { p, abort: sig.abort };
}

/** Let the token read resolve and send() run; the clock stays at T0. */
async function sent(): Promise<FakeXhr> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const xhr = FakeXhr.all[FakeXhr.all.length - 1];
  expect(xhr).toBeDefined();
  return xhr;
}

const mbpsOf = (bytes: number, ms: number) => (bytes * 8) / (ms / 1000) / 1e6;

beforeEach(() => {
  jest.useFakeTimers({ now: T0 });
  FakeXhr.all = [];
  __resetNetProbeForTests();
  getAccessToken.mockReset().mockResolvedValue("tok");
});

afterEach(() => {
  jest.useRealTimers();
});

async function settled(p: Promise<NetProbeResult>): Promise<NetProbeResult> {
  const r = await p;
  // (k) every timer is cleared once it settles.
  expect(jest.getTimerCount()).toBe(0);
  return r;
}

describe("the request (j)", () => {
  it("POSTs exactly 4,194,304 bytes with the three headers to /functions/v1/net-probe, no native timeout", async () => {
    const { p, abort } = start();
    const xhr = await sent();
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("https://proj.supabase.co/functions/v1/net-probe");
    expect(typeof xhr.body).toBe("string");
    expect((xhr.body as string).length).toBe(4_194_304);
    expect(NET_PROBE_MAX_BYTES).toBe(4_194_304);
    expect(/^0+$/.test(xhr.body as string)).toBe(true);
    expect(xhr.headers).toEqual({
      Authorization: "Bearer tok",
      apikey: "anon",
      "Content-Type": "application/octet-stream",
    });
    expect(xhr.timeout).toBe(0);
    abort();
    await settled(p);
  });
});

describe("the steady rate (a)", () => {
  it("only progress at or after 1,000 ms counts; the exact Mbps for a scripted series", async () => {
    const run = async (preRamp: number) => {
      FakeXhr.all = [];
      jest.setSystemTime(T0);
      const { p } = start();
      const xhr = await sent();
      xhr.progressAt(200, preRamp, T0);
      xhr.progressAt(999, preRamp + 1, T0);
      xhr.progressAt(1_000, 1_000_000, T0);
      xhr.progressAt(2_000, 2_000_000, T0);
      xhr.progressAt(3_000, 3_500_000, T0);
      jest.setSystemTime(T0);
      await jest.advanceTimersByTimeAsync(NET_PROBE_MAX_MS);
      return settled(p);
    };
    const a = await run(10);
    const b = await run(900_000);
    expect(a).toEqual(
      expect.objectContaining({ status: "ok", method: "steady", mbps: mbpsOf(2_500_000, 2_000), bytesSent: 3_500_000 }),
    );
    expect(a.mbps).toBeCloseTo(10, 9);
    expect(b.mbps).toBe(a.mbps);
  });
});

describe("the 10 s cap (b, c)", () => {
  it("aborts the XHR and still yields ok from a valid window", async () => {
    const { p } = start();
    const xhr = await sent();
    xhr.progressAt(1_500, 500_000, T0);
    xhr.progressAt(9_500, 4_000_000, T0);
    jest.setSystemTime(T0);
    await jest.advanceTimersByTimeAsync(NET_PROBE_MAX_MS);
    const r = await settled(p);
    expect(xhr.abort).toHaveBeenCalledTimes(1);
    expect(r).toEqual(expect.objectContaining({ status: "ok", method: "steady", httpStatus: null, elapsedMs: NET_PROBE_MAX_MS }));
    expect(r.mbps).toBeCloseTo(mbpsOf(3_500_000, 8_000), 9);
  });

  it("less than 256 KiB in the window: failed", async () => {
    const { p } = start();
    const xhr = await sent();
    xhr.progressAt(1_000, 0, T0);
    xhr.progressAt(9_000, 256 * 1024 - 1, T0);
    jest.setSystemTime(T0);
    await jest.advanceTimersByTimeAsync(NET_PROBE_MAX_MS);
    const r = await settled(p);
    expect(xhr.abort).toHaveBeenCalled();
    expect(r).toEqual(expect.objectContaining({ status: "failed", mbps: null, method: null }));
  });

  it("less than 1 s of window: failed", async () => {
    const { p } = start();
    const xhr = await sent();
    xhr.progressAt(1_000, 0, T0);
    xhr.progressAt(1_999, 3_000_000, T0);
    jest.setSystemTime(T0);
    await jest.advanceTimersByTimeAsync(NET_PROBE_MAX_MS);
    expect((await settled(p)).status).toBe("failed");
  });

  it("no progress at all in 10 s: failed", async () => {
    const { p } = start();
    await sent();
    await jest.advanceTimersByTimeAsync(NET_PROBE_MAX_MS);
    expect(await settled(p)).toEqual(expect.objectContaining({ status: "failed", bytesSent: 0 }));
  });
});

describe("a 200 answer (d, e)", () => {
  it("adds the final point at the answer time with the full size; server fields kept for telemetry", async () => {
    const { p } = start();
    const xhr = await sent();
    xhr.progressAt(1_000, 1_000_000, T0);
    xhr.progressAt(2_000, 2_000_000, T0);
    xhr.answerAt(3_000, 200, JSON.stringify({ ok: true, bytes: 4_194_304, ms: 2_870 }), T0);
    const r = await settled(p);
    expect(r).toEqual(
      expect.objectContaining({
        status: "ok",
        method: "steady",
        bytesSent: NET_PROBE_MAX_BYTES,
        httpStatus: 200,
        serverBytes: 4_194_304,
        serverMs: 2_870,
        elapsedMs: 3_000,
        network: "wifi",
      }),
    );
    expect(r.mbps).toBeCloseTo(mbpsOf(NET_PROBE_MAX_BYTES - 1_000_000, 2_000), 9);
  });

  it("bad JSON keeps the server fields null, the rate from progress still counts", async () => {
    const { p } = start();
    const xhr = await sent();
    xhr.progressAt(1_000, 1_000_000, T0);
    xhr.answerAt(3_000, 200, "<html>", T0);
    const r = await settled(p);
    expect(r).toEqual(expect.objectContaining({ status: "ok", serverBytes: null, serverMs: null }));
    expect(r.mbps).toBeCloseTo(mbpsOf(NET_PROBE_MAX_BYTES - 1_000_000, 2_000), 9);
  });

  it("a fast 200 under the ramp: the whole-request fallback", async () => {
    const { p } = start();
    const xhr = await sent();
    xhr.progressAt(300, 2_000_000, T0);
    xhr.answerAt(800, 200, "{}", T0);
    const r = await settled(p);
    expect(r).toEqual(expect.objectContaining({ status: "ok", method: "whole" }));
    expect(r.mbps).toBeCloseTo(mbpsOf(NET_PROBE_MAX_BYTES, 800), 9);
  });

  it("a fast 200 whose steady window is under 1 s: the whole-request fallback", async () => {
    const { p } = start();
    const xhr = await sent();
    xhr.progressAt(1_200, 3_000_000, T0);
    xhr.answerAt(1_500, 200, "{}", T0);
    const r = await settled(p);
    expect(r).toEqual(expect.objectContaining({ status: "ok", method: "whole" }));
    expect(r.mbps).toBeCloseTo(mbpsOf(NET_PROBE_MAX_BYTES, 1_500), 9);
  });
});

describe("absent and failures (f, g, i)", () => {
  it("404: absent, latched for the process, and a second call makes no request", async () => {
    const { p } = start();
    const xhr = await sent();
    xhr.answerAt(400, 404, "", T0);
    expect(await settled(p)).toEqual(expect.objectContaining({ status: "absent", httpStatus: 404, mbps: null }));
    expect(isNetProbeAbsent()).toBe(true);
    const again = await settled(start().p);
    expect(again.status).toBe("absent");
    expect(FakeXhr.all).toHaveLength(1);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it.each([401, 413, 400, 500])("%i: failed, no retry", async (status) => {
    const { p } = start();
    const xhr = await sent();
    xhr.progressAt(1_000, 1_000_000, T0);
    xhr.progressAt(3_000, 4_000_000, T0);
    xhr.answerAt(3_100, status, JSON.stringify({ ok: false }), T0);
    expect(await settled(p)).toEqual(expect.objectContaining({ status: "failed", httpStatus: status, mbps: null }));
    expect(FakeXhr.all).toHaveLength(1);
    expect(isNetProbeAbsent()).toBe(false);
  });

  it("onerror and ontimeout: failed", async () => {
    const one = start();
    (await sent()).onerror?.();
    expect((await settled(one.p)).status).toBe("failed");
    const two = start();
    (await sent()).ontimeout?.();
    expect((await settled(two.p)).status).toBe("failed");
    expect(FakeXhr.all).toHaveLength(2);
  });

  it("no token: failed with no request", async () => {
    getAccessToken.mockResolvedValue(null);
    expect(await settled(start().p)).toEqual(expect.objectContaining({ status: "failed" }));
    expect(FakeXhr.all).toHaveLength(0);
  });

  it("a token read that rejects, or an XHR that cannot be built: failed, never rejects", async () => {
    getAccessToken.mockRejectedValue(new Error("auth"));
    await expect(start().p).resolves.toEqual(expect.objectContaining({ status: "failed" }));
    getAccessToken.mockResolvedValue("tok");
    const r = await start({
      createXhr: () => {
        throw new Error("no XHR");
      },
    }).p;
    expect(r.status).toBe("failed");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("a send() that throws: failed, the timer cleared", async () => {
    const r = start({
      createXhr: () => {
        const x = new FakeXhr();
        x.send = () => {
          throw new Error("native");
        };
        return x as unknown as XMLHttpRequest;
      },
    });
    expect((await settled(r.p)).status).toBe("failed");
  });
});

describe("cancel (h)", () => {
  it("aborts the XHR and resolves cancelled with no rate, even with a valid window", async () => {
    const { p, abort } = start();
    const xhr = await sent();
    xhr.progressAt(1_000, 1_000_000, T0);
    xhr.progressAt(5_000, 4_000_000, T0);
    abort();
    const r = await settled(p);
    expect(xhr.abort).toHaveBeenCalledTimes(1);
    expect(r).toEqual(expect.objectContaining({ status: "cancelled", mbps: null, method: null }));
  });

  it("cancelled before the token lands: no request", async () => {
    const { p, abort } = start();
    abort();
    expect(await settled(p)).toEqual(expect.objectContaining({ status: "cancelled" }));
    expect(FakeXhr.all).toHaveLength(0);
  });

  it("events after settling change nothing (settles once)", async () => {
    const { p } = start();
    const xhr = await sent();
    xhr.onerror?.();
    xhr.answerAt(500, 200, "{}", T0);
    expect((await settled(p)).status).toBe("failed");
  });
});

// Phase 2 review MAJOR 1: iOS suspends JS in the background; progress
// queues and the 10 s timer fires late, which would read as a slow link.
describe("a probe suspended past the cap", () => {
  it("the overdue 10 s timer discards the rate: failed", async () => {
    const { p } = start();
    const xhr = await sent();
    xhr.progressAt(1_000, 500_000, T0);
    xhr.progressAt(3_000, 1_500_000, T0);
    // The clock jumps (JS was suspended) without the timer firing...
    jest.setSystemTime(T0 + 12_500);
    // ...then it fires late.
    await jest.advanceTimersByTimeAsync(NET_PROBE_MAX_MS);
    const r = await settled(p);
    expect(r).toEqual(expect.objectContaining({ status: "failed", mbps: null }));
    expect(xhr.abort).toHaveBeenCalled();
  });

  it("a 200 answered more than 2 s past the cap: failed", async () => {
    const { p } = start();
    const xhr = await sent();
    xhr.progressAt(1_000, 500_000, T0);
    xhr.answerAt(NET_PROBE_MAX_MS + 2_001, 200, "{}", T0);
    expect((await settled(p)).status).toBe("failed");
  });

  it("a 200 just inside the 2 s margin still counts", async () => {
    const { p } = start();
    const xhr = await sent();
    xhr.progressAt(1_000, 500_000, T0);
    xhr.answerAt(NET_PROBE_MAX_MS + 2_000, 200, "{}", T0);
    expect((await settled(p)).status).toBe("ok");
  });
});

describe("probeRate", () => {
  it("null with no window and no answer", () => {
    expect(probeRate([], null)).toBeNull();
    expect(probeRate([{ t: 500, bytes: 4_000_000 }], null)).toBeNull();
  });
});
