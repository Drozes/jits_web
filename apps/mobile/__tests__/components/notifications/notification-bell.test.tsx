/**
 * The app-wide bell (jits-dq85.7, .8), tested end to end: the header
 * `NotificationBell` (components/notifications/notification-bell.tsx) together
 * with its host `BellBootstrap` (components/notifications/bell-bootstrap.tsx).
 * BellBootstrap's logic (boundary timer, re-sync, pathname close, row
 * routing) is covered here, since it only means anything behind a header bell.
 * The pure list helpers are in __tests__/lib/notifications/notification-items.test.ts.
 *
 * - four header bells + one BellBootstrap open ONE pending-challenges realtime
 *   channel and render ONE panel (AC-H14);
 * - the badge is FRESH incoming challenges (under ARENA_CHALLENGE_FRESH_MS)
 *   plus unseen reels; a 2-hour-old pending challenge is listed under
 *   "Missed" and not counted (AC-H15), and a fresh one drops out of the badge
 *   on its own when it goes stale;
 * - rows route: challenge rows (fresh and Missed) to /arena, match results
 *   to match detail, reels to the viewer; a tap closes the panel first;
 *   unread reels and fresh challenge rows carry a dot (Missed rows do not);
 * - the pending list is re-read in full on panel open, foreground and Home's
 *   pull-to-refresh (realtime does not replay missed events);
 * - a panel that closed itself (pan down, backdrop) reopens on the next tap;
 * - any navigation that is not a row tap (a push-notification deep link, the
 *   incoming-challenge sheet entering a match) closes the panel.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { AppState, View } from "react-native";
import { ARENA_CHALLENGE_FRESH_MS } from "@jits/shared/constants";

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockDismissTo = jest.fn();
let mockPathname = "/";
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, dismissTo: mockDismissTo }),
  usePathname: () => mockPathname,
  useFocusEffect: (cb: () => void) => {
    const R = require("react");
    R.useEffect(() => cb(), [cb]);
  },
}));

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: unknown, p: string) => (p === "__esModule" ? true : stub) });
});

const mockPresent = jest.fn();
const mockDismiss = jest.fn();
let mockSheetCount = 0;
let mockSheetOnChange: ((idx: number) => void) | null = null;
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    BottomSheetModal: R.forwardRef((props: { children: React.ReactNode; onChange?: (idx: number) => void }, ref: unknown) => {
      mockSheetOnChange = props.onChange ?? null;
      R.useEffect(() => {
        mockSheetCount += 1;
        return () => {
          mockSheetCount -= 1;
        };
      }, []);
      R.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: mockDismiss }));
      return R.createElement(RN.View, { testID: "sheet" }, props.children);
    }),
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: (p: { children: React.ReactNode }) => R.createElement(RN.View, {}, p.children),
  };
});

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#fff", textTertiary: "#888", bgSecondary: "#111", accentCta: "#E63946", statePositive: "#0f0" }),
}));

let mockAthlete: { id: string; status: string } | null = { id: "me", status: "active" };
jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ athlete: mockAthlete }) }));

// The real shared hook runs against this client, so the channel count is real.
type Row = Record<string, unknown>;
let mockPendingRows: Row[] = [];
const mockChannelNames: string[] = [];
const mockRemoveChannel = jest.fn();
jest.mock("@/lib/supabase/client", () => {
  const chain = (data: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gt", "order"]) c[m] = () => c;
    c.single = () => Promise.resolve({ data: { display_name: "Live Name" } });
    c.then = (resolve: (v: unknown) => unknown) => resolve({ data });
    return c;
  };
  return {
    supabase: {
      from: (table: string) => chain(table === "challenges" ? mockPendingRows : null),
      channel: (name: string) => {
        mockChannelNames.push(name);
        const ch: Record<string, unknown> = {};
        ch.on = () => ch;
        ch.subscribe = () => ch;
        return ch;
      },
      removeChannel: (...a: unknown[]) => mockRemoveChannel(...a),
    },
  };
});

let mockHistory: unknown[] = [];
let mockHighlights: unknown[] = [];
let mockUnseen = 0;
const mockRefresh = jest.fn();
jest.mock("@/hooks/use-notification-history", () => ({
  useNotificationHistory: () => ({
    history: mockHistory,
    highlights: mockHighlights,
    unseenHighlights: mockUnseen,
    refresh: mockRefresh,
  }),
}));

import { NotificationBell } from "@/components/notifications/notification-bell";
import { BellBootstrap } from "@/components/notifications/bell-bootstrap";
import {
  getFreshIncomingCountForTests,
  resetBellStore,
  useBellFocusCount,
  useBellOpen,
} from "@/lib/notifications/bell-store";
import {
  __resetArenaStoreForTests,
  notifyIncomingChallengeEnded,
  registerArenaController,
  type ArenaController,
} from "@/lib/arena/arena-store";
import { requestBellRefresh } from "@/lib/highlight/highlight-store";

declare const __dirname: string;

const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function pendingRow(id: string, ageMs: number, name: string): Row {
  return {
    id,
    created_at: ago(ageMs),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * MIN).toISOString(),
    match_type: "ranked",
    challenger: { display_name: name },
  };
}

const HIGHLIGHT_ROW = {
  type: "highlight_ready",
  id: "highlight-h1-v1",
  title: "Your highlight is ready",
  body: "Your reel vs Demo Red is ready to watch.",
  route: "/highlight/h1?source=bell",
  createdAt: ago(1 * MIN),
  unread: true,
};
const SEEN_HIGHLIGHT_ROW = {
  ...HIGHLIGHT_ROW,
  id: "highlight-h2-v1",
  body: "Your reel vs Demo Blue is ready to watch.",
  route: "/highlight/h2?source=bell",
  unread: false,
  createdAt: ago(2 * MIN),
};
const RESULT_ROW = {
  type: "match_result",
  id: "match-m1",
  title: "Match Won",
  body: "You defeated Demo Red (+12 ELO)",
  matchId: "m1",
  createdAt: ago(30 * MIN),
};

/** The four tab-root headers plus the one app-wide host, as the app mounts them. */
function App() {
  return (
    <View>
      <NotificationBell />
      <NotificationBell />
      <NotificationBell />
      <NotificationBell />
      <BellBootstrap />
    </View>
  );
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function renderApp() {
  const u = render(<App />);
  await settle();
  return u;
}

/** Captures the AppState listeners so a test can background and foreground the app. */
let appStateListeners: ((s: string) => void)[] = [];
function setAppState(next: "active" | "background") {
  for (const l of [...appStateListeners]) l(next);
}

/** Taps header bell `i` and lets the host's async re-reads land inside act. */
async function pressBell(u: ReturnType<typeof render>, i: number) {
  fireEvent.press(u.getAllByLabelText("Notifications")[i]);
  await settle();
}

function badgeTexts(u: ReturnType<typeof render>) {
  return u.queryAllByText(/^\d+\+?$/).map((n) => n.props.children);
}

beforeEach(() => {
  resetBellStore();
  mockPush.mockClear();
  mockNavigate.mockClear();
  mockDismissTo.mockClear();
  mockPathname = "/";
  mockPresent.mockClear();
  mockDismiss.mockClear();
  mockRefresh.mockClear();
  mockRemoveChannel.mockClear();
  mockChannelNames.length = 0;
  mockAthlete = { id: "me", status: "active" };
  mockPendingRows = [];
  mockHistory = [RESULT_ROW];
  mockHighlights = [HIGHLIGHT_ROW, SEEN_HIGHLIGHT_ROW];
  mockUnseen = 0;
  mockSheetOnChange = null;
  appStateListeners = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, l: (s: string) => void) => {
    appStateListeners.push(l);
    return {
      remove: () => {
        appStateListeners = appStateListeners.filter((x) => x !== l);
      },
    };
  }) as never);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("one bell app-wide (AC-H14)", () => {
  it("four header bells open one pending-challenges channel and one panel", async () => {
    const u = await renderApp();
    expect(mockChannelNames.filter((n) => n.startsWith("challenges-me"))).toHaveLength(1);
    expect(mockChannelNames).toHaveLength(1);
    expect(mockSheetCount).toBe(1);
    expect(u.getAllByLabelText("Notifications")).toHaveLength(4);
    u.unmount();
  });

  it("renders nothing and opens no channel for a pending athlete", async () => {
    mockAthlete = { id: "me", status: "pending" };
    const u = await renderApp();
    expect(mockChannelNames).toHaveLength(0);
    expect(mockSheetCount).toBe(0);
    u.unmount();
  });

  it("an inactive athlete still gets a working bell", async () => {
    mockAthlete = { id: "me", status: "inactive" };
    const u = await renderApp();
    expect(mockSheetCount).toBe(1);
    await pressBell(u, 0);
    expect(mockPresent).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    u.unmount();
  });

  it("a bell tapped with no host does nothing, and a host mounting later stays closed", async () => {
    mockAthlete = null;
    const u = await renderApp();
    expect(mockSheetCount).toBe(0);
    await pressBell(u, 0);
    mockAthlete = { id: "me", status: "active" };
    u.rerender(<App />);
    await settle();
    expect(mockSheetCount).toBe(1);
    expect(mockPresent).not.toHaveBeenCalled();
    u.unmount();
  });

  it("an athlete switch tears the old channel down and opens one for the new athlete", async () => {
    const u = await renderApp();
    mockAthlete = { id: "other", status: "active" };
    u.rerender(<App />);
    await settle();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
    expect(mockChannelNames.filter((n) => n.startsWith("challenges-other"))).toHaveLength(1);
    u.unmount();
  });

  it("any bell opens the one panel and forces a full re-read", async () => {
    const u = await renderApp();
    await pressBell(u, 2);
    expect(mockPresent).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    u.unmount();
  });

  it("a panel that closed itself (pan down / backdrop) reopens on the next bell tap", async () => {
    let open: boolean | null = null;
    function OpenProbe() {
      open = useBellOpen();
      return null;
    }
    const u = render(
      <View>
        <App />
        <OpenProbe />
      </View>,
    );
    await settle();
    await pressBell(u, 0);
    expect(mockPresent).toHaveBeenCalledTimes(1);
    expect(open).toBe(true);
    // The sheet reports it closed itself.
    act(() => {
      mockSheetOnChange?.(-1);
    });
    expect(open).toBe(false);
    // It already closed: no programmatic dismiss on top (the "dead bell" bug).
    expect(mockDismiss).not.toHaveBeenCalled();
    await pressBell(u, 3);
    expect(mockPresent).toHaveBeenCalledTimes(2);
    expect(mockRefresh).toHaveBeenCalledTimes(2);
    expect(open).toBe(true);
    u.unmount();
  });

  it("a focused header bumps the host's focus signal", async () => {
    let focus = -1;
    function Probe() {
      focus = useBellFocusCount();
      return null;
    }
    const u = render(
      <View>
        <NotificationBell />
        <Probe />
      </View>,
    );
    await settle();
    expect(focus).toBe(1);
    u.unmount();
  });
});

