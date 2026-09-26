/**
 * Token auto-refresh pause / resume around a failed sign-out (jits-oz9q),
 * lib/supabase/client.ts.
 *
 * On React Native auth-js starts its refresh ticker once at initialization
 * and never restarts it, so a stop is permanent unless the app restarts it.
 * The client restarts a pause it made on the next SIGNED_IN or foreground,
 * and leaves auth-js's own ticker alone otherwise.
 */

const mockStart = jest.fn(async () => undefined);
const mockStop = jest.fn(async () => undefined);
let mockAuthListener: ((event: string) => void) | null = null;
let mockAppStateListener: ((state: string) => void) | null = null;

jest.mock("@supabase/supabase-js", () => ({
  processLock: jest.fn(),
  createClient: () => ({
    auth: {
      startAutoRefresh: () => mockStart(),
      stopAutoRefresh: () => mockStop(),
      onAuthStateChange: (cb: (event: string) => void) => {
        mockAuthListener = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  }),
}));

jest.mock("react-native", () => ({
  AppState: {
    addEventListener: (_: string, cb: (state: string) => void) => {
      mockAppStateListener = cb;
      return { remove: jest.fn() };
    },
  },
}));

jest.mock("react-native-url-polyfill/auto", () => ({}));
jest.mock("@/lib/env", () => ({ env: { supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "k" } }));
jest.mock("@/lib/supabase/secure-storage", () => ({ SecureStoreAdapter: {} }));

function loadClient(): typeof import("@/lib/supabase/client") {
  let mod: typeof import("@/lib/supabase/client") | undefined;
  jest.isolateModules(() => {
    mod = require("@/lib/supabase/client");
  });
  return mod!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthListener = null;
  mockAppStateListener = null;
});

describe("auth auto-refresh pause / resume", () => {
  it("never touches auth-js's own ticker without a pause", () => {
    loadClient();
    mockAuthListener?.("SIGNED_IN");
    mockAppStateListener?.("active");
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
  });

  it("pausing stops the ticker, and the next SIGNED_IN restarts it once", async () => {
    const { pauseAuthAutoRefresh } = loadClient();
    await pauseAuthAutoRefresh();
    expect(mockStop).toHaveBeenCalledTimes(1);

    mockAuthListener?.("TOKEN_REFRESHED");
    mockAuthListener?.("SIGNED_OUT");
    expect(mockStart).not.toHaveBeenCalled();

    mockAuthListener?.("SIGNED_IN");
    expect(mockStart).toHaveBeenCalledTimes(1);
    // Resumed, so a later foreground does not churn it again.
    mockAppStateListener?.("active");
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("the next foreground restarts a paused ticker (backstop)", async () => {
    const { pauseAuthAutoRefresh } = loadClient();
    await pauseAuthAutoRefresh();
    mockAppStateListener?.("background");
    mockAppStateListener?.("inactive");
    expect(mockStart).not.toHaveBeenCalled();
    mockAppStateListener?.("active");
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("a failed stop is swallowed so the sign-out still clears the session", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockStop.mockRejectedValueOnce(new Error("boom"));
    const { pauseAuthAutoRefresh } = loadClient();
    await expect(pauseAuthAutoRefresh()).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
