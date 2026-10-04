import { describe, expect, it, vi } from "vitest";
import { PLATFORM_HEADER, isRestRequest, platformFetch } from "./platform-fetch";

function capture() {
  const base = vi.fn((...args: [RequestInfo | URL, RequestInit?]) => Promise.resolve(new Response(String(args.length))));
  return { base, f: platformFetch("https://x.supabase.co", base as unknown as typeof fetch) };
}

function headerOf(call: unknown[]): string | null {
  const init = call[1] as RequestInit | undefined;
  return new Headers(init?.headers).get(PLATFORM_HEADER);
}

describe("platformFetch", () => {
  it("adds x-elo-platform: web to PostgREST requests and keeps the other headers", async () => {
    const { base, f } = capture();
    await f("https://x.supabase.co/rest/v1/rpc/log_location_event", {
      method: "POST",
      headers: { apikey: "k", Authorization: "Bearer t" },
    });
    const init = base.mock.calls[0][1] as RequestInit;
    const h = new Headers(init.headers);
    expect(h.get(PLATFORM_HEADER)).toBe("web");
    expect(h.get("apikey")).toBe("k");
    expect(h.get("authorization")).toBe("Bearer t");
    expect(init.method).toBe("POST");
  });

  it("covers table reads too (a URL object input)", async () => {
    const { base, f } = capture();
    await f(new URL("https://x.supabase.co/rest/v1/athletes?select=id"));
    expect(headerOf(base.mock.calls[0])).toBe("web");
  });

  it.each([
    "https://x.supabase.co/functions/v1/delete-account",
    "https://x.supabase.co/auth/v1/token?grant_type=refresh_token",
    "https://x.supabase.co/storage/v1/object/athlete-photos/a.png",
  ])("leaves %s untouched (edge function CORS allowlists)", async (url) => {
    const { base, f } = capture();
    const init = { headers: { apikey: "k" } };
    await f(url, init);
    expect(base).toHaveBeenCalledWith(url, init);
  });

  it("passes an unparseable URL straight through", async () => {
    const { base, f } = capture();
    await f("not a url");
    expect(base).toHaveBeenCalledWith("not a url", undefined);
  });
});

describe("isRestRequest", () => {
  it("matches only this project's /rest/v1/ prefix", () => {
    expect(isRestRequest("https://x.supabase.co/rest/v1/rpc/f", "https://x.supabase.co/")).toBe(true);
    expect(isRestRequest("http://127.0.0.1:54321/rest/v1/athletes", "http://127.0.0.1:54321")).toBe(true);
    // Another host, or /rest/v1/ somewhere else in the path or query.
    expect(isRestRequest("https://evil.example/rest/v1/x", "https://x.supabase.co")).toBe(false);
    expect(isRestRequest("https://x.supabase.co/functions/v1/a/rest/v1/", "https://x.supabase.co")).toBe(false);
    expect(isRestRequest("https://x.supabase.co/storage/v1/object?p=/rest/v1/", "https://x.supabase.co")).toBe(false);
    expect(isRestRequest("https://x.supabase.co/rest/v1/x", "")).toBe(false);
  });
});
