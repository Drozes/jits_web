import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import {
  IDLE_ARENA_STATE,
  __resetArenaStoreForTests,
  arenaActions,
  useArenaState,
  useRegisterInlineChallengeSurface,
} from "@/lib/arena/arena-store";
import { LOBBY_RESOLVE_DEBOUNCE_MS } from "@/hooks/use-active-lobby-count";
import { ArenaBootstrap } from "./arena-bootstrap";
import { LEFT_MATCHES_COOKIE, parseLeftMatches } from "@/lib/arena/left-matches";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const live = vi.hoisted(() => ({
  args: null as null | Record<string, unknown>,
  value: {
    isLive: false,
    isSaving: false,
    toggle: vi.fn(async () => {}),
    goLive: vi.fn(async () => {}),
    goOffline: vi.fn(async () => {}),
  },
}));
vi.mock("@/hooks/use-arena-live", () => ({
  useArenaLive: (args: Record<string, unknown>) => {
    live.args = args;
    return live.value;
  },
}));

type Incoming = { challengeId: string; challengerId: string; challengerName: string };
type Outgoing = { challengeId: string; opponentId: string; opponentName: string };
const challenge = vi.hoisted(() => ({
  args: null as null | Record<string, unknown>,
  value: {
    incoming: null as Incoming | null,
    outgoing: null as Outgoing | null,
    isBusy: false,
    sendChallenge: vi.fn(async () => {}),
    accept: vi.fn(async () => {}),
    decline: vi.fn(async () => {}),
    cancelOutgoing: vi.fn(async () => {}),
  },
}));
vi.mock("@/hooks/use-arena-challenge", () => ({
  useArenaChallenge: (args: Record<string, unknown>) => {
    challenge.args = args;
    return challenge.value;
  },
}));

const presence = vi.hoisted(() => ({ ids: new Set<string>(), calls: [] as unknown[][] }));
vi.mock("@/hooks/use-lobby-presence", () => ({
  useLobbyPresence: (...args: unknown[]) => presence.calls.push(args),
  useLobbyIds: () => presence.ids,
}));

// The real count hook runs; only the athletes lookup is faked. The DB knows
// A (active, present) and C (active, looking_for_ranked, NOT present).
const A = "00000000-0000-4000-8000-00000000000a";
const C = "00000000-0000-4000-8000-00000000000c";
const GHOST = "00000000-0000-4000-8000-0000000000ff";
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => {
      let ids: string[] = [];
      const q = {
        select: () => q,
        in: (_: string, v: string[]) => ((ids = v), q),
        eq: async () => ({
          data: ids.filter((id) => [A, C].includes(id)).map((id) => ({ id })),
          error: null,
        }),
      };
      return q;
    },
  }),
}));

let snapshot = IDLE_ARENA_STATE;
function StoreProbe() {
  snapshot = useArenaState();
  return null;
}
const tree = () => (
  <>
    <ArenaBootstrap athleteId="me" athleteWeight={170} initialLive={false} />
    <StoreProbe />
  </>
);
const mount = () => render(tree());
const ana: Incoming = { challengeId: "c1", challengerId: "a", challengerName: "Ana" };

