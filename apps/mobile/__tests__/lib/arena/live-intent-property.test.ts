/**
 * Property test for the single source of truth (review rounds 3 and 4): the
 * athlete's last choice always wins. Randomized (seeded, reproducible)
 * sequences drive the REAL intent driver (`arena-store.ts`) and the REAL
 * server-write executor (`useArenaLive`) against a fake mockServer.
 *
 * The model (round 4, R3):
 *  - mockWrites are instant, slow (3 s), hung (until released), failing (never
 *    committed), LOST (committed, but the answer says it failed) and, for a
 *    live write, REFUSED (`location_required`, the ladder's refusal);
 *  - a KILL ends the process: it sends nothing more, but every write it had
 *    already sent still commits (at the kill, in send order: the relaunch
 *    reads the row after them). Its memory is gone; the persisted choice
 *    and the server row remain;
 *  - SIGN-OUT revokes the session after its 4 s bound: later sends are
 *    refused, but a write the server already received still commits;
 *  - the SERVER may end a live session by itself (the 12 hour cap, an admin);
 *  - the 30 s own-row check runs as `<ArenaBootstrap />` runs it
 *    (`checkServer`, "dropped" holds the athlete offline);
 *  - taps from every surface (they all call `liveSwitch`), timer jumps across
 *    the cooldown, background and foreground, match enter and exit.
 *
 * Invariants, checked once everything settles (in front, out of a match,
 * every hung write answered, every timer run):
 *  (1) the server equals the app's decided intent, and an athlete whose last
 *      explicit choice is offline is offline on the mockServer. After sign-out:
 *      a `false` write was sent after sign-out started, and on a healthy
 *      network the server is offline. KNOWN LIMIT (not asserted): a live
 *      write still hung when sign-out starts can commit after the session is
 *      dropped (the server already has the request; no client can recall
 *      it, and the app can no longer write);
 *  (2) the UI draws the settled server state, and an offline choice is drawn
 *      offline at once (synchronously after the tap);
 *  (3) no live write is ever SENT while the intent is a decided offline, or
 *      after sign-out started;
 *  (4) a go-live never resolves false (a failure toast) for a choice the
 *      athlete already overtook.
 *
 * Seeds: one run checks a RANDOM base (printed; pin it with
 * LIVE_PROPERTY_BASE, or one sequence with LIVE_PROPERTY_SEED) and the fixed
 * regression range from review round 4 (base 777_000, where seed 777102 found
 * R1). LIVE_PROPERTY_SEQUENCES sets the random run's length.
 *
 * Covered by targeted suites instead of here: the location ladder's rungs and
 * its sheets (instant-go-live.test.tsx), the cold-start first frame
 * (instant-go-live.test.tsx "round 4"), the bootstrap's own-row check wiring
 * (arena-bootstrap-location.test.tsx).
 *
 * Source: apps/mobile/lib/arena/arena-store.ts, use-arena-live.ts
 */
import * as React from "react";
import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

type WriteKind = "instant" | "slow" | "hung" | "fail" | "lost" | "refused";

interface Pending {
  proc: number;
  ranked: boolean;
  commit: () => void;
}

/** The last mockWrites seen (for failure reports). */
const mockWrites: string[] = [];
const mockServer = {
  live: false,
  /** The running process (a kill starts a new one). */
  proc: 0,
  /** Processes that are dead (killed): they send nothing more. */
  dead: new Set<number>(),
  /** Processes whose session was signed out: the server refuses their new requests. */
  revoked: new Set<number>(),
  signingOut: false,
  /** False mockWrites sent since the current sign-out started. */
  falseSentInSignOut: 0,
  violations: [] as string[],
  hung: [] as Pending[],
  nextKind: (_ranked: boolean): WriteKind => "instant",
};