describe("BellBootstrap mount site", () => {
  it("is mounted exactly once, in the signed-in (app) layout", () => {
    const fs = require("fs") as {
      readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[];
      readFileSync: (p: string, e: string) => string;
    };
    const path = require("path") as { join: (...p: string[]) => string };
    const root = path.join(__dirname, "..", "..", "..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx$/.test(e.name) && fs.readFileSync(full, "utf8").includes("<BellBootstrap")) hits.push(full);
      }
    };
    walk(path.join(root, "app"));
    walk(path.join(root, "components"));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/app\/\(app\)\/_layout\.tsx$/);
  });
});

describe("fresh-only badge (AC-H15)", () => {
  it("counts fresh pending challenges plus unseen reels, on every bell", async () => {
    mockPendingRows = [pendingRow("c-fresh", 2 * MIN, "Alex"), pendingRow("c-old", 2 * 60 * MIN, "Bo")];
    mockUnseen = 1;
    const u = await renderApp();
    expect(badgeTexts(u)).toEqual(["2", "2", "2", "2"]);
    expect(u.getAllByLabelText("Notifications")[0].props.accessibilityValue).toEqual({ text: "2 new" });
  });

  it("shows no badge for a 2-hour-old pending challenge alone", async () => {
    mockPendingRows = [pendingRow("c-old", 2 * 60 * MIN, "Bo")];
    const u = await renderApp();
    expect(badgeTexts(u)).toEqual([]);
    expect(u.getAllByLabelText("Notifications")[0].props.accessibilityValue?.text).toBeUndefined();
  });

  it("caps the badge at 99+", async () => {
    mockUnseen = 150;
    const u = await renderApp();
    expect(badgeTexts(u)).toEqual(["99+", "99+", "99+", "99+"]);
  });

  it("drops a challenge from the badge when it goes stale, with no other event", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    mockPendingRows = [pendingRow("c1", ARENA_CHALLENGE_FRESH_MS - 30_000, "Alex")];
    const u = await renderApp();
    expect(badgeTexts(u)).toEqual(["1", "1", "1", "1"]);
    expect(u.queryByTestId("notification-missed")).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });
    expect(badgeTexts(u)).toEqual([]);
    // Now listed under Missed.
    expect(u.getByTestId("notification-missed")).toBeTruthy();
  });

  it("a timer that fires just before the boundary re-arms instead of stranding the badge", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    // Stale at exactly `ageMs` = FRESH + 1 past creation: 30s from now.
    mockPendingRows = [pendingRow("c1", ARENA_CHALLENGE_FRESH_MS - 30_000, "Alex")];
    const u = await renderApp();
    expect(badgeTexts(u)).toEqual(["1", "1", "1", "1"]);
    // Pull the clock back 50ms without firing timers: the armed timer now
    // fires while the clock still reads 50ms before the boundary.
    jest.setSystemTime(Date.now() - 50);
    await act(async () => {
      jest.advanceTimersByTime(30_001);
    });
    expect(badgeTexts(u)).toEqual(["1", "1", "1", "1"]); // still fresh: boundary - 49ms
    await act(async () => {
      jest.advanceTimersByTime(60);
    });
    expect(badgeTexts(u)).toEqual([]);
    expect(u.getByTestId("notification-missed")).toBeTruthy();
  });

  it("an expired challenge leaves the panel at its expiresAt, with no realtime event", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    mockPendingRows = [
      { ...pendingRow("c-old", 2 * 60 * MIN, "Bo"), expires_at: new Date(Date.now() + MIN).toISOString() },
    ];
    const u = await renderApp();
    expect(u.getByText("Bo sent you a ranked challenge")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(MIN + 1);
    });
    expect(u.queryByText("Bo sent you a ranked challenge")).toBeNull();
    expect(u.queryByTestId("notification-missed")).toBeNull();
  });

  it("a Missed challenge expiring ~30 days out arms a capped timer that does not fire at once or loop", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    // Past 2^31-1 ms (~24.8 days) an uncapped setTimeout would fire at once.
    mockPendingRows = [
      { ...pendingRow("c-far", 2 * 60 * MIN, "Bo"), expires_at: new Date(Date.now() + 30 * 24 * 60 * MIN).toISOString() },
    ];
    const armed = jest.spyOn(global, "setTimeout");
    const u = await renderApp();
    expect(armed.mock.calls.some(([, delay]) => delay === 2 ** 31 - 1)).toBe(true);
    armed.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    // Nothing fired, so nothing re-armed and nothing re-rendered in a loop.
    expect(armed).not.toHaveBeenCalled();
    expect(u.getByTestId("notification-missed")).toHaveTextContent(/Bo sent you a ranked challenge/);
  });

  it("clears the badge when the host unmounts (sign-out)", async () => {
    mockUnseen = 3;
    const u = await renderApp();
    expect(badgeTexts(u)).toHaveLength(4);
    mockAthlete = null;
    u.rerender(<App />);
    await settle();
    expect(badgeTexts(u)).toEqual([]);
  });
});

