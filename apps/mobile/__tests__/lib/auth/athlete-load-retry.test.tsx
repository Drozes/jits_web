/**
 * A failed cold-start athlete read is NOT "no athlete".
 *
 * `getCurrentAthlete` folds every error into `null`, and `app/index.tsx` sends
 * a signed-in user with a null athlete to /profile-setup. On a flaky cold
 * start that bounced an ACTIVE athlete into the setup wizard, whose submit
 * then took the INSERT path and died on RLS. The provider now reads through
 * `getCurrentAthleteResult`, holds the loading gate while the read fails,
 * retries with backoff, and after a few failures `Index` shows a retry state.
 *
 * Renders the REAL AuthProvider and the REAL Index route.
 */
import * as React from "react";
import { Text } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

const mockRead = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getCurrentAthleteResult: (...a: unknown[]) => mockRead(...a),
}));

const mockSignOut = jest.fn<Promise<{ error: unknown }>, []>();
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      storageKey: "sb-test-auth-token",
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        cb("INITIAL_SESSION", { user: { id: "u-1" } });
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      signOut: () => mockSignOut(),
    },
  },
}));

const mockRemoveItem = jest.fn((_key: string) => Promise.resolve());
jest.mock("@/lib/supabase/secure-storage", () => ({
  SecureStoreAdapter: { removeItem: (key: string) => mockRemoveItem(key) },
}));

jest.mock("@/lib/splash/elo-cache", () => ({ setCachedElo: jest.fn(() => Promise.resolve()) }));
jest.mock("@/lib/arena/arena-store", () => ({
  takeArenaOfflineBeforeSignOut: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.Text, { testID: "redirect" }, href);
  },
}));

import {
  ATHLETE_LOAD_FAILURES_BEFORE_RETRY_UI,
  AuthProvider,
  type AuthState,
} from "@/lib/auth/auth-context";
import { useAuth } from "@/lib/auth/hooks";
import Index from "@/app/index";

const ACTIVE = { id: "me-1", auth_user_id: "u-1", display_name: "Me", current_elo: 1200, status: "active" };
const FAIL = { ok: false, error: { code: "UNKNOWN", message: "network" } };
const OK = (data: unknown) => ({ ok: true, data });

// Longer than any backoff step (the cap is 8s).
const PAST_BACKOFF = 10_000;

let refreshAthlete: AuthState["refreshAthlete"] | null = null;
let signOut: AuthState["signOut"] | null = null;
function Probe() {
  const auth = useAuth();
  refreshAthlete = auth.refreshAthlete;
  signOut = auth.signOut;
  return <Text testID="athlete">{auth.athlete ? auth.athlete.status : "none"}</Text>;
}

function App() {
  return (
    <AuthProvider>
      <Index />
      <Probe />
    </AuthProvider>
  );
}

