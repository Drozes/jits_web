/**
 * The post-match athlete refresh must never null the athlete (jits-tlk3).
 *
 * A null athlete is fatal for a background refresh: `useRequireAthlete` on
 * the still-mounted tabs would
 * `router.replace("/profile-setup")` and `ArenaBootstrap` would unmount its
 * owner, dropping live state and presence.
 *
 * This renders the REAL AuthProvider and the REAL ArenaBootstrap (with the
 * owner's network hooks stubbed) and drives a match exit through the real
 * arena store, so the whole chain is under test: exit count, bootstrap
 * effect, refreshAthleteSoft, provider state, and the guard hook.
 */
import * as React from "react";
import { Text } from "react-native";
import { act, render } from "@testing-library/react-native";

// ---- auth provider dependencies ----

// Resolves to a row, or to `null` for a failed read (a network blip). The
// provider reads through the Result variant, so a null here is `{ ok: false }`.
const mockGetCurrentAthlete = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getCurrentAthleteResult: async (...a: unknown[]) => {
    const row = await mockGetCurrentAthlete(...a);
    return row
      ? { ok: true, data: row }
      : { ok: false, error: { code: "UNKNOWN", message: "blip" } };
  },
}));

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        cb("INITIAL_SESSION", { user: { id: "u-1" } });
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  },
}));

jest.mock("@/lib/splash/elo-cache", () => ({ setCachedElo: jest.fn(() => Promise.resolve()) }));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

// ---- arena owner stubs (network-free) ----

jest.mock("@/components/arena/challenge-prompt-sheet", () => ({
  ChallengePromptSheet: () => null,
}));

let mockOwnerMounts = 0;
let mockOwnerUnmounts = 0;
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useLobbyPresence: () => {
    const R = require("react");
    R.useEffect(() => {
      mockOwnerMounts += 1;
      return () => {
        mockOwnerUnmounts += 1;
      };
    }, []);
  },
  useLobbyIds: () => new Set<string>(),
}));
jest.mock("@/lib/arena/use-arena-live", () => ({
  useArenaLive: () => ({ isLive: true, isSaving: false, toggle: jest.fn(), goOffline: jest.fn() }),
}));
jest.mock("@/lib/arena/use-arena-challenge", () => ({
  useArenaChallenge: () => ({
    incoming: null,
    outgoing: null,
    isBusy: false,
    capReached: false,
    sendChallenge: jest.fn(),
    accept: jest.fn(),
    decline: jest.fn(),
    cancelOutgoing: jest.fn(),
    clearCap: jest.fn(),
    offerIncoming: jest.fn(),
    restoreOutgoing: jest.fn(),
  }),
}));
jest.mock("@/lib/arena/use-pending-challenge-recovery", () => ({
  usePendingChallengeRecovery: () => {},
}));

import { AuthProvider } from "@/lib/auth/auth-context";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { ArenaBootstrap } from "@/lib/arena/arena-bootstrap";
import { useArenaMatchScreen } from "@/lib/arena/arena-store";

const ATHLETE = {
  id: "me-1",
  auth_user_id: "u-1",
  display_name: "Me",
  current_elo: 1200,
  current_weight: 180,
  looking_for_ranked: true,
  status: "active",
};

/** Stands in for a tab screen that stays mounted under the match. */
function TabScreen() {
  const { athlete } = useRequireAthlete();
  return <Text testID="elo">{athlete ? String(athlete.current_elo) : "none"}</Text>;
}

function MatchScreen() {
  useArenaMatchScreen();
  return null;
}

function App({ inMatch }: { inMatch: boolean }) {
  return (
    <AuthProvider>
      <TabScreen />
      {inMatch ? <MatchScreen /> : null}
      <ArenaBootstrap />
    </AuthProvider>
  );
}

const flush = () => act(async () => {});

beforeEach(() => {
  jest.clearAllMocks();
  mockOwnerMounts = 0;
  mockOwnerUnmounts = 0;
});

async function mountThenLeaveMatch() {
  mockGetCurrentAthlete.mockResolvedValueOnce(ATHLETE);
  const r = render(<App inMatch />);
  await flush();
  expect(r.getByTestId("elo").props.children).toBe("1200");
  expect(mockOwnerMounts).toBe(1);
  expect(mockGetCurrentAthlete).toHaveBeenCalledTimes(1);
  return r;
}

describe("post-match athlete refresh", () => {
  it("keeps the athlete, the tabs and the Arena owner when the re-read fails", async () => {
    const r = await mountThenLeaveMatch();

    mockGetCurrentAthlete.mockResolvedValueOnce(null); // network blip
    r.rerender(<App inMatch={false} />);
    await flush();

    expect(mockGetCurrentAthlete).toHaveBeenCalledTimes(2);
    expect(r.getByTestId("elo").props.children).toBe("1200");
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockOwnerUnmounts).toBe(0);
    expect(mockOwnerMounts).toBe(1);
  });

  it("applies a successful re-read (the new rating shows)", async () => {
    const r = await mountThenLeaveMatch();

    mockGetCurrentAthlete.mockResolvedValueOnce({ ...ATHLETE, current_elo: 1216 });
    r.rerender(<App inMatch={false} />);
    await flush();

    expect(r.getByTestId("elo").props.children).toBe("1216");
    expect(mockReplace).not.toHaveBeenCalled();
    // Same athlete id: the owner is kept, not remounted.
    expect(mockOwnerUnmounts).toBe(0);
  });
});
