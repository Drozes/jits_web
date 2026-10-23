/**
 * Modal precedence for the asked person (timekeeper mode M2, spec 9.1,
 * review product M3): the Arena owner mounts the timekeeper request
 * listener once, holds the incoming-challenge prompt while the timekeep sheet
 * is open (the same gate as a match screen, but the challenge is kept, never
 * dropped) and shows it once the sheet closes; and while the prompt, a
 * blocked start's sheet, the Go Live location sheet, the drift prompt or a
 * match screen is up, or a root route outside `(app)` is on top, the
 * listener is told to hold a new request until it closes; while the prompt
 * or a blocked start's sheet is up (not for a match screen), a TK-N1 tap is
 * held too.
 */
import * as React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, render, renderHook } from "@testing-library/react-native";
import { NavigationContext } from "@react-navigation/native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/arena/match-location-flag", () => ({
  useMatchLocationRequired: () => false,
  readMatchLocationRequired: () => Promise.resolve(false),
  markMatchLocationRequired: jest.fn(),
}));
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    BottomSheetModal: R.forwardRef((props: { children: React.ReactNode }, ref: unknown) => {
      R.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return R.createElement(RN.View, {}, props.children);
    }),
    BottomSheetView: (props: { children: React.ReactNode }) => R.createElement(RN.View, {}, props.children),
  };
});
jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "light",
  useThemedTokens: () => ({ bgSecondary: "#13151B", textTertiary: "#8D929D" }),
}));
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({
    athlete: { id: "me-1", display_name: "Me", current_elo: 1200, current_weight: 180, looking_for_ranked: false, status: "active" },
    refreshAthleteSoft: () => Promise.resolve(),
  }),
}));
jest.mock("@/lib/match-flow/active-match-store", () => ({ useActiveMatchOwner: jest.fn() }));
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useLobbyPresence: jest.fn(),
  useLobbyIds: () => new Set<string>(),
  useLobbyKnown: () => true,
}));
jest.mock("@/lib/arena/use-arena-live", () => ({
  useArenaLive: () => ({ isLive: true, isSaving: false, transition: null, lastWriteFailed: false, toggle: jest.fn(), goOffline: jest.fn() }),
}));
let mockIncoming: unknown = null;
let mockStartBlocked: unknown = null;
/** The prompt was tucked with Later: the challenge is kept, no prompt is drawn. */
let mockIncomingTucked = false;
jest.mock("@/lib/arena/use-arena-challenge", () => ({
  useArenaChallenge: () => ({
    incoming: mockIncoming,
    outgoing: null,
    incomingCount: mockIncoming ? 1 : 0,
    incomingTucked: mockIncomingTucked,
    startBlocked: mockStartBlocked,
    tuckIncoming: jest.fn(),
    reopenIncoming: jest.fn(),
    beginManualOffline: jest.fn(() => jest.fn()),
    noteIncomingRead: jest.fn(),
    isBusy: false,
    capReached: false,
    sendChallenge: jest.fn(),
    accept: jest.fn(),
    decline: jest.fn(),
    cancelOutgoing: jest.fn(),
    clearCap: jest.fn(),
    offerIncoming: jest.fn(),
    restoreOutgoing: jest.fn(),
    retryBlockedStart: jest.fn(),
    cancelBlockedStart: jest.fn(),
  }),
}));
jest.mock("@/lib/arena/use-pending-challenge-recovery", () => ({ usePendingChallengeRecovery: jest.fn() }));
/** The drift prompt's `blocked` input, as the Arena owner passes it on each render. */
const mockDriftBlocked: boolean[] = [];
jest.mock("@/components/arena/drift-prompt-sheet", () => ({
  DriftPromptSheet: ({ blocked }: { blocked: boolean }) => {
    mockDriftBlocked.push(blocked);
    return null;
  },
}));
/** The drift prompt (flag off by default), as `useDriftPrompt` reads it. */
let mockDriftPrompt: unknown = null;
jest.mock("@/lib/arena/use-live-drift-check", () => ({
  ...jest.requireActual("@/lib/arena/use-live-drift-check"),
  useDriftPrompt: () => mockDriftPrompt,
}));
const mockListener = jest.fn();
jest.mock("@/lib/match-flow/use-incoming-timekeeper-requests", () => ({
  ...jest.requireActual("@/lib/match-flow/use-incoming-timekeeper-requests"),
  useIncomingTimekeeperRequests: (args: unknown) => mockListener(args),
}));

