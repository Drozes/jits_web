/**
 * Token auto-refresh pause / resume around a failed sign-out (jits-oz9q),
 * lib/supabase/client.ts.
 *
 * On React Native auth-js starts its refresh ticker once at initialization
 * and never restarts it, so a stop is permanent unless the app restarts it.
 * The client restarts a pause it made on the next SIGNED_IN, or on a
 * foreground that finds a NEW stored session. A leftover session (the
 * sign-out's clear failed) must never be resumed: that would refresh it and
 * sign the user back in.
 */

const mockStart = jest.fn(async () => undefined);
const mockStop = jest.fn(async () => undefined);
const mockGetSession = jest.fn();
let mockAuthListener: ((event: string) => void) | null = null;
let mockAppStateListener: ((state: string) => void) | null = null;
/** The raw value SecureStore holds under the session key. */
let mockStored: string | null = null;
const mockGetItem = jest.fn(async (_key: string) => mockStored);

jest.mock("@supabase/supabase-js", () => ({
  processLock: jest.fn(),
  createClient: () => ({
    auth: {
      storageKey: "sb-test-auth-token",
      startAutoRefresh: () => mockStart(),
      stopAutoRefresh: () => mockStop(),
      getSession: () => mockGetSession(),
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
jest.mock("@/lib/supabase/secure-storage", () => ({
  SecureStoreAdapter: { getItem: (key: string) => mockGetItem(key) },
}));

function loadClient(): typeof import("@/lib/supabase/client") {
  let mod: typeof import("@/lib/supabase/client") | undefined;
  jest.isolateModules(() => {
    mod = require("@/lib/supabase/client");
  });
  return mod!;
}

/** Fire a foreground and let the async stored-session read settle. */
async function foreground() {
  mockAppStateListener?.("active");
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

const OLD = '{"refresh_token":"old"}';
const NEW = '{"refresh_token":"new"}';

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthListener = null;
  mockAppStateListener = null;
  mockStored = null;
});

describe("auth auto-refresh pause / resume", () => {
  it("never touches auth-js's own ticker without a pause", async () => {
    mockStored = OLD;
    loadClient();
    mockAuthListener?.("SIGNED_IN");
    await foreground();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
  });

  it("pausing stops the ticker, and the next SIGNED_IN restarts it once", async () => {
    mockStored = OLD;
    const { pauseAuthAutoRefresh } = loadClient();
    await pauseAuthAutoRefresh();
    expect(mockStop).toHaveBeenCalledTimes(1);
    mockStored = null; // the sign-out's clear succeeded

    mockAuthListener?.("TOKEN_REFRESHED");
    mockAuthListener?.("SIGNED_OUT");
    expect(mockStart).not.toHaveBeenCalled();

    mockStored = NEW;
    mockAuthListener?.("SIGNED_IN");
    expect(mockStart).toHaveBeenCalledTimes(1);
    // Resumed, so a later foreground does not churn it again.
    await foreground();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("a foreground with NO stored session stays paused", async () => {
    mockStored = OLD;
    const { pauseAuthAutoRefresh } = loadClient();
    await pauseAuthAutoRefresh();
    mockStored = null;
    await foreground();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("a foreground with the LEFTOVER session (clear failed) stays paused", async () => {
    mockStored = OLD;
    const { pauseAuthAutoRefresh } = loadClient();
    await pauseAuthAutoRefresh();
    // clearPersistedSession failed: the same session is still on disk.
    await foreground();
    await foreground();
    expect(mockStart).not.toHaveBeenCalled();
    // And it never asks auth-js for the session: getSession() would itself
    // refresh an expired one, the exact write this guards against.
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockGetItem).toHaveBeenCalledWith("sb-test-auth-token");
  });

  it("a foreground with a NEW stored session restarts it (backstop for a missed SIGNED_IN)", async () => {
    mockStored = OLD;
    const { pauseAuthAutoRefresh } = loadClient();
    await pauseAuthAutoRefresh();
    mockStored = null;
    mockAppStateListener?.("background");
    mockAppStateListener?.("inactive");
    mockStored = NEW;
    await foreground();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("an unreadable store counts as no session", async () => {
    const { pauseAuthAutoRefresh } = loadClient();
    await pauseAuthAutoRefresh();
    mockGetItem.mockRejectedValueOnce(new Error("keychain locked"));
    await foreground();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("a failed stop is swallowed so the sign-out still clears the session", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockStop.mockRejectedValueOnce(new Error("boom"));
    const { pauseAuthAutoRefresh } = loadClient();
    await expect(pauseAuthAutoRefresh()).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it("exposes the session storage key auth-js uses", () => {
    expect(loadClient().authStorageKey()).toBe("sb-test-auth-token");
  });
});