beforeEach(() => {
  __resetArenaStoreForTests();
  snapshot = IDLE_ARENA_STATE;
  nav.pathname = "/";
  live.value = { ...live.value, isLive: false, isSaving: false };
  challenge.value = { ...challenge.value, incoming: null, outgoing: null, isBusy: false };
  presence.ids = new Set();
  presence.calls = [];
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("ArenaBootstrap state", () => {
  it("publishes a ready snapshot with the live flag", () => {
    live.value.isLive = true;
    mount();
    expect(snapshot).toMatchObject({ ready: true, isLive: true });
  });

  it("republishes when incoming, outgoing, isBusy or isSaving change", () => {
    const { rerender } = mount();
    live.value = { ...live.value, isSaving: true };
    rerender(tree());
    expect(snapshot.isSaving).toBe(true);
    challenge.value = { ...challenge.value, incoming: ana, isBusy: true };
    rerender(tree());
    expect(snapshot).toMatchObject({ incoming: ana, isBusy: true });
    const out = { challengeId: "o1", opponentId: "b", opponentName: "Bo" };
    challenge.value = { ...challenge.value, incoming: null, outgoing: out };
    rerender(tree());
    expect(snapshot.outgoing).toEqual(out);
  });

  it("observes lobby:online without joining while offline", () => {
    mount();
    expect(presence.calls[0]).toEqual(["me", false, false]);
  });

  it("counts only present, real, active athletes other than self", async () => {
    vi.useFakeTimers();
    // GHOST and "junk" are foreign presence keys; C is DB-flagged, not present.
    presence.ids = new Set(["me", A, GHOST, "junk"]);
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_RESOLVE_DEBOUNCE_MS + 1);
    });
    expect(snapshot.onlineCount).toBe(1);
  });

  it("receives challenges only while live and not in a match", () => {
    live.value.isLive = true;
    const { rerender } = mount();
    expect(challenge.args?.canReceive).toBe(true);
    expect(live.args?.inMatch).toBe(false);
    nav.pathname = "/arena/match/m1";
    rerender(tree());
    expect(challenge.args?.canReceive).toBe(false);
    expect(live.args?.inMatch).toBe(true);
    live.value = { ...live.value, isLive: false };
    nav.pathname = "/";
    rerender(tree());
    expect(challenge.args?.canReceive).toBe(false);
  });

  it("is busy for the handshake only on a match screen, not the session lobby", () => {
    live.value.isLive = true;
    nav.pathname = "/session/s1/lobby";
    const { rerender } = mount();
    // Immersive: offline and no prompt, but a challenge is left pending.
    expect(live.args?.inMatch).toBe(true);
    expect(challenge.args?.canReceive).toBe(false);
    expect(challenge.args?.inMatch).toBe(false);
    // The session flow withdraws my own challenge (jits-zasq).
    expect(challenge.args?.inSessionFlow).toBe(true);
    nav.pathname = "/session/s1/join";
    rerender(tree());
    expect(challenge.args?.inSessionFlow).toBe(true);
    nav.pathname = "/session/s1/match/m1";
    rerender(tree());
    expect(challenge.args?.inMatch).toBe(true);
    expect(challenge.args?.inSessionFlow).toBe(false);
    nav.pathname = "/arena/match/m1";
    rerender(tree());
    expect(challenge.args?.inMatch).toBe(true);
    expect(challenge.args?.inSessionFlow).toBe(false);
    nav.pathname = "/arena";
    rerender(tree());
    expect(challenge.args?.inSessionFlow).toBe(false);
    nav.pathname = "/";
  });

  it("remembers an Arena match navigated away from, not one merely open (jits-jitg)", () => {
    const M = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    document.cookie = `${LEFT_MATCHES_COOKIE}=; path=/; max-age=0`;
    const read = () =>
      parseLeftMatches(
        document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith(`${LEFT_MATCHES_COOKIE}=`))
          ?.slice(LEFT_MATCHES_COOKIE.length + 1),
        "me",
      );
    nav.pathname = `/arena/match/${M}`;
    const { rerender } = mount();
    expect(read()).toEqual([]);
    nav.pathname = "/";
    rerender(tree());
    expect(read()).toEqual([M]);
    nav.pathname = "/";
  });

  it("registers stable actions and resets the store on unmount", async () => {
    live.value.isLive = true;
    const { unmount } = mount();
    await arenaActions.toggle();
    await arenaActions.sendChallenge("a", "Ana");
    expect(live.value.toggle).toHaveBeenCalledOnce();
    expect(challenge.value.sendChallenge).toHaveBeenCalledWith("a", "Ana");
    unmount();
    render(<StoreProbe />);
    expect(snapshot).toEqual(IDLE_ARENA_STATE);
    await arenaActions.toggle();
    expect(live.value.toggle).toHaveBeenCalledOnce();
  });
});

describe("ArenaBootstrap overlay", () => {
  it("always renders the overlay container", () => {
    const { container } = mount();
    expect(container.querySelector("[data-arena-overlay]")).not.toBeNull();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows a focused, labelled, non-modal alert dialog for an incoming challenge", () => {
    challenge.value.incoming = ana;
    mount();
    const dialog = screen.getByRole("alertdialog", { name: "Ana wants to roll" });
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(dialog).toHaveAttribute("tabindex", "-1");
    expect(dialog).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(challenge.value.accept).toHaveBeenCalledOnce();
  });

  it("Escape declines", () => {
    challenge.value.incoming = ana;
    mount();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(challenge.value.decline).toHaveBeenCalledOnce();
  });

  it("stands down while an inline challenge surface is mounted, whatever the path", () => {
    challenge.value.incoming = ana;
    nav.pathname = "/leaderboard";
    const inline = renderHook(() => useRegisterInlineChallengeSurface());
    mount();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    act(() => inline.unmount());
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("still shows on /arena when no inline surface registered (Arena failed to load)", () => {
    challenge.value.incoming = ana;
    nav.pathname = "/arena";
    mount();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("shows a compact waiting bar for an outgoing challenge, with Cancel", () => {
    challenge.value.outgoing = { challengeId: "o1", opponentId: "b", opponentName: "Bo" };
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for Bo");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(challenge.value.cancelOutgoing).toHaveBeenCalledOnce();
  });

  it.each(["/arena/match/m1", "/session/s1/match/m1"])(
    "renders no prompt on immersive route %s",
    (path) => {
      nav.pathname = path;
      challenge.value.incoming = ana;
      mount();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    },
  );
});
