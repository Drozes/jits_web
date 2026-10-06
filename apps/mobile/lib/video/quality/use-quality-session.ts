import * as React from "react";
import {
  QualityController,
  networkKey,
  selectStartRendition,
  type Availability,
  type ControllerConditions,
  type NetworkSnapshot,
  type PlaybackSettings,
  type QualityDecision,
  type QualityPreference,
  type ServedRendition,
  type StartSelection,
  type TargetRendition,
} from "@jits/shared/utils";
import type { PlaybackTelemetry } from "@/lib/video/use-playback-telemetry";
import type { SettingsSource } from "@/lib/video/playback-telemetry";
import { getPlaybackHistory, hydratePlaybackHistory } from "./history-store";
import { currentNetworkSnapshot, networkSnapshotForStart, subscribeNetwork } from "./network-store";
import { getPlaybackQualityPreference, hydratePlaybackQualityPreference } from "./preference";
import { hydratePlaybackSettingsCache, refreshPlaybackSettings, resolvePlaybackSettings } from "./settings-store";

/**
 * The adaptive quality glue shared by BOTH players (the single player and
 * the multi-angle player), so the policy is never forked: one start
 * selection per screen session, one `QualityController`, fed by the
 * telemetry session's counted stalls, the player's conditions, ticks and
 * network changes. The player only says how to read its conditions and how
 * to apply a decision (its own in-place swap).
 */

/** The longest a start waits for the stored preference, settings and history. */
export const START_PREP_MS = 300;
/** Ticks while a counted stall is open (time updates may pause during one). */
const STALL_TICK_MS = 250;

export interface QualityStart extends StartSelection {
  preference: QualityPreference;
  settings: PlaybackSettings;
  source: SettingsSource;
  network: NetworkSnapshot | null;
}

/**
 * Everything a start needs, in parallel and capped: the stored preference,
 * the cached settings and the history (AsyncStorage, at most START_PREP_MS)
 * and a network snapshot (its own 300 ms cap). Never rejects.
 */
export async function prepareQualityStart(now = () => Date.now()): Promise<QualityStart> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stores = Promise.all([
    hydratePlaybackQualityPreference(),
    hydratePlaybackSettingsCache(),
    hydratePlaybackHistory(),
  ]).catch(() => undefined);
  const capped = Promise.race([
    stores,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, START_PREP_MS);
    }),
  ]);
  const [, network] = await Promise.all([capped, networkSnapshotForStart().catch(() => null)]);
  if (timer) clearTimeout(timer);
  void refreshPlaybackSettings();
  const preference = getPlaybackQualityPreference();
  const { settings, source } = resolvePlaybackSettings(now());
  const history = getPlaybackHistory(networkKey(network));
  const selection = selectStartRendition({ preference, network, history, settings, now: now() });
  return { ...selection, preference, settings, source, network };
}

/** What the player knows about itself right now. */
export type PlayerConditions = Omit<ControllerConditions, "networkKey" | "expensive">;

export interface QualitySession {
  /** A new start selection and controller (screen open, or an outside navigation). */
  begin: () => Promise<TargetRendition>;
  /** The rendition to sign now (waits for the start selection the first time). */
  signTarget: () => Promise<TargetRendition>;
  /** The same, synchronously (the start target until the selection lands, 720 before any). */
  currentTarget: () => TargetRendition;
  /** Re-read the player's conditions (and tick); applies any decision. */
  feed: () => void;
  /** A file is on the player (first sign, re-sign, retry): the level follows what it serves. */
  attached: (served: ServedRendition, available: Availability) => void;
  /** The in-flight quality swap landed on this served file. */
  landed: (served: ServedRendition, available: Availability) => void;
  /** The in-flight quality swap was superseded or failed. */
  failed: () => void;
  /** An angle switch landed on a file serving this. */
  angleChanged: (served: ServedRendition, available: Availability) => void;
}