describe("panel rows", () => {
  it("lists a 2-hour-old pending challenge under Missed and a fresh one in the feed", async () => {
    mockPendingRows = [pendingRow("c-fresh", 2 * MIN, "Alex"), pendingRow("c-old", 2 * 60 * MIN, "Bo")];
    const u = await renderApp();
    const missed = u.getByTestId("notification-missed");
    expect(missed).toHaveTextContent(/Bo sent you a ranked challenge/);
    expect(missed).not.toHaveTextContent(/Alex/);
    expect(u.getByText("Alex sent you a ranked challenge")).toBeTruthy();
  });

  it("a fresh challenge row closes the panel and opens the Arena on that challenge, in place", async () => {
    mockPendingRows = [pendingRow("c-fresh", 2 * MIN, "Alex"), pendingRow("c-old", 2 * 60 * MIN, "Bo")];
    const u = await renderApp();
    await pressBell(u, 0);
    fireEvent.press(u.getByText("Alex sent you a ranked challenge"));
    // A tab root is navigated to, never pushed (no second Arena stacks).
    expect(mockNavigate).toHaveBeenLastCalledWith("/arena?challenge=c-fresh");
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("a challenge row tapped from the Arena tab's own bell does not stack a second Arena", async () => {
    mockPathname = "/arena";
    mockPendingRows = [pendingRow("c-fresh", 2 * MIN, "Alex")];
    const u = await renderApp();
    await pressBell(u, 0);
    fireEvent.press(u.getByText("Alex sent you a ranked challenge"));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenLastCalledWith("/arena?challenge=c-fresh");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("a Missed challenge row also closes the panel and opens the Arena (AC-H15)", async () => {
    mockPendingRows = [pendingRow("c-old", 2 * 60 * MIN, "Bo")];
    const u = await renderApp();
    await pressBell(u, 0);
    fireEvent.press(u.getByText("Bo sent you a ranked challenge"));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenLastCalledWith("/arena");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("a match result closes the panel and opens match detail, not the retired /session route", async () => {
    const u = await renderApp();
    await pressBell(u, 0);
    fireEvent.press(u.getByText("You defeated Demo Red (+12 ELO)"));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/m1");
    expect(mockPush.mock.calls.flat().join(" ")).not.toMatch(/\/session\//);
  });

  it("a reel opens the viewer with source=bell", async () => {
    const u = await renderApp();
    await pressBell(u, 0);
    fireEvent.press(u.getByText("Your reel vs Demo Red is ready to watch."));
    expect(mockPush).toHaveBeenCalledWith("/highlight/h1?source=bell");
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("marks unread highlight rows with a dot, seen ones without", async () => {
    const u = await renderApp();
    expect(u.getByTestId("notification-unread-highlight-h1-v1")).toBeTruthy();
    expect(u.queryByTestId("notification-unread-highlight-h2-v1")).toBeNull();
  });

  it("marks the fresh challenge row the badge counts with a dot, a Missed one without", async () => {
    mockPendingRows = [pendingRow("c-fresh", 2 * MIN, "Alex"), pendingRow("c-old", 2 * 60 * MIN, "Bo")];
    const u = await renderApp();
    expect(u.getByTestId("notification-unread-challenge-recv-c-fresh")).toBeTruthy();
    expect(u.queryByTestId("notification-unread-challenge-recv-c-old")).toBeNull();
  });
});

describe("Q3: a challenge dropped by a manual go-offline (tucked with Later)", () => {
  afterEach(() => {
    __resetArenaStoreForTests();
  });

  it("leaves the bell and the Arena tab's fresh count, and its row is a plain Missed row", async () => {
    const dismissed = new Set<string>();
    const controller = {
      isIncomingDismissed: (id: string) => dismissed.has(id),
    } as unknown as ArenaController;
    registerArenaController(controller);
    mockPendingRows = [pendingRow("c-fresh", 2 * MIN, "Alex")];
    const u = await renderApp();
    expect(badgeTexts(u)).toEqual(["1", "1", "1", "1"]);
    expect(getFreshIncomingCountForTests()).toBe(1);

    // The Arena dismisses it (no decline is sent: still pending server-side).
    await act(async () => {
      dismissed.add("c-fresh");
      notifyIncomingChallengeEnded("c-fresh");
    });
    expect(badgeTexts(u)).toEqual([]);
    expect(getFreshIncomingCountForTests()).toBe(0);
    expect(u.getByTestId("notification-missed")).toHaveTextContent(/Alex sent you a ranked challenge/);
    expect(u.queryByTestId("notification-unread-challenge-recv-c-fresh")).toBeNull();

    await pressBell(u, 0);
    fireEvent.press(u.getByText("Alex sent you a ranked challenge"));
    expect(mockNavigate).toHaveBeenLastCalledWith("/arena");
  });
});

describe("navigation away closes the panel", () => {
  function OpenProbe({ onOpen }: { onOpen: (o: boolean) => void }) {
    onOpen(useBellOpen());
    return null;
  }

  it("a route change while the panel is open (push deep link, match entry) closes it", async () => {
    let open = false;
    const tree = () => (
      <View>
        <App />
        <OpenProbe onOpen={(o) => (open = o)} />
      </View>
    );
    const u = render(tree());
    await settle();
    await pressBell(u, 0);
    expect(open).toBe(true);

    mockPathname = "/arena";
    u.rerender(tree());
    await settle();

    expect(open).toBe(false);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    u.unmount();
  });

  it("a route change with the panel closed leaves it closed, and a re-render on the same route keeps it open", async () => {
    let open = false;
    const tree = () => (
      <View>
        <App />
        <OpenProbe onOpen={(o) => (open = o)} />
      </View>
    );
    const u = render(tree());
    await settle();
    mockPathname = "/rankings";
    u.rerender(tree());
    await settle();
    expect(open).toBe(false);

    await pressBell(u, 1);
    u.rerender(tree());
    await settle();
    expect(open).toBe(true);
    u.unmount();
  });
});

describe("pending re-sync (realtime does not replay missed events)", () => {
  const withdrawnWhileAway = async (trigger: (u: ReturnType<typeof render>) => void) => {
    mockPendingRows = [pendingRow("c-fresh", 2 * MIN, "Alex"), pendingRow("c-old", 2 * 60 * MIN, "Bo")];
    const u = await renderApp();
    expect(badgeTexts(u)).toEqual(["1", "1", "1", "1"]);
    expect(u.getByTestId("notification-missed")).toHaveTextContent(/Bo/);
    // Server side, with no realtime event: both were withdrawn, a new one arrived.
    mockPendingRows = [pendingRow("c-new", 1 * MIN, "Cy")];
    await act(async () => {
      trigger(u);
    });
    await settle();
    expect(badgeTexts(u)).toEqual(["1", "1", "1", "1"]);
    expect(u.queryByText("Alex sent you a ranked challenge")).toBeNull();
    expect(u.queryByTestId("notification-missed")).toBeNull();
    expect(u.getByText("Cy sent you a ranked challenge")).toBeTruthy();
    u.unmount();
  };

  it("re-reads on a return to the foreground", async () => {
    await withdrawnWhileAway(() => {
      setAppState("background");
      setAppState("active");
    });
  });

  it("re-reads when a bell opens the panel", async () => {
    await withdrawnWhileAway((u) => fireEvent.press(u.getAllByLabelText("Notifications")[1]));
  });

  it("re-reads on Home's pull-to-refresh", async () => {
    await withdrawnWhileAway(() => requestBellRefresh());
  });

  it("does not re-read on an inactive blip that never reached the background", async () => {
    mockPendingRows = [pendingRow("c-fresh", 2 * MIN, "Alex")];
    const u = await renderApp();
    mockPendingRows = [];
    await act(async () => {
      setAppState("active");
    });
    await settle();
    expect(badgeTexts(u)).toEqual(["1", "1", "1", "1"]);
    u.unmount();
  });
});
