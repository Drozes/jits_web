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

const mockSignOut = jest.fn(() => Promise.resolve({ error: null }));
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        cb("INITIAL_SESSION", { user: { id: "u-1" } });
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      signOut: () => mockSignOut(),
    },
  },
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
} from "@/lib/auth/auth-context";
import { useAuth } from "@/lib/auth/hooks";
import Index from "@/app/index";

const ACTIVE = { id: "me-1", auth_user_id: "u-1", display_name: "Me", current_elo: 1200, status: "active" };
const FAIL = { ok: false, error: { code: "UNKNOWN", message: "network" } };
const OK = (data: unknown) => ({ ok: true, data });

// Longer than any backoff step (the cap is 8s).
const PAST_BACKOFF = 10_000;

let refreshAthlete: (() => Promise<void>) | null = null;
function Probe() {
  const auth = useAuth();
  refreshAthlete = auth.refreshAthlete;
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
  refreshAthlete = null;
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

  it("offers Sign Out from the retry state", async () => {
    mockRead.mockResolvedValue(FAIL);
    const r = render(<App />);
    await flush();
    for (let i = 1; i < ATHLETE_LOAD_FAILURES_BEFORE_RETRY_UI; i++) await advance(PAST_BACKOFF);

    fireEvent.press(r.getByText("Sign Out"));
    await flush();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("refreshAthlete keeps the current athlete when its read fails", async () => {
    mockRead.mockResolvedValueOnce(OK(ACTIVE));
    const r = render(<App />);
    await flush();
    expect(r.getByTestId("athlete").props.children).toBe("active");

    mockRead.mockResolvedValueOnce(FAIL);
    await act(async () => {
      await refreshAthlete!();
    });
    expect(r.getByTestId("athlete").props.children).toBe("active");
    expect(r.getByTestId("redirect").props.children).toBe("/(app)/(home)");
  });

  it("refreshAthlete folds a thrown read into a failure, keeping the athlete", async () => {
    mockRead.mockResolvedValueOnce(OK(ACTIVE));
    const r = render(<App />);
    await flush();

    mockRead.mockRejectedValueOnce(new Error("socket hang up"));
    await act(async () => {
      await refreshAthlete!();
    });
    expect(r.getByTestId("athlete").props.children).toBe("active");
  });
});