import { ArenaBootstrap } from "@/lib/arena/arena-bootstrap";
import { __resetArenaStoreForTests, useArenaMatchScreen } from "@/lib/arena/arena-store";
import { __resetIncomingTimekeeperRequestsForTests } from "@/lib/match-flow/use-incoming-timekeeper-requests";
import { isTimekeepTapHeld, useTimekeepSheetScreen } from "@/lib/match-flow/timekeep-sheet-store";
import { __resetGoLiveLocationForTests, closeGoLiveSheet, presentGoLiveLocation } from "@/lib/arena/go-live-location";

const RIVAL = { challengeId: "ch-1", challengerId: "a-9", challengerName: "Rival", challengerElo: 1350, challengerWeight: 190 };

/** The timekeep route's sheet, as far as precedence goes: it marks itself open. */
function Sheet() {
  useTimekeepSheetScreen("m-1", "q1");
  return null;
}

/** The prompt's offline banner reads the connection once it mounts. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setImmediate(r));
  });
}

const lastHeld = () => (mockListener.mock.calls[mockListener.mock.calls.length - 1][0] as { held: boolean }).held;

/**
 * The root Stack's `(app)` route, as the Arena owner (mounted beside the
 * `(app)` Stack) sees it: focused unless a root route (a root modal such as
 * the legal documents) is on top.
 */
