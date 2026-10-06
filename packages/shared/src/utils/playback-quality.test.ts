import { describe, it, expect } from "vitest";
import fixture from "./__fixtures__/playback-settings-defaults.json";
import {
  BUILTIN_PLAYBACK_SETTINGS,
  historyEntryFrom,
  isBadEntry,
  isGoodEntry,
  mergePlaybackSettings,
  networkKey,
  parsePlaybackSettings,
  pickPlaybackPath,
  selectStartRendition,
  toNetworkSnapshot,
  type NetworkSnapshot,
  type PlaybackHistoryEntry,
  type PlaybackHistorySource,
  type PlaybackSettings,
} from "./playback-quality";

const B = BUILTIN_PLAYBACK_SETTINGS;
const settings = (patch: (s: PlaybackSettings) => void = () => undefined): PlaybackSettings => {
  const s = JSON.parse(JSON.stringify(B)) as PlaybackSettings;
  patch(s);
  return s;
};
const parse = (raw: unknown) => parsePlaybackSettings(raw).settings;

describe("BUILTIN_PLAYBACK_SETTINGS", () => {
  it("deep-equals the fixture mirrored byte-for-byte from jr_be docs/fixtures", () => {
    expect(B).toEqual(fixture);
  });
});

describe("mergePlaybackSettings (spec 2.4)", () => {
  it("overlays known nested keys one level deep, drops unknown keys, replaces arrays and scalars wholesale", () => {
    const m = mergePlaybackSettings(B as never, {
      version: 1,
      stepDown: { stallMs: 1500, bogus: 1 },
      stepUp: { networks: ["wifi"] },
      unknownTop: 1,
      maxSwitchesPerSession: 2,
    });
    expect(Object.keys(m).sort()).toEqual(Object.keys(B).sort());
    expect(m.stepDown).toEqual({ ...B.stepDown, stallMs: 1500 });
    expect(m.stepUp).toEqual({ ...B.stepUp, networks: ["wifi"] });
    expect(m.maxSwitchesPerSession).toBe(2);
  });

  it("a non-object group in stored replaces the group as is (validation repairs it)", () => {
    const m = mergePlaybackSettings(B as never, { stepDown: 5 });
    expect(m.stepDown).toBe(5);
  });

  it("a non-object stored value yields the defaults", () => {
    expect(mergePlaybackSettings(B as never, null)).toEqual(B);
    expect(mergePlaybackSettings(B as never, [1])).toEqual(B);
  });
});