jest.mock("@jits/shared/api/mutations", () => ({
  toggleMatchPreferences: (_s: unknown, athleteId: string, prefs: { lookingForRanked: boolean }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require("@/lib/arena/arena-store");
    const ranked = prefs.lookingForRanked;
    const proc = Number(athleteId.split("-")[1]);
    // A dead process sends nothing; a signed-out session is refused (RLS).
    if (mockServer.dead.has(proc) || mockServer.revoked.has(proc)) return new Promise(() => undefined);
    if (ranked) {
      const i = store.getLiveIntent();
      if (mockServer.signingOut) mockServer.violations.push("live write after sign-out started");
      if (i.decided && !i.live) mockServer.violations.push("live write while the intent is offline");
    } else if (mockServer.signingOut) {
      mockServer.falseSentInSignOut += 1;
    }
    const kind = mockServer.nextKind(ranked);
    mockWrites.push(`${ranked ? "T" : "F"}:${kind}@${proc}`);
    const ok = { ok: true, data: undefined };
    const net = { ok: false, error: { code: "UNKNOWN", message: "net" } };
    const commit = () => {
      mockServer.live = ranked;
    };
    if (kind === "instant") {
      commit();
      return Promise.resolve(ok);
    }
    if (kind === "fail") return Promise.resolve(net);
    if (kind === "refused") return Promise.resolve({ ok: false, error: { code: "LOCATION_REQUIRED", message: "no tag" } });
    if (kind === "lost") {
      commit();
      return Promise.resolve(net);
    }
    if (kind === "slow") {
      return new Promise((r) =>
        setTimeout(() => {
          commit();
          r(ok);
        }, 3_000),
      );
    }
    return new Promise((r) =>
      mockServer.hung.push({
        proc,
        ranked,
        commit: () => {
          commit();
          r(ok);
        },
      }),
    );
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
  setGoLiveDisplay,
  takeArenaOfflineBeforeSignOut,
  getGoLiveDisplay,
  __peekArenaStateForTests,
  useIsArenaDisplayLive,
} from "@/lib/arena/arena-store";
import { useArenaLive, type UseArenaLiveArgs } from "@/lib/arena/use-arena-live";
import type { PersistedLiveIntent } from "@/lib/arena/live-intent-persist";

/** The own-row check's period (`SERVER_LIVE_CHECK_MS` in arena-bootstrap). */
const CHECK_MS = 30_000;

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

type Owner = {
  view: {
    result: { current: { live: ReturnType<typeof useArenaLive>; drawn: boolean } };
    rerender: (p: UseArenaLiveArgs) => void;
    unmount: () => void;
  };
  unregister: () => void;
  unregisterPersister: () => void;
};

async function runSequence(seed: number): Promise<SeqResult> {
  const rand = rng(seed);
  const log: string[] = [];
  __resetArenaStoreForTests();
  mockServer.live = rand() < 0.3; // a cold start may find the flag already true
  mockServer.proc += 1;
  mockServer.dead = new Set();
  mockServer.revoked = new Set();
  mockServer.signingOut = false;
  mockServer.falseSentInSignOut = 0;
  mockServer.violations = [];
  mockServer.hung = [];
  mockWrites.length = 0;
  setAppState("active");
  appStateHandlers = [];
  // The device's storage (it survives a kill; process memory does not).
  const stored: { value: PersistedLiveIntent | null } = {
    value:
      rand() < 0.4
        ? { live: rand() < 0.5, at: 1, confirmed: rand() < 0.5 }
        : null,
  };
  if (stored.value?.live) stored.value.confirmed = false;
  // Write latencies for this sequence.
  const kinds = (ranked: boolean): WriteKind => {
    const r = rand();
    if (r < 0.55) return "instant";
    if (r < 0.72) return "slow";
    if (r < 0.82) return "hung";
    if (r < 0.9) return "fail";
    if (r < 0.95) return "lost";
    return ranked ? "refused" : "fail";
  };
  mockServer.nextKind = kinds;

  const props = (inMatch: boolean): UseArenaLiveArgs => ({
    athleteId: `me-${mockServer.proc}`,
    displayName: "Me",
    currentElo: 1200,
    initialRanked: mockServer.live,
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
    loadPersistedIntent: () => Promise.resolve(stored.value ? { ...stored.value } : null),
    onOfflineLanded: () => {
      if (stored.value && !stored.value.live) stored.value = { ...stored.value, confirmed: true };
    },
  });

  let inMatch = false;
  let owner: Owner | null = null;
  let lastExplicit: "live" | "offline" | null = null;
  let lastTapAt = 0;
  let tapCount = 0;
  let sinceCheck = 0;
  /** After the last sign-out: what (1) asserts for it. */
  let signOutCheck: { healthy: boolean; liveHungAtStart: boolean; falseSent: number } | null = null;

  function makeOwner(): Owner {
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
      stored.value = { live, at: Date.now(), confirmed: false };
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
      signOutOffline: () => view.result.current.live.signOutOffline(),
      sendChallenge: async () => undefined,
      cancelOutgoing: async () => undefined,
      clearCap: () => undefined,
      tuckIncoming: () => undefined,
      reopenIncoming: () => undefined,
    });
    return { view: view as unknown as Owner["view"], unregister, unregisterPersister };
  }

  const publish = () => {
    if (owner) publishArenaState({ ...IDLE_ARENA_STATE, isLive: owner.view.result.current.live.isLive });
  };

  /** The 30 s own-row check, as `<ArenaBootstrap />` runs it. */
  const ownRowCheck = async () => {
    if (!owner || inMatch || AppState.currentState !== "active") return;
    const r = await owner.view.result.current.live.checkServer(() => Promise.resolve(mockServer.live));
    if (r) log.push(`  check: ${r}`);
    if (r === "dropped") {
      setAppLiveIntent(false);
      setGoLiveDisplay(null);
    }
  };

  /** Advance fake time, running the own-row check every 30 s as it passes. */
  const advance = async (ms: number) => {
    let left = ms;
    while (left > 0) {
      const step = Math.min(left, CHECK_MS - sinceCheck);
      await jest.advanceTimersByTimeAsync(step);
      sinceCheck += step;
      left -= step;
      if (sinceCheck >= CHECK_MS) {
        sinceCheck = 0;
        await ownRowCheck();
      }
    }
  };

  owner = makeOwner();
  await act(async () => {
    await flush();
  });

  const steps = 6 + Math.floor(rand() * 12);
  for (let i = 0; i < steps; i++) {
    const r = rand();
    const inFront = AppState.currentState === "active";
    if (r < 0.24 && owner && inFront) {
      const tap = ++tapCount;
      lastTapAt = tap;
      lastExplicit = "live";
      log.push("tap live");
      act(() => {
        void liveSwitch.goLive().then((res) => {
          // (4) a failure is only ever reported for a choice nobody overtook.
          if (res === false && lastTapAt !== tap) mockServer.violations.push("failure reported for an overtaken choice");
        });
      });
    } else if (r < 0.48 && owner && inFront) {
      ++tapCount;
      lastTapAt = tapCount;
      lastExplicit = "offline";
      log.push("tap offline");
      act(() => {
        void liveSwitch.goOffline();
        publish();
      });
      // (2) drawn offline at once, synchronously.
      if (owner.view.result.current.drawn) mockServer.violations.push("offline choice not drawn at once");
    } else if (r < 0.66) {
      const ms = Math.floor(rand() * (rand() < 0.15 ? 40_000 : 4_000));
      log.push(`advance ${ms}`);
      await act(async () => {
        await advance(ms);
      });
    } else if (r < 0.73) {
      const next: AppStateStatus = AppState.currentState === "active" ? "background" : "active";
      log.push(next);
      act(() => {
        setAppState(next);
        for (const h of [...appStateHandlers]) h(next);
      });
    } else if (r < 0.79 && owner) {
      inMatch = !inMatch;
      log.push(inMatch ? "enter match" : "exit match");
      owner.view.rerender(props(inMatch));
    } else if (r < 0.82) {
      if (mockServer.live) {
        // The server ends a live session by itself (the 12 hour cap, an admin).
        log.push("server ends session");
        mockServer.live = false;
      } else if (owner && rand() < 0.5) {
        // The athlete goes live on web: a newer choice, made elsewhere.
        log.push("web goes live");
        mockServer.live = true;
        lastExplicit = null;
      }
    } else if (r < 0.88 && owner) {
      // Kill and relaunch (R3a): the process dies at once and sends nothing
      // more, but what it already sent still commits (in send order, before
      // the relaunch reads the row). Memory is gone; storage and the row stay.
      log.push("kill+relaunch");
      const dying = mockServer.proc;
      mockServer.dead.add(dying);
      for (const p of mockServer.hung.filter((h) => h.proc === dying)) p.commit();
      mockServer.hung = mockServer.hung.filter((h) => h.proc !== dying);
      // Its slow mockWrites commit too (they reached the server).
      await act(async () => {
        await jest.advanceTimersByTimeAsync(3_000);
      });
      owner.unregister();
      owner.unregisterPersister();
      owner.view.unmount();
      __resetArenaStoreForTests();
      appStateHandlers = [];
      inMatch = false;
      sinceCheck = 0;
      setAppState("active");
      mockServer.proc += 1;
      if (mockServer.revoked.has(dying)) mockServer.revoked.add(mockServer.proc);
      owner = makeOwner();
      if (stored.value && !stored.value.live) lastExplicit = "offline";
      else if (stored.value?.live) lastExplicit = "live";
      else lastExplicit = null;
    } else if (r < 0.94 && owner) {
      log.push("sign-out");
      const healthy = rand() < 0.5;
      const liveHungAtStart = mockServer.hung.some((h) => h.ranked && !mockServer.dead.has(h.proc));
      if (healthy) mockServer.nextKind = () => "instant";
      mockServer.signingOut = true;
      mockServer.falseSentInSignOut = 0;
      let signOut!: Promise<void>;
      act(() => {
        signOut = takeArenaOfflineBeforeSignOut();
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(5_000);
        await signOut;
      });
      owner.view.unmount();
      owner.unregister();
      owner.unregisterPersister();
      owner = null;
      // The session is gone: new requests are refused (RLS).
      mockServer.revoked.add(mockServer.proc);
      mockServer.nextKind = kinds;
      signOutCheck = { healthy, liveHungAtStart, falseSent: mockServer.falseSentInSignOut };
      log.push(`  sign-out: healthy ${healthy}, live hung ${liveHungAtStart}, false sent ${mockServer.falseSentInSignOut}`);
    } else if (!owner) {
      log.push("sign-in");
      mockServer.signingOut = false;
      mockServer.proc += 1;
      inMatch = false;
      sinceCheck = 0;
      lastExplicit = stored.value ? (stored.value.live ? "live" : "offline") : null;
      signOutCheck = null;
      owner = makeOwner();
    }
    await act(async () => {
      await flush();
      publish();
    });
    if (owner) {
      log.push(
        `    = intent ${JSON.stringify(getLiveIntent())} committed ${JSON.stringify(owner.view.result.current.live.committed())} hook ${owner.view.result.current.live.isLive} server ${mockServer.live}`,
      );
    }
  }

  // Settle: in front, out of any match, every hung write answers, all timers
  // run (the own-row check included).
  if (owner && inMatch) {
    inMatch = false;
    owner.view.rerender(props(false));
  }
  await act(async () => {
    if (AppState.currentState !== "active") {
      setAppState("active");
      for (const h of [...appStateHandlers]) h("active");
    }
    for (let k = 0; k < 24; k++) {
      const hung = mockServer.hung;
      mockServer.hung = [];
      for (const p of hung) {
        // A revoked session's request already on the server still commits;
        // a dead process's was committed at the kill.
        if (!mockServer.dead.has(p.proc)) p.commit();
      }
      await advance(5_000);
      await flush();
      publish();
    }
  });

  const intentNow = getLiveIntent();
  const drawn = owner ? owner.view.result.current.drawn : false;
  const failures: string[] = [...mockServer.violations];
  if (!owner) {
    if (signOutCheck) {
      // (1) sign-out always sends a `false`; on a healthy network it lands
      // (KNOWN LIMIT: a live write hung at sign-out may commit after it).
      if (signOutCheck.falseSent === 0) failures.push("sign-out sent no false write");
      if (signOutCheck.healthy && !signOutCheck.liveHungAtStart && mockServer.live) {
        failures.push(`server live after a healthy sign-out (mockWrites ${JSON.stringify(mockWrites.slice(-8))})`);
      }
    }
  } else {
    const o = owner;
    const detail = () =>
      `(hook isLive ${o.view.result.current.live.isLive}, committed ${JSON.stringify(o.view.result.current.live.committed())}, ` +
      `display ${getGoLiveDisplay()}, store isLive ${__peekArenaStateForTests().isLive}, intent ${JSON.stringify(intentNow)}, ` +
      `mockWrites ${JSON.stringify(mockWrites.slice(-8))})`;
    // (1) the athlete's last explicit offline choice always wins.
    if (lastExplicit === "offline" && intentNow.decided && !intentNow.live && mockServer.live) {
      failures.push(`server live though the last choice is offline ${detail()}`);
    }
    // (1) settled: the server equals the app's intent once it is decided.
    if (intentNow.decided && mockServer.live !== intentNow.live) {
      failures.push(`server ${mockServer.live} != intent ${intentNow.live} ${detail()}`);
    }
    // (2) the UI draws the settled server state.
    if (drawn !== mockServer.live) failures.push(`drawn ${drawn} != server ${mockServer.live} ${detail()}`);
  }
  if (owner) {
    owner.unregister();
    owner.unregisterPersister();
    owner.view.unmount();
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

const SEQUENCES = Number(process.env.LIVE_PROPERTY_SEQUENCES ?? 2000);
const REGRESSION_SEQUENCES = Number(process.env.LIVE_PROPERTY_REGRESSION_SEQUENCES ?? 1000);
const ONLY_SEED = process.env.LIVE_PROPERTY_SEED ? Number(process.env.LIVE_PROPERTY_SEED) : null;
/** Random per run unless pinned; printed with every result. */
const RANDOM_BASE = process.env.LIVE_PROPERTY_BASE
  ? Number(process.env.LIVE_PROPERTY_BASE)
  : 1_000_000 + Math.floor(Math.random() * 1_000_000_000);
/** Review round 4's range (seed 777102 found R1): always run, as a regression. */
const REGRESSION_BASE = 777_000;

async function runRange(label: string, seeds: number[]): Promise<void> {
  const started = jest.getRealSystemTime();
  const failed: { seed: number; log: string[] }[] = [];
  for (const seed of seeds) {
    const r = await runSequence(seed);
    // eslint-disable-next-line no-console
    if (process.env.LIVE_PROPERTY_TRACE) console.log(`seed ${seed}:\n  ${r.log.join("\n  ")}`);
    if (!r.ok) {
      failed.push({ seed, log: r.log });
      if (failed.length >= 3) break;
    }
  }
  // eslint-disable-next-line no-console
  console.log(
    `[live-intent property] ${label}: ${seeds.length} sequences (seeds ${seeds[0]}..${seeds[seeds.length - 1]}) in ${jest.getRealSystemTime() - started} ms`,
  );
  if (failed.length) {
    throw new Error(
      `${label}: failing seeds ${failed.map((f) => f.seed).join(", ")} (re-run one with LIVE_PROPERTY_SEED=<seed>)\n\n` +
        failed.map((f) => `seed ${f.seed}:\n  ${f.log.join("\n  ")}`).join("\n\n"),
    );
  }
}

const range = (base: number, n: number) => Array.from({ length: n }, (_, i) => base + i);

if (ONLY_SEED !== null) {
  it(`the athlete's last choice always wins (seed ${ONLY_SEED})`, async () => {
    await runRange("pinned", [ONLY_SEED]);
  }, 600_000);
} else {
  it(`the athlete's last choice always wins (${SEQUENCES} sequences from random base ${RANDOM_BASE})`, async () => {
    await runRange(`random base ${RANDOM_BASE}`, range(RANDOM_BASE, SEQUENCES));
  }, 600_000);

  it(`the athlete's last choice always wins (regression range ${REGRESSION_BASE}, ${REGRESSION_SEQUENCES} sequences)`, async () => {
    await runRange(`regression base ${REGRESSION_BASE}`, range(REGRESSION_BASE, REGRESSION_SEQUENCES));
  }, 600_000);
}