function rootAppRoute() {
  let focused = true;
  const subs = { focus: new Set<() => void>(), blur: new Set<() => void>() };
  return {
    navigation: {
      isFocused: () => focused,
      addListener: (event: "focus" | "blur", cb: () => void) => {
        subs[event].add(cb);
        return () => subs[event].delete(cb);
      },
    },
    setOnTop(next: boolean) {
      focused = next;
      act(() => subs[next ? "focus" : "blur"].forEach((cb) => cb()));
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetArenaStoreForTests();
  __resetIncomingTimekeeperRequestsForTests();
  mockIncoming = null;
  mockStartBlocked = null;
  mockIncomingTucked = false;
  mockDriftBlocked.length = 0;
  mockDriftPrompt = null;
  __resetGoLiveLocationForTests();
});

describe("ArenaBootstrap: the asked person's modal precedence", () => {
  it("mounts the timekeeper request listener for the signed-in athlete", () => {
    render(<ArenaBootstrap />);
    expect(mockListener).toHaveBeenCalledWith({ athleteId: "me-1", held: false, live: true });
  });

  it("is the listener's only mount point: no screen or other hook mounts a second one", () => {
    // Source scan, like the other guards: a second call site would open a
    // second channel and could open a request's sheet twice.
    const app = join(__dirname, "..", "..", "..");
    const sources = (dir: string): string[] =>
      readdirSync(join(app, dir)).flatMap((name) => {
        const rel = join(dir, name);
        if (statSync(join(app, rel)).isDirectory()) return sources(rel);
        return /\.(ts|tsx)$/.test(name) ? [rel] : [];
      });
    const callers = ["app", "components", "lib"]
      .flatMap(sources)
      .filter((rel) => /\buseIncomingTimekeeperRequests\s*\(/.test(readFileSync(join(app, rel), "utf8")))
      .filter((rel) => rel !== join("lib", "match-flow", "use-incoming-timekeeper-requests.ts"));
    expect(callers).toEqual([join("lib", "arena", "arena-bootstrap.tsx")]);
  });

  it("holds the incoming challenge prompt while the timekeep sheet is open, and shows it after", async () => {
    mockIncoming = RIVAL;
    const s = render(
      <>
        <ArenaBootstrap />
        <Sheet />
      </>,
    );
    expect(s.queryByText("Rival is live in the Arena")).toBeNull();
    s.rerender(<ArenaBootstrap />);
    await settle();
    s.getByText("Rival is live in the Arena");
    s.getByLabelText("Accept challenge");
  });

  it("holds the drift prompt while the timekeep sheet is open (never two modals), and frees it after", () => {
    const s = render(
      <>
        <ArenaBootstrap />
        <Sheet />
      </>,
    );
    expect(mockDriftBlocked[mockDriftBlocked.length - 1]).toBe(true);
    s.rerender(<ArenaBootstrap />);
    expect(mockDriftBlocked[mockDriftBlocked.length - 1]).toBe(false);
  });

  it("the open timekeep sheet does not take the athlete out of the Arena (the challenge is kept, not dropped)", async () => {
    mockIncoming = RIVAL;
    const s = render(
      <>
        <ArenaBootstrap />
        <Sheet />
      </>,
    );
    // Only a match screen counts as in a match.
    expect(lastHeld()).toBe(false);
    s.rerender(<ArenaBootstrap />);
    await settle();
    s.getByText("Rival is live in the Arena");
  });

  it("while the challenge prompt is up, a new timekeeper request is held", async () => {
    mockIncoming = RIVAL;
    const s = render(<ArenaBootstrap />);
    await settle();
    s.getByText("Rival is live in the Arena");
    expect(lastHeld()).toBe(true);
  });

  it("a challenge tucked with Later draws no prompt, so it holds neither a new timekeeper request nor a TK-N1 tap", async () => {
    mockIncoming = RIVAL;
    mockIncomingTucked = true;
    const s = render(<ArenaBootstrap />);
    await settle();
    expect(s.queryByText("Rival is live in the Arena")).toBeNull();
    expect(lastHeld()).toBe(false);
    expect(isTimekeepTapHeld()).toBe(false);
    // Reopened: the prompt is up again and holds both.
    mockIncomingTucked = false;
    s.rerender(<ArenaBootstrap />);
    await settle();
    s.getByText("Rival is live in the Arena");
    expect(lastHeld()).toBe(true);
    expect(isTimekeepTapHeld()).toBe(true);
  });

  it("while a blocked start's sheet is up, a new timekeeper request is held", () => {
    mockStartBlocked = { reason: "not_together" };
    render(<ArenaBootstrap />);
    expect(lastHeld()).toBe(true);
  });

  it("holds a TK-N1 tap while the challenge prompt is up, and releases it when the prompt closes", async () => {
    mockIncoming = RIVAL;
    const s = render(<ArenaBootstrap />);
    await settle();
    expect(isTimekeepTapHeld()).toBe(true);
    mockIncoming = null;
    s.rerender(<ArenaBootstrap />);
    expect(isTimekeepTapHeld()).toBe(false);
  });

  it("holds a TK-N1 tap while a blocked start's sheet is up, and releases it on unmount (sign-out)", () => {
    mockStartBlocked = { reason: "not_together" };
    const s = render(<ArenaBootstrap />);
    expect(isTimekeepTapHeld()).toBe(true);
    s.unmount();
    expect(isTimekeepTapHeld()).toBe(false);
  });

  it("a match screen alone holds no TK-N1 tap (its request lapses in 2 minutes)", () => {
    render(<ArenaBootstrap />);
    const match = renderHook(() => useArenaMatchScreen());
    expect(isTimekeepTapHeld()).toBe(false);
    act(() => match.unmount());
  });

  it("while a match screen is mounted, a new timekeeper request is held", () => {
    render(<ArenaBootstrap />);
    expect(lastHeld()).toBe(false);
    const match = renderHook(() => useArenaMatchScreen());
    expect(lastHeld()).toBe(true);
    act(() => match.unmount());
    expect(lastHeld()).toBe(false);
  });

  it("while a root route outside (app) is on top (the legal documents), a new request is held, and released when (app) is back", () => {
    // A push from there would stack a second (app), with a second Arena owner.
    const root = rootAppRoute();
    render(
      <NavigationContext.Provider value={root.navigation as never}>
        <ArenaBootstrap />
      </NavigationContext.Provider>,
    );
    expect(lastHeld()).toBe(false);
    root.setOnTop(false);
    expect(lastHeld()).toBe(true);
    // Not a modal of the Arena's: a TK-N1 tap (the athlete's own) is not held.
    expect(isTimekeepTapHeld()).toBe(false);
    root.setOnTop(true);
    expect(lastHeld()).toBe(false);
  });

  it("while the Go Live location sheet is up, a new timekeeper request is held, and released when it closes", () => {
    render(<ArenaBootstrap />);
    expect(lastHeld()).toBe(false);
    act(() => {
      void presentGoLiveLocation("unavailable");
    });
    expect(lastHeld()).toBe(true);
    act(() => closeGoLiveSheet());
    expect(lastHeld()).toBe(false);
  });

  it("while the drift prompt is up, a new timekeeper request is held, and released when it is answered", () => {
    const s = render(<ArenaBootstrap />);
    expect(lastHeld()).toBe(false);
    mockDriftPrompt = { athleteId: "me-1", reading: { latitude: 0, longitude: 0, accuracy: 10 }, capturedAt: 0, busy: false };
    s.rerender(<ArenaBootstrap />);
    expect(lastHeld()).toBe(true);
    mockDriftPrompt = null;
    s.rerender(<ArenaBootstrap />);
    expect(lastHeld()).toBe(false);
  });
});