describe("parsePlaybackSettings (spec 2.5)", () => {
  it.each([[null], [undefined], ["x"], [5], [[]], [{}], [{ version: 2 }], [{ version: "1" }]])(
    "returns the builtin with valid:false for %j",
    (raw) => {
      expect(parsePlaybackSettings(raw)).toEqual({ settings: B, valid: false });
    },
  );

  it("returns a copy: mutating the result never touches the builtin", () => {
    const { settings: s } = parsePlaybackSettings({ version: 1 });
    s.stepUp.networks.push("none");
    s.start.wifi = "360";
    expect(B.stepUp.networks).toEqual(["wifi", "ethernet", "cellular_5g", "cellular_4g"]);
    expect(B.start.wifi).toBe("720");
    expect(parsePlaybackSettings(null).settings).not.toBe(B);
  });

  it("{version:1} alone is the builtin, valid", () => {
    expect(parsePlaybackSettings({ version: 1 })).toEqual({ settings: B, valid: true });
  });

  it("applies a partial override and drops unknown keys", () => {
    const r = parsePlaybackSettings({
      version: 1,
      adaptive: false,
      start: { cellular_4g: "360", moon: "720" },
      expensive: { cellular: "360" },
      stepDown: { stallMs: 1500 },
      extra: true,
    });
    expect(r.valid).toBe(true);
    expect(r.settings.adaptive).toBe(false);
    expect(r.settings.start).toEqual({ ...B.start, cellular_4g: "360" });
    expect(r.settings.expensive).toEqual({ cellular: "360", wifi: "default" });
    expect(r.settings.stepDown).toEqual({ ...B.stepDown, stallMs: 1500 });
    expect(r.settings).not.toHaveProperty("extra");
  });

  it("a non-object group falls back to the builtin group", () => {
    expect(parse({ version: 1, stepDown: 5, history: "x", start: null }).stepDown).toEqual(B.stepDown);
    expect(parse({ version: 1, history: "x" }).history).toEqual(B.history);
    expect(parse({ version: 1, start: null }).start).toEqual(B.start);
  });

  // [path, bad values, a good value]
  const fields: Array<[string, unknown[], unknown]> = [
    ["adaptive", ["true", 1, null], false],
    ["start.wifi", ["1080", 720, null], "360"],
    ["start.none", ["480"], "720"],
    ["expensive.cellular", ["720", true], "360"],
    ["expensive.wifi", ["", null], "360"],
    ["stepDown.stallMs", [249, 10001, 1000.5, "1000"], 250],
    ["stepDown.stallCount", [0, 11, 1.5], 10],
    ["stepDown.windowMs", [4999, 300001], 5000],
    ["stepDown.cooldownMs", [-1, 60001], 0],
    ["stepUp.smoothMs", [4999, 600001], 600000],
    ["stepUp.smoothMsAfterStepDown", [1800001, -1, "90000"], 1800000],
    ["stepUp.cooldownMs", [-1, 300001], 300000],
    ["stepUp.networks", [["wifi", "wifi"], ["moon"], "wifi", Array(11).fill("wifi"), [1]], []],
    ["stepUp.onExpensive", ["false", 0], false],
    ["relapse.windowMs", [-1, 600001], 0],
    ["maxSwitchesPerSession", [-1, 21, 2.5], 0],
    ["history.maxEntries", [0, 21], 20],
    ["history.lookbackMs", [3599999, 2592000001], 3600000],
    ["history.lookbackCount", [0, 21], 1],
    ["history.minWatchMs", [-1, 600001], 0],
    ["history.badStallCount", [0, 21], 20],
    ["history.badStallMs", [249, 60001], 60000],
    ["history.badStartupMs", [999, 60001], 1000],
    ["history.downgradeIfNewestBad", ["yes"], false],
    ["history.downgradeBadCount", [0, 1.5], 1],
    ["history.upgradeGoodCount", [0, "3"], 1],
  ];
  const at = (obj: unknown, path: string) => path.split(".").reduce<any>((o, k) => o?.[k], obj);
  const withValue = (path: string, value: unknown) => {
    const keys = path.split(".");
    if (keys.length === 1) return { version: 1, [keys[0]]: value };
    return { version: 1, [keys[0]]: { [keys[1]]: value } };
  };

  it.each(fields)("%s: each out-of-range value is replaced by the builtin; an in-range one is kept", (path, bad, good) => {
    for (const v of bad) {
      const r = parsePlaybackSettings(withValue(path, v));
      expect(r.valid).toBe(true);
      expect(at(r.settings, path)).toEqual(at(B, path));
    }
    expect(at(parse(withValue(path, good)), path)).toEqual(good);
  });

  it("cross-field: smoothMsAfterStepDown below smoothMs becomes smoothMs", () => {
    const s = parse({ version: 1, stepUp: { smoothMs: 60000, smoothMsAfterStepDown: 40000 } });
    expect(s.stepUp.smoothMsAfterStepDown).toBe(60000);
  });

  it("cross-field: lookbackCount is capped by maxEntries, the two counts by lookbackCount", () => {
    const s = parse({ version: 1, history: { maxEntries: 2, lookbackCount: 5, downgradeBadCount: 4, upgradeGoodCount: 3 } });
    expect(s.history.lookbackCount).toBe(2);
    expect(s.history.downgradeBadCount).toBe(2);
    expect(s.history.upgradeGoodCount).toBe(2);
  });
});

