/**
 * Live location fixes 4.4: every mobile Supabase request carries
 * `x-elo-platform` (`ios` / `android`), read by the backend's
 * `_request_platform()`.
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

describe("mobile Supabase client", () => {
  it("sends x-elo-platform = Platform.OS on every request (global headers)", () => {
    jest.isolateModules(() => {
      require("@/lib/supabase/client");
    });
    const options = mockCreateClient.mock.calls[0][2] as { global?: { headers?: Record<string, string> } };
    expect(options.global?.headers).toEqual({ "x-elo-platform": Platform.OS });
    expect(["ios", "android"]).toContain(options.global?.headers?.["x-elo-platform"]);
  });
});