export function useQualitySession(opts: {
  telemetry: PlaybackTelemetry;
  readConditions: () => PlayerConditions;
  /** Apply a decision with the player's own swap. Return false when it cannot (then it counts as failed). */
  apply: (d: QualityDecision) => boolean;
}): QualitySession {
  const { telemetry } = opts;
  const optsRef = React.useRef(opts);
  optsRef.current = opts;
  const controllerRef = React.useRef<QualityController | null>(null);
  const startRef = React.useRef<Promise<TargetRendition> | null>(null);
  const genRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const stallTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const handle = React.useCallback(
    (d: QualityDecision | null) => {
      const c = controllerRef.current;
      if (!d || !c) return;
      c.switchIssued(d, Date.now());
      const s = c.state;
      telemetry.qualitySwitchStarted(d.from, d.to, d.reason, { lockedLow: s.lockedLow, capReached: s.capReached });
      let ok = false;
      try {
        ok = optsRef.current.apply(d);
      } catch {
        ok = false;
      }
      if (!ok) c.switchFailed(Date.now());
    },
    [telemetry],
  );

  const feed = React.useCallback(() => {
    const c = controllerRef.current;
    if (!c || !mountedRef.current) return;
    const net = currentNetworkSnapshot();
    const cond: ControllerConditions = {
      ...optsRef.current.readConditions(),
      networkKey: net ? networkKey(net) : null,
      expensive: net?.isExpensive === true,
    };
    const now = Date.now();
    const d = c.setConditions(cond, now) ?? c.tick(now);
    handle(d);
  }, [handle]);

  const begin = React.useCallback(() => {
    const gen = ++genRef.current;
    controllerRef.current = null;
    const p = prepareQualityStart().then((start) => {
      if (gen !== genRef.current) return controllerRef.current?.target ?? start.target;
      controllerRef.current = new QualityController({
        settings: start.settings,
        preference: start.preference,
        target: start.target,
        // Unknown until the first sign: assume both, the signer's answer replaces it.
        available: { "720": true, "360": true },
        now: Date.now(),
      });
      telemetry.setQuality(
        {
          qualityPreference: start.preference,
          settingsVersion: start.settings.version,
          settingsSource: start.source,
          adaptiveEnabled: start.settings.adaptive,
          networkKey: start.networkKey,
          connectionExpensive: start.network?.isExpensive === true,
          startTarget: start.target,
          startReason: start.reason,
        },
        start.settings,
      );
      return start.target;
    });
    startRef.current = p;
    return p;
  }, [telemetry]);

  const signTarget = React.useCallback(() => {
    const c = controllerRef.current;
    if (c) return Promise.resolve(c.target);
    return (startRef.current ?? begin()).then(() => controllerRef.current?.target ?? "720");
  }, [begin]);

  const currentTarget = React.useCallback((): TargetRendition => controllerRef.current?.target ?? "720", []);

  React.useEffect(() => {
    mountedRef.current = true;
    const stopStalls = telemetry.onStall((event) => {
      const c = controllerRef.current;
      if (!c) return;
      if (event.kind === "start") {
        feed();
        // Before handling: a step-down issued here closes the stall (and this timer).
        if (!stallTimerRef.current) stallTimerRef.current = setInterval(feed, STALL_TICK_MS);
        handle(c.stallStarted(event.at));
      } else {
        if (stallTimerRef.current) clearInterval(stallTimerRef.current);
        stallTimerRef.current = null;
        handle(c.stallEnded(event.at));
      }
    });
    const stopNetwork = subscribeNetwork(feed);
    return () => {
      mountedRef.current = false;
      stopStalls();
      stopNetwork();
      if (stallTimerRef.current) clearInterval(stallTimerRef.current);
      stallTimerRef.current = null;
    };
  }, [telemetry, feed, handle]);

  return React.useMemo<QualitySession>(
    () => ({
      begin,
      signTarget,
      currentTarget,
      feed,
      attached: (served, available) => controllerRef.current?.sourceAttached(served, available, Date.now()),
      landed: (served, available) => controllerRef.current?.switchLanded(available, Date.now(), served),
      failed: () => controllerRef.current?.switchFailed(Date.now()),
      angleChanged: (served, available) => controllerRef.current?.angleChanged(available, Date.now(), served),
    }),
    [begin, signTarget, currentTarget, feed],
  );
}

/** A served rendition and availability for a signed source (defensive for partial data). */
export function servedOf(data: {
  servedRendition?: ServedRendition;
  sourceKind?: "normalized" | "original";
  available?: Availability;
}): { served: ServedRendition; available: Availability } {
  const served = data.servedRendition ?? (data.sourceKind === "normalized" ? "720" : "original");
  const available = data.available ?? { "720": served === "720", "360": served === "360" };
  return { served, available };
}