const flush = () => act(async () => {});
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRead.mockReset();
  mockSignOut.mockReset();
  mockSignOut.mockResolvedValue({ error: null });
  refreshAthlete = null;
  signOut = null;
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("cold-start athlete load", () => {
  it("never redirects an active athlete to /profile-setup when the first reads fail", async () => {
    mockRead.mockResolvedValueOnce(FAIL).mockResolvedValueOnce(FAIL).mockResolvedValue(OK(ACTIVE));
    const r = render(<App />);
    await flush();

    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(r.queryByTestId("redirect")).toBeNull();
    expect(r.getByText("Loading...")).toBeTruthy();

    await advance(PAST_BACKOFF);
    expect(mockRead).toHaveBeenCalledTimes(2);
    expect(r.queryByTestId("redirect")).toBeNull();

    await advance(PAST_BACKOFF);
    expect(mockRead).toHaveBeenCalledTimes(3);
    expect(r.getByTestId("redirect").props.children).toBe("/(app)/(home)");
  });

  it("still sends a user with genuinely no athlete row to /profile-setup", async () => {
    mockRead.mockResolvedValue(OK(null));
    const r = render(<App />);
    await flush();
    expect(r.getByTestId("redirect").props.children).toBe("/profile-setup");
  });

  it("shows a retry state after repeated failures, and Try Again reads immediately", async () => {
    mockRead.mockResolvedValue(FAIL);
    const r = render(<App />);
    await flush();

    for (let i = 1; i < ATHLETE_LOAD_FAILURES_BEFORE_RETRY_UI; i++) {
      expect(r.queryByTestId("athlete-load-retry")).toBeNull();
      await advance(PAST_BACKOFF);
    }
    expect(mockRead).toHaveBeenCalledTimes(ATHLETE_LOAD_FAILURES_BEFORE_RETRY_UI);
    expect(r.getByTestId("athlete-load-retry")).toBeTruthy();
    expect(r.queryByTestId("redirect")).toBeNull();

    mockRead.mockResolvedValue(OK(ACTIVE));
    fireEvent.press(r.getByTestId("athlete-load-retry"));
    await flush();

    expect(mockRead).toHaveBeenCalledTimes(ATHLETE_LOAD_FAILURES_BEFORE_RETRY_UI + 1);
    expect(r.queryByTestId("athlete-load-retry")).toBeNull();
    expect(r.getByTestId("redirect").props.children).toBe("/(app)/(home)");
  });

  it("offers Sign Out from the retry state, which lands on /login", async () => {
    mockRead.mockResolvedValue(FAIL);
    const r = render(<App />);
    await flush();
    for (let i = 1; i < ATHLETE_LOAD_FAILURES_BEFORE_RETRY_UI; i++) await advance(PAST_BACKOFF);

    fireEvent.press(r.getByText("Sign Out"));
    await flush();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(r.getByTestId("redirect").props.children).toBe("/login");
    // A clean sign-out removed the session itself.
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it("a Sign Out that fails offline still lands on /login and clears the stored session", async () => {
    mockRead.mockResolvedValue(FAIL);
    mockSignOut.mockResolvedValueOnce({ error: { message: "Network request failed" } });
    const r = render(<App />);
    await flush();
    for (let i = 1; i < ATHLETE_LOAD_FAILURES_BEFORE_RETRY_UI; i++) await advance(PAST_BACKOFF);
    expect(r.getByTestId("athlete-load-retry")).toBeTruthy();

    fireEvent.press(r.getByText("Sign Out"));
    await flush();

    expect(r.getByTestId("redirect").props.children).toBe("/login");
    expect(r.queryByText("Loading...")).toBeNull();
    expect(mockRemoveItem.mock.calls.map((c) => c[0])).toEqual([
      "sb-test-auth-token",
      "sb-test-auth-token-code-verifier",
      "sb-test-auth-token-user",
    ]);
    // The retry loop stopped with the user gone.
    const reads = mockRead.mock.calls.length;
    await advance(PAST_BACKOFF);
    expect(mockRead.mock.calls.length).toBe(reads);
  });

  it("a Sign Out that throws is treated the same way", async () => {
    mockRead.mockResolvedValue(OK(ACTIVE));
    mockSignOut.mockRejectedValueOnce(new Error("offline"));
    const r = render(<App />);
    await flush();

    await act(async () => {
      await signOut!();
    });
    expect(r.getByTestId("redirect").props.children).toBe("/login");
    expect(mockRemoveItem).toHaveBeenCalledWith("sb-test-auth-token");
  });
});

describe("refreshAthlete", () => {
  it("keeps the current athlete when both reads fail, and reports failure", async () => {
    mockRead.mockResolvedValueOnce(OK(ACTIVE)).mockResolvedValue(FAIL);
    const r = render(<App />);
    await flush();
    expect(r.getByTestId("athlete").props.children).toBe("active");

    let ok: boolean | undefined;
    await act(async () => {
      ok = await refreshAthlete!();
    });
    expect(ok).toBe(false);
    expect(mockRead).toHaveBeenCalledTimes(3); // load + read + one retry
    expect(r.getByTestId("athlete").props.children).toBe("active");
    expect(r.getByTestId("redirect").props.children).toBe("/(app)/(home)");
  });

  it("retries once and applies the second read", async () => {
    const PENDING = { ...ACTIVE, status: "pending" };
    mockRead
      .mockResolvedValueOnce(OK(PENDING))
      .mockResolvedValueOnce(FAIL)
      .mockResolvedValueOnce(OK(ACTIVE));
    const r = render(<App />);
    await flush();
    expect(r.getByTestId("redirect").props.children).toBe("/profile-setup");

    let ok: boolean | undefined;
    await act(async () => {
      ok = await refreshAthlete!();
    });
    expect(ok).toBe(true);
    expect(r.getByTestId("athlete").props.children).toBe("active");
  });

  it("applies the caller's verified row when both reads fail (post-activation)", async () => {
    const PENDING = { ...ACTIVE, status: "pending" };
    mockRead.mockResolvedValueOnce(OK(PENDING)).mockResolvedValue(FAIL);
    const r = render(<App />);
    await flush();
    expect(r.getByTestId("athlete").props.children).toBe("pending");

    await act(async () => {
      await refreshAthlete!(ACTIVE as never);
    });
    expect(r.getByTestId("athlete").props.children).toBe("active");
    expect(r.getByTestId("redirect").props.children).toBe("/(app)/(home)");
  });

  it("folds a thrown read into a failure, keeping the athlete", async () => {
    mockRead.mockResolvedValueOnce(OK(ACTIVE)).mockRejectedValue(new Error("socket hang up"));
    const r = render(<App />);
    await flush();

    await act(async () => {
      await refreshAthlete!();
    });
    expect(r.getByTestId("athlete").props.children).toBe("active");
  });
});

