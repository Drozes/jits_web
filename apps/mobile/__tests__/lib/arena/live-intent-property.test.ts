/**
 * Property test for the single source of truth (review round 3): the
 * athlete's last choice always wins. Randomized (seeded, reproducible)
 * sequences drive the REAL intent driver (`arena-store.ts`) and the REAL
 * server-write executor (`useArenaLive`) against a fake server whose writes
 * are instant, slow, hung or failing, with taps from every surface (they all
 * call `liveSwitch`), timer jumps across the cooldown, background and
 * foreground, match enter and exit, kill and relaunch, and sign-out.
 *
 * Invariants:
 *  (1) once everything settles, the server equals the app's intent, and an
 *      athlete whose last explicit choice is offline (or who signed out) is
 *      offline on the server;
 *  (2) the UI draws exactly the settled server state, and an offline choice
 *      is drawn offline at once (synchronously after the tap);
 *  (3) no live write is ever SENT while the intent is a decided offline, or
 *      after sign-out started;
 *  (4) a go-live never resolves false (a failure toast) for a choice the
 *      athlete already overtook.
 *
 * A failing sequence prints its seed; re-run it with LIVE_PROPERTY_SEED.
 *
 * Source: apps/mobile/lib/arena/arena-store.ts, use-arena-live.ts
 */
import * as React from "react";
import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

type WriteKind = "instant" | "slow" | "hung" | "fail";

/** The fake server and what the test observes of it. */
/** The last writes seen (for failure reports). */
const writes: string[] = [];
const server = {
  live: false,
  /** The process the write came from (a kill ends the old one's writes). */
  epoch: 0,
  signedOut: false,
  violations: [] as string[],
  hung: [] as (() => void)[],
  nextKind: (): WriteKind => "instant",
};