describe("networkKey (spec 2.3)", () => {
  const snap = (type: string | null, gen: string | null = null): NetworkSnapshot => ({
    type,
    cellularGeneration: gen,
    isExpensive: false,
  });
  it.each([
    [snap("wifi"), "wifi"],
    [snap("ethernet"), "ethernet"],
    [snap("cellular", "5g"), "cellular_5g"],
    [snap("cellular", "4g"), "cellular_4g"],
    [snap("cellular", "3g"), "cellular_3g"],
    [snap("cellular", "2g"), "cellular_2g"],
    [snap("cellular", null), "cellular_unknown"],
    [snap("cellular", "6g"), "cellular_unknown"],
    [snap("none"), "none"],
    [snap("unknown"), "unknown"],
    [snap(null), "unknown"],
    [null, "unknown"],
    [snap("bluetooth"), "other"],
    [snap("wimax"), "other"],
    [snap("vpn"), "other"],
    [snap("other"), "other"],
    [snap("carrier-pigeon"), "other"],
  ])("%j -> %s", (state, key) => {
    expect(networkKey(state)).toBe(key);
  });

  it("reads a raw NetInfo state too", () => {
    expect(networkKey({ type: "cellular", details: { cellularGeneration: "4g", isConnectionExpensive: true } })).toBe("cellular_4g");
    expect(networkKey({ type: "wifi", details: null })).toBe("wifi");
  });

  it("toNetworkSnapshot: isExpensive only when isConnectionExpensive === true", () => {
    expect(toNetworkSnapshot(null)).toBeNull();
    expect(toNetworkSnapshot({ type: "cellular", details: { cellularGeneration: "3g", isConnectionExpensive: true } })).toEqual({
      type: "cellular",
      cellularGeneration: "3g",
      isExpensive: true,
    });
    expect(toNetworkSnapshot({ type: "wifi", details: { isConnectionExpensive: "yes" } })?.isExpensive).toBe(false);
    expect(toNetworkSnapshot({ type: "wifi" })).toEqual({ type: "wifi", cellularGeneration: null, isExpensive: false });
  });
});

const NOW = 1_800_000_000_000;
function entry(over: Partial<PlaybackHistoryEntry> = {}): PlaybackHistoryEntry {
  return {
    ts: NOW - 60_000,
    rendition: "720",
    finalRendition: "720",
    ttffMs: 1200,
    signMs: 300,
    stallCount: 0,
    stallMs: 0,
    watchMs: 60_000,
    steppedDown: false,
    ...over,
  };
}
const good = (over: Partial<PlaybackHistoryEntry> = {}) => entry(over);
const bad = (over: Partial<PlaybackHistoryEntry> = {}) => entry({ stallCount: 2, ...over });

describe("bad and good entries (spec 3.4)", () => {
  it("bad: stepped down, stall count, stall time, or slow player startup", () => {
    expect(isBadEntry(entry(), B)).toBe(false);
    expect(isBadEntry(entry({ steppedDown: true }), B)).toBe(true);
    expect(isBadEntry(entry({ stallCount: 1 }), B)).toBe(false);
    expect(isBadEntry(entry({ stallCount: 2 }), B)).toBe(true);
    expect(isBadEntry(entry({ stallMs: 2999 }), B)).toBe(false);
    expect(isBadEntry(entry({ stallMs: 3000 }), B)).toBe(true);
    // Startup is ttff minus sign time.
    expect(isBadEntry(entry({ ttffMs: 5299, signMs: 300 }), B)).toBe(false);
    expect(isBadEntry(entry({ ttffMs: 5300, signMs: 300 }), B)).toBe(true);
    expect(isBadEntry(entry({ ttffMs: 5000, signMs: null }), B)).toBe(true);
    expect(isBadEntry(entry({ ttffMs: null, signMs: null }), B)).toBe(false);
  });

  it("good: not bad and watched at least minWatchMs", () => {
    expect(isGoodEntry(entry(), B)).toBe(true);
    expect(isGoodEntry(entry({ watchMs: 9999 }), B)).toBe(false);
    expect(isGoodEntry(entry({ stallCount: 2 }), B)).toBe(false);
  });
});

