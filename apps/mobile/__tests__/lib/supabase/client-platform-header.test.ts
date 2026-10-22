/**
 * Every mobile Supabase request carries the client headers:
 *
 * - `x-elo-platform` (`ios` / `android`), read by the backend's
 *   `_request_platform()` (live location fixes 4.4);
 * - `x-elo-client-caps: timekeeper_v1` (timekeeper mode slice M8, PM16),
 *   read by `_request_client_caps()`, which stamps the caller's side of a
 *   challenge (or the inviter's invite) as able to run a timekeeper-mode
 *   match (jr_be 024 3.3). Challenge create and accept are direct PostgREST
 *   table writes and the match flow runs on RPCs, so the capability has to
 *   ride both, which supabase-js `global.headers` does.
 *
 * Source: apps/mobile/lib/supabase/client.ts
 */
const mockCreateClient = jest.fn((..._a: unknown[]) => ({}));
jest.mock("@supabase/supabase-js", () => ({
  createClient: (...a: unknown[]) => mockCreateClient(...a),
  processLock: jest.fn(),
}));
jest.mock("@/lib/supabase/secure-storage", () => ({ SecureStoreAdapter: {} }));
jest.mock("@/lib/env", () => ({ env: { supabaseUrl: "http://x", supabaseAnonKey: "k" } }));

import { Platform } from "react-native";

type ClientOptions = { global?: { headers?: Record<string, string> } };

/** The options the app's client module passes to `createClient`. */
function appClientOptions(): ClientOptions {
  mockCreateClient.mockClear();
  jest.isolateModules(() => {
    require("@/lib/supabase/client");
  });
  return mockCreateClient.mock.calls[0][2] as ClientOptions;
}

describe("mobile Supabase client", () => {
  it("sends x-elo-platform = Platform.OS and x-elo-client-caps = timekeeper_v1 on every request, and nothing else (global headers)", () => {
    const options = appClientOptions();
    expect(options.global?.headers).toEqual({ "x-elo-platform": Platform.OS, "x-elo-client-caps": "timekeeper_v1" });
    expect(["ios", "android"]).toContain(options.global?.headers?.["x-elo-platform"]);
  });

  it("the headers sent are the exported SUPABASE_CLIENT_HEADERS (one place declares the capability)", () => {
    const options = appClientOptions();
    let exported: Record<string, string> | undefined;
    jest.isolateModules(() => {
      exported = require("@/lib/supabase/client").SUPABASE_CLIENT_HEADERS;
    });
    expect(options.global?.headers).toEqual(exported);
  });
});

describe("supabase-js carries the client headers on table writes and RPCs (spec 3.3)", () => {
  it("challenge insert, accept update and an RPC each send the platform and the capability", async () => {
    const headers = appClientOptions().global?.headers;
    const real = jest.requireActual("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
    const seen: { path: string; headers: Headers }[] = [];
    const fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ path: new URL(String(input)).pathname, headers: new Headers(init?.headers) });
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    });
    const client = real.createClient("http://localhost:54321", "anon-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers, fetch },
    });

    await client.from("challenges").insert({ challenger_id: "a", opponent_id: "b" });
    await client.from("challenges").update({ status: "accepted" }).eq("id", "c1");
    await client.rpc("start_match_from_challenge", { p_challenge_id: "c1" });

    expect(seen.map((s) => s.path)).toEqual(["/rest/v1/challenges", "/rest/v1/challenges", "/rest/v1/rpc/start_match_from_challenge"]);
    for (const s of seen) {
      expect([s.path, s.headers.get("x-elo-client-caps")]).toEqual([s.path, "timekeeper_v1"]);
      expect([s.path, s.headers.get("x-elo-platform")]).toEqual([s.path, Platform.OS]);
    }
  });
});