jest.mock("@jits/shared/api/mutations", () => ({
  toggleMatchPreferences: (_s: unknown, athleteId: string, prefs: { lookingForRanked: boolean }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require("@/lib/arena/arena-store");
    const ranked = prefs.lookingForRanked;
    // The session (process) that sent it: a killed process, or a session
    // that signed out (RLS refuses it), never lands anything.
    const epoch = Number(athleteId.split("-")[1]);
    if (epoch !== server.epoch) return new Promise(() => undefined);
    if (ranked) {
      const i = store.getLiveIntent();
      if (server.signedOut) server.violations.push("live write after sign-out");
      if (i.decided && !i.live) server.violations.push("live write while the intent is offline");
    }
    const kind = server.nextKind();
    writes.push(`${ranked ? "T" : "F"}:${kind}@${epoch}/${server.epoch}`);
    const land = (ok: boolean) => {
      if (ok && epoch === server.epoch) server.live = ranked;
      return ok ? { ok: true, data: undefined } : { ok: false, error: { code: "UNKNOWN", message: "net" } };
    };
    if (kind === "instant") return Promise.resolve(land(true));
    if (kind === "fail") return Promise.resolve(land(false));
    if (kind === "slow") return new Promise((r) => setTimeout(() => r(land(true)), 3_000));
    return new Promise((r) => server.hung.push(() => r(land(true))));
  },
}));
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  joinLobby: () => Promise.resolve(),
  leaveLobby: () => Promise.resolve(),
}));
jest.mock("@/components/ui/toast", () => ({ toast: { info: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import {
  __resetArenaStoreForTests,
  getLiveIntent,
  liveSwitch,
  publishArenaState,
  IDLE_ARENA_STATE,
  registerArenaController,
  registerGoLiveCanceller,
  registerIntentPersister,
  setAppLiveIntent,
  takeArenaOfflineBeforeSignOut,
  getGoLiveDisplay,
  __peekArenaStateForTests,
  useIsArenaDisplayLive,
} from "@/lib/arena/arena-store";
import { useArenaLive, type UseArenaLiveArgs } from "@/lib/arena/use-arena-live";

/** mulberry32: a tiny seeded PRNG. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let appStateHandlers: ((s: AppStateStatus) => void)[] = [];
function setAppState(state: AppStateStatus) {
  Object.defineProperty(AppState, "currentState", { value: state, configurable: true, writable: true });
}

async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

interface SeqResult {
  ok: boolean;
  log: string[];
}

async function runSequence(seed: number): Promise<SeqResult> {
  const rand = rng(seed);
  const log: string[] = [];
  __resetArenaStoreForTests();
  server.live = rand() < 0.3; // a cold start may find the flag already true
  server.epoch += 1;
  server.signedOut = false;
  server.violations = [];
  server.hung = [];
  writes.length = 0;
  setAppState("active");
  appStateHandlers = [];
  const persisted = { value: (rand() < 0.3 ? (rand() < 0.5 ? true : false) : null) as boolean | null };
  // Write latencies for this sequence.
  server.nextKind = () => {
    const r = rand();
    return r < 0.6 ? "instant" : r < 0.8 ? "slow" : r < 0.9 ? "hung" : "fail";
  };

  const props = (inMatch: boolean): UseArenaLiveArgs => ({
    athleteId: `me-${server.epoch}`,
    displayName: "Me",
    currentElo: 1200,
    initialRanked: server.live,
    inMatch,
    autoLive: async (ctx) => {
      log.push(`  restore(${ctx.reason}) starts`);
      if (rand() < 0.3) await new Promise((r) => setTimeout(r, 500 + rand() * 2_000));
      const c = ctx.canWrite();
      if (c !== "ok") {
        log.push(`  restore ${c}`);
        return c;
      }
      const ok = await ctx.write();
      log.push(`  restore write ${ok}`);
      // As the real restore does: a failure said in front holds offline.
      if (!ok && AppState.currentState === "active") setAppLiveIntent(false);
      return ok ? "live" : "failed";
    },
    loadPersistedIntent: () => Promise.resolve(persisted.value),
  });

  let inMatch = false;
  let owner: ReturnType<typeof makeOwner> | null = null;
  let lastExplicit: "live" | "offline" | null = null;
  let lastTapAt = 0;
  let tapCount = 0;

  function makeOwner() {
    const view = renderHook(
      (p: UseArenaLiveArgs) => {
        const live = useArenaLive(p);
        // Published in an effect on every change, exactly as the owner does.
        React.useEffect(() => {
          publishArenaState({ ...IDLE_ARENA_STATE, isLive: live.isLive });
        }, [live.isLive]);
        return { live, drawn: useIsArenaDisplayLive() };
      },
      { initialProps: props(inMatch) },
    );
    const unregisterPersister = registerIntentPersister((live) => {
      persisted.value = live;
    });
    const unregister = registerArenaController({
      toggle: async () => undefined,
      goOffline: () => view.result.current.live.goOffline(),
      goLive: async () => {
        let cancelled = false;
        const un = registerGoLiveCanceller(() => {
          cancelled = true;
        });
        try {
          if (rand() < 0.4) await new Promise((r) => setTimeout(r, 200 + rand() * 4_000));
          if (cancelled) return "ignored";
          if (rand() < 0.08) return false;
          const ok = await view.result.current.live.goLive();
          return cancelled ? "ignored" : ok;
        } finally {
          un();
        }
      },
      committed: () => view.result.current.live.committed(),
      ensureOffline: () => view.result.current.live.ensureOffline(),
      sendChallenge: async () => undefined,
      cancelOutgoing: async () => undefined,
      clearCap: () => undefined,
      tuckIncoming: () => undefined,
      reopenIncoming: () => undefined,
    });
    return { view, unregister, unregisterPersister };
  }

  const publish = () => {
    if (owner) publishArenaState({ ...IDLE_ARENA_STATE, isLive: owner.view.result.current.live.isLive });
  };

  owner = makeOwner();
  await act(async () => {
    await flush();
  });

  const steps = 6 + Math.floor(rand() * 12);
  for (let i = 0; i < steps; i++) {
    const r = rand();
    const inFront = AppState.currentState === "active";
    if (r < 0.25 && owner && !server.signedOut && inFront) {
      const tap = ++tapCount;
      lastTapAt = tap;
      lastExplicit = "live";
      log.push("tap live");
      act(() => {
        void liveSwitch.goLive().then((res) => {
          // (4) a failure is only ever reported for a choice nobody overtook.
          if (res === false && lastTapAt !== tap) server.violations.push("failure reported for an overtaken choice");
        });
      });
    } else if (r < 0.5 && owner && !server.signedOut && inFront) {
      ++tapCount;
      lastTapAt = tapCount;
      lastExplicit = "offline";
      log.push("tap offline");
      act(() => {
        void liveSwitch.goOffline();
        publish();
      });
      // (2) drawn offline at once, synchronously.
      if ((owner as { view: { result: { current: { drawn: boolean } } } }).view.result.current.drawn) {
        server.violations.push("offline choice not drawn at once");
      }
    } else if (r < 0.7) {
      const ms = Math.floor(rand() * 4_000);
      log.push(`advance ${ms}`);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(ms);
      });
    } else if (r < 0.78) {
      const next: AppStateStatus = AppState.currentState === "active" ? "background" : "active";
      log.push(next);
      act(() => {
        setAppState(next);
        for (const h of [...appStateHandlers]) h(next);
      });
    } else if (r < 0.84 && owner) {
      inMatch = !inMatch;
      log.push(inMatch ? "enter match" : "exit match");
      (owner as { view: { rerender: (p: UseArenaLiveArgs) => void } }).view.rerender(props(inMatch));
    } else if (r < 0.9 && owner) {
      // Kill and relaunch: the old process's writes never land, its memory
      // is gone; the persisted choice and the server remain.
      log.push("kill+relaunch");
      const o = owner as { view: { unmount: () => void }; unregister: () => void; unregisterPersister: () => void };
      o.unregister();
      o.unregisterPersister();
      server.epoch += 1;
      o.view.unmount();
      server.hung = [];
      __resetArenaStoreForTests();
      appStateHandlers = [];
      inMatch = false;
      setAppState("active");
      owner = makeOwner();
      if (persisted.value === false) lastExplicit = "offline";
    } else if (r < 0.95 && owner && !server.signedOut) {
      log.push("sign-out");
      // On a healthy network (a hung live write would block the clear, and
      // after sign-out the session can no longer write: no client can fix
      // that; invariant 3 still holds whatever the network does).
      const kinds = server.nextKind;
      server.nextKind = () => "instant";
      for (const release of server.hung.splice(0)) release();
      await act(async () => {
        await flush();
      });
      let signOut!: Promise<void>;
      act(() => {
        signOut = takeArenaOfflineBeforeSignOut();
      });
      server.signedOut = true;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(5_000);
        await signOut;
      });
      const o = owner as { view: { unmount: () => void }; unregister: () => void; unregisterPersister: () => void };
      o.view.unmount();
      o.unregister();
      o.unregisterPersister();
      owner = null;
      // The session is gone: anything it still sends is refused (RLS).
      server.epoch += 1;
      server.nextKind = kinds;
    } else if (!owner) {
      log.push("sign-in");
      server.signedOut = false;
      inMatch = false;
      lastExplicit = null;
      owner = makeOwner();
    }
    await act(async () => {
      await flush();
      publish();
    });
    if (owner) {
      const o = owner as { view: { result: { current: { live: { isLive: boolean; committed: () => unknown } } } } };
      log.push(
        `    = intent ${JSON.stringify(getLiveIntent())} committed ${JSON.stringify(o.view.result.current.live.committed())} hook ${o.view.result.current.live.isLive} server ${server.live}`,
      );
    }
  }

  // Settle: in front, out of any match, every hung write answers, all timers run.
  if (owner && inMatch) {
    inMatch = false;
    (owner as { view: { rerender: (p: UseArenaLiveArgs) => void } }).view.rerender(props(false));
  }
  await act(async () => {
    if (AppState.currentState !== "active") {
      setAppState("active");
      for (const h of [...appStateHandlers]) h("active");
    }
    for (let k = 0; k < 20; k++) {
      const hung = server.hung;
      server.hung = [];
      for (const release of hung) release();
      await jest.advanceTimersByTimeAsync(5_000);
      await flush();
      publish();
    }
  });

  const intentNow = getLiveIntent();
  const drawn = owner ? (owner as { view: { result: { current: { drawn: boolean } } } }).view.result.current.drawn : false;
  const failures: string[] = [...server.violations];
  if (!owner || server.signedOut) {
    if (server.live) failures.push("server live after sign-out");
  } else {
    // (1) the athlete's last explicit offline choice always wins.
    if (lastExplicit === "offline" && intentNow.decided && !intentNow.live && server.live) {
      failures.push("server live though the last choice is offline");
    }
    // (1) settled: the server equals the app's intent once it is decided.
    if (intentNow.decided && server.live !== intentNow.live) {
      const o = owner as { view: { result: { current: { live: { isLive: boolean; committed: () => unknown } } } } };
      failures.push(
        `server ${server.live} != intent ${intentNow.live} (hook isLive ${o.view.result.current.live.isLive}, ` +
          `committed ${JSON.stringify(o.view.result.current.live.committed())}, display ${getGoLiveDisplay()}, writes ${JSON.stringify(writes.slice(-6))})`,
      );
    }
    // (2) the UI draws the settled server state.
    if (drawn !== server.live) {
      const o = owner as { view: { result: { current: { live: { isLive: boolean; committed: () => unknown } } } } };
      failures.push(
        `drawn ${drawn} != server ${server.live} (store isLive ${__peekArenaStateForTests().isLive}, intent ${JSON.stringify(intentNow)}, display ${getGoLiveDisplay()}, ` +
          `hook isLive ${o.view.result.current.live.isLive}, committed ${JSON.stringify(o.view.result.current.live.committed())})`,
      );
    }
  }
  if (owner) {
    const o = owner as { view: { unmount: () => void }; unregister: () => void; unregisterPersister: () => void };
    o.unregister();
    o.unregisterPersister();
    o.view.unmount();
  }
  return { ok: failures.length === 0, log: [...log, ...failures.map((f) => `FAIL: ${f}`)] };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, h: (s: AppStateStatus) => void) => {
    appStateHandlers.push(h);
    return { remove: () => (appStateHandlers = appStateHandlers.filter((x) => x !== h)) };
  }) as never);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const SEQUENCES = Number(process.env.LIVE_PROPERTY_SEQUENCES ?? 3000);
const ONLY_SEED = process.env.LIVE_PROPERTY_SEED ? Number(process.env.LIVE_PROPERTY_SEED) : null;

it(
  `the athlete's last choice always wins (${ONLY_SEED ?? SEQUENCES} randomized sequences)`,
  async () => {
    const started = jest.getRealSystemTime();
    const seeds = ONLY_SEED !== null ? [ONLY_SEED] : Array.from({ length: SEQUENCES }, (_, i) => 1_000 + i);
    const failed: { seed: number; log: string[] }[] = [];
    for (const seed of seeds) {
      const r = await runSequence(seed);
      if (!r.ok) {
        failed.push({ seed, log: r.log });
        if (failed.length >= 3) break;
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[live-intent property] ${seeds.length} sequences in ${jest.getRealSystemTime() - started} ms`);
    if (failed.length) {
      throw new Error(failed.map((f) => `seed ${f.seed}:\n  ${f.log.join("\n  ")}`).join("\n\n"));
    }
  },
  600_000,
);