describe("historyEntryFrom (spec 3.4)", () => {
  const src = (over: Partial<PlaybackHistorySource> = {}): PlaybackHistorySource => ({
    surface: "match",
    sourceKind: "normalized",
    endedInError: false,
    networkKey: "wifi",
    startRendition: "720",
    finalRendition: "360",
    timeToFirstFrameMs: 1500,
    signMs: 400,
    stallCount: 0,
    stallMs: 0,
    watchMs: 20_000,
    steppedDown: false,
    ...over,
  });

  it("builds the entry from the summary", () => {
    expect(historyEntryFrom(src(), B, NOW)).toEqual({
      key: "wifi",
      entry: {
        ts: NOW,
        rendition: "720",
        finalRendition: "360",
        ttffMs: 1500,
        signMs: 400,
        stallCount: 0,
        stallMs: 0,
        watchMs: 20_000,
        steppedDown: false,
      },
    });
  });

  it.each([
    ["a reel", { surface: "highlight" }],
    ["no file reached the player", { sourceKind: null }],
    ["ended in error", { endedInError: true }],
    ["no network key", { networkKey: null }],
    ["an unknown network key", { networkKey: "moon" }],
    ["too short and clean", { watchMs: 9999 }],
  ])("writes nothing for %s", (_name, over) => {
    expect(historyEntryFrom(src(over as Partial<PlaybackHistorySource>), B, NOW)).toBeNull();
  });

  it.each([
    ["a stall", { watchMs: 100, stallCount: 1 }],
    ["a step-down", { watchMs: 100, steppedDown: true }],
    ["a slow startup", { watchMs: 0, timeToFirstFrameMs: 5400, signMs: 400 }],
  ])("a short session still counts with %s", (_name, over) => {
    expect(historyEntryFrom(src(over), B, NOW)).not.toBeNull();
  });

  it("a continuation (null ttff) is recorded", () => {
    expect(historyEntryFrom(src({ timeToFirstFrameMs: null, signMs: null }), B, NOW)?.entry.ttffMs).toBeNull();
  });
});

describe("selectStartRendition (spec 3.2)", () => {
  const net = (type: string | null, gen: string | null = null, isExpensive = false): NetworkSnapshot => ({
    type,
    cellularGeneration: gen,
    isExpensive,
  });
  const sel = (over: Partial<Parameters<typeof selectStartRendition>[0]> = {}) =>
    selectStartRendition({ preference: "auto", network: net("wifi"), history: [], settings: B, now: NOW, ...over });

  it("High always targets 720, Data saver always 360, whatever the network and history", () => {
    expect(sel({ preference: "high", network: net("cellular", "2g"), history: [bad(), bad()] })).toEqual({
      target: "720",
      reason: "user_high",
      networkKey: "cellular_2g",
    });
    expect(sel({ preference: "data_saver", history: [good(), good(), good()] })).toEqual({
      target: "360",
      reason: "user_data_saver",
      networkKey: "wifi",
    });
  });

  it("Auto starts from the start table (4G/5G at 720 by default, owner decision)", () => {
    expect(sel()).toEqual({ target: "720", reason: "network_default", networkKey: "wifi" });
    expect(sel({ network: net("ethernet") }).target).toBe("720");
    expect(sel({ network: net("cellular", "5g", true) })).toEqual({ target: "720", reason: "network_default", networkKey: "cellular_5g" });
    expect(sel({ network: net("cellular", "4g", true) }).target).toBe("720");
    expect(sel({ network: net("cellular", "3g") })).toEqual({ target: "360", reason: "network_default", networkKey: "cellular_3g" });
    expect(sel({ network: net("cellular", "2g") }).target).toBe("360");
    expect(sel({ network: net("cellular") }).target).toBe("360");
    expect(sel({ network: net("bluetooth") })).toEqual({ target: "360", reason: "network_default", networkKey: "other" });
    expect(sel({ network: net("none") }).target).toBe("360");
  });

  it("network_unknown for a null snapshot or the unknown key", () => {
    expect(sel({ network: null })).toEqual({ target: "360", reason: "network_unknown", networkKey: "unknown" });
    expect(sel({ network: net("unknown") }).reason).toBe("network_unknown");
    const s = settings((x) => (x.start.unknown = "720"));
    expect(sel({ network: null, settings: s })).toEqual({ target: "720", reason: "network_unknown", networkKey: "unknown" });
  });

  it("expensive cellular: '360' forces 360, 'default' keeps the table", () => {
    const force = settings((x) => (x.expensive.cellular = "360"));
    expect(sel({ network: net("cellular", "4g", true), settings: force })).toEqual({
      target: "360",
      reason: "expensive_cellular",
      networkKey: "cellular_4g",
    });
    expect(sel({ network: net("cellular", "4g", false), settings: force }).reason).toBe("network_default");
    expect(sel({ network: net("cellular", "4g", true) }).reason).toBe("network_default");
    // An expensive Wi-Fi hotspot is not cellular.
    expect(sel({ network: net("wifi", null, true), settings: force }).reason).toBe("network_default");
  });

  it("expensive wifi: '360' forces 360, 'default' keeps the table", () => {
    const force = settings((x) => (x.expensive.wifi = "360"));
    expect(sel({ network: net("wifi", null, true), settings: force })).toEqual({
      target: "360",
      reason: "expensive_wifi",
      networkKey: "wifi",
    });
    expect(sel({ network: net("wifi", null, true) }).reason).toBe("network_default");
    expect(sel({ network: net("ethernet", null, true), settings: force }).reason).toBe("network_default");
  });

  it("history_stalls when the newest considered entry is bad", () => {
    expect(sel({ history: [bad({ ts: NOW - 1000 }), good({ ts: NOW - 2000 })] })).toEqual({
      target: "360",
      reason: "history_stalls",
      networkKey: "wifi",
    });
    const off = settings((x) => (x.history.downgradeIfNewestBad = false));
    expect(sel({ history: [bad({ ts: NOW - 1000 }), good({ ts: NOW - 2000 })], settings: off }).reason).toBe("network_default");
  });

  it("history_stalls by count of bad entries among the newest lookbackCount", () => {
    const off = settings((x) => (x.history.downgradeIfNewestBad = false));
    const h = [good({ ts: NOW - 1000 }), bad({ ts: NOW - 2000 }), bad({ ts: NOW - 3000 })];
    expect(sel({ history: h, settings: off }).reason).toBe("history_stalls");
    // A bad entry beyond lookbackCount (3) does not count.
    const h2 = [good({ ts: NOW - 1000 }), bad({ ts: NOW - 2000 }), good({ ts: NOW - 3000 }), bad({ ts: NOW - 4000 })];
    expect(sel({ history: h2, settings: off }).reason).toBe("network_default");
  });

  it("orders history newest first even when handed out of order", () => {
    const h = [good({ ts: NOW - 5000 }), bad({ ts: NOW - 1000 })];
    expect(sel({ history: h }).reason).toBe("history_stalls");
  });

  it("ignores entries older than lookbackMs", () => {
    const old = [bad({ ts: NOW - 86_400_001 }), bad({ ts: NOW - 90_000_000 })];
    expect(sel({ history: old }).reason).toBe("network_default");
    expect(sel({ history: [bad({ ts: NOW - 86_400_000 })] }).reason).toBe("history_stalls");
  });

  it("adaptive:false skips history entirely", () => {
    const off = settings((x) => (x.adaptive = false));
    expect(sel({ history: [bad(), bad()], settings: off })).toEqual({ target: "720", reason: "network_default", networkKey: "wifi" });
    const ok3 = [good({ ts: NOW - 1 }), good({ ts: NOW - 2 }), good({ ts: NOW - 3 })];
    expect(sel({ network: net("cellular", "3g"), history: ok3, settings: off }).target).toBe("360");
  });

  it("history_good: a 360 start on an allowed network steps up after enough good 720 sessions", () => {
    const s = settings((x) => (x.start.cellular_4g = "360"));
    const ok3 = [good({ ts: NOW - 1 }), good({ ts: NOW - 2 }), good({ ts: NOW - 3 })];
    expect(sel({ network: net("cellular", "4g"), history: ok3, settings: s })).toEqual({
      target: "720",
      reason: "history_good",
      networkKey: "cellular_4g",
    });
    // Not enough entries.
    expect(sel({ network: net("cellular", "4g"), history: ok3.slice(0, 2), settings: s }).reason).toBe("network_default");
    // One ended on 360.
    const ended360 = [good({ ts: NOW - 1 }), good({ ts: NOW - 2, finalRendition: "360" }), good({ ts: NOW - 3 })];
    expect(sel({ network: net("cellular", "4g"), history: ended360, settings: s }).reason).toBe("network_default");
    // One too short to be good.
    const short = [good({ ts: NOW - 1 }), good({ ts: NOW - 2, watchMs: 5000 }), good({ ts: NOW - 3 })];
    expect(sel({ network: net("cellular", "4g"), history: short, settings: s }).reason).toBe("network_default");
  });

  it("history_good only on stepUp.networks and only when expensive is allowed", () => {
    const ok3 = [good({ ts: NOW - 1 }), good({ ts: NOW - 2 }), good({ ts: NOW - 3 })];
    // cellular_3g is not an allowed step-up network.
    expect(sel({ network: net("cellular", "3g"), history: ok3 }).reason).toBe("network_default");
    const s = settings((x) => {
      x.start.cellular_4g = "360";
      x.stepUp.onExpensive = false;
    });
    expect(sel({ network: net("cellular", "4g", true), history: ok3, settings: s }).reason).toBe("network_default");
    expect(sel({ network: net("cellular", "4g", false), history: ok3, settings: s }).reason).toBe("history_good");
  });

  it("history_good may lift an expensive_cellular start; never a network_unknown one", () => {
    const ok3 = [good({ ts: NOW - 1 }), good({ ts: NOW - 2 }), good({ ts: NOW - 3 })];
    const force = settings((x) => (x.expensive.cellular = "360"));
    expect(sel({ network: net("cellular", "4g", true), history: ok3, settings: force }).reason).toBe("history_good");
    const unk = settings((x) => x.stepUp.networks.push("unknown"));
    expect(sel({ network: null, history: ok3, settings: unk }).reason).toBe("network_unknown");
  });
});

describe("pickPlaybackPath (spec 5.1)", () => {
  const row = (n: string | null, o: string | null, l: string | null) => ({
    normalized_path: n,
    storage_path: o,
    playback_360_path: l,
  });
  it.each([
    // [normalized, storage, 360, target 720, target 360]
    ["N", "O", "L", { path: "N", served: "720" }, { path: "L", served: "360" }],
    ["N", "O", null, { path: "N", served: "720" }, { path: "N", served: "720" }],
    ["N", null, "L", { path: "N", served: "720" }, { path: "L", served: "360" }],
    ["N", null, null, { path: "N", served: "720" }, { path: "N", served: "720" }],
    [null, "O", "L", { path: "O", served: "original" }, { path: "L", served: "360" }],
    [null, "O", null, { path: "O", served: "original" }, { path: "O", served: "original" }],
    [null, null, "L", { path: "L", served: "360" }, { path: "L", served: "360" }],
    [null, null, null, null, null],
  ])("normalized=%s storage=%s 360=%s", (n, o, l, at720, at360) => {
    expect(pickPlaybackPath(row(n as never, o as never, l as never), "720")).toEqual(at720);
    expect(pickPlaybackPath(row(n as never, o as never, l as never), "360")).toEqual(at360);
  });
});
