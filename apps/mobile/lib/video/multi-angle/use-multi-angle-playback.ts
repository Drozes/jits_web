import * as React from "react";
import { AppState } from "react-native";
import { useVideoPlayer, type VideoPlayer } from "expo-video";
import { translateAngleTime } from "@jits/shared/utils";
import { getMatchVideoPlaybackResult, type MatchVideoPlayback } from "@jits/shared/api/queries";
import { supabase } from "@/lib/supabase/client";
import { haptics } from "@/lib/motion";
import { usePlaybackTelemetry, type PlaybackTelemetry } from "@/lib/video/use-playback-telemetry";
import type { PlaybackPhase, PlayerStateLabel } from "@/lib/match-detail/use-video-playback";
import { DriftFilter, FRAME_S, SWAP_MAX_ERROR_S, correctionFor, extrapolate } from "./sync-controller";
import { deviceTier, type DeviceInfo, type TierVerdict } from "./device-tier";
import { planAngles, switchModeFor, type AnglePlan, type SwitchMode } from "./roles";
import { isHard, offsetOf, referenceAngleId, syncTrust, type AngleVideo, type SyncTrust } from "./trust";

/**
 * Multi-angle player v1 (dev flag, research 01 section 6 v1): one expo-video
 * player per playable angle (at most three, fixed slots so the hook count
 * never changes), each rendered in its own stacked VideoView. Everything
 * here is JS against expo-video 3.0.16 APIs that build 25 links
 * (`replaceAsync`, `currentTime`, `playbackRate`, `muted`, `play`/`pause`,
 * `generateThumbnailsAsync`), so it is OTA-safe on runtime 0.5.0.
 *
 * Roles come from `planAngles`: the reference (Best angle) is the master
 * clock and audio bed while an audio-synced angle is on screen; the visible
 * angle plus at most one standby play in step (JS drift loop on the
 * master's 250 ms time updates: nudge `playbackRate`, re-seek past a
 * threshold); the rest stay warm (paused, re-seeked every WARM_NUDGE_MS).
 * Clock-only angles are never lock-stepped: they play alone with their own
 * audio, and a switch to or from one dips to black.
 *
 * The timeline (seek bar, moments, `positionS`) is the reference angle's
 * clock, so it does not jump on a switch; each player's local time is the
 * timeline translated through the sync offsets (approximate for a clock
 * angle).
 */

export const MAX_ANGLE_PLAYERS = 3;
const TIME_UPDATE_S = 0.25;
/** Warm players are re-seeked to the current moment this often while playing. */
export const WARM_NUDGE_MS = 5000;
/** A seek-mode switch shows the new angle once it reports within this of its target. */
const LAND_TOLERANCE_S = 0.5;
/** A paused seek-mode switch gets no time updates: show it after this settle. */
export const PAUSED_SETTLE_MS = 350;
/** Never hold a switch longer than this (a slow seek still lands visibly). */
export const SWITCH_TIMEOUT_MS = 1500;
/** "Switching to …" appears only when a switch takes longer than this (research 03, 4.1). */
export const SWITCHING_LABEL_MS = 400;
/** Dip to black, each way (the reel contract's clock-only join is 80 ms). */
export const DIP_MS = 80;
/** After a seek, master updates far from the target are dropped (as the single player does). */
const SEEK_LANDED_S = 1.5;
const SEEK_HOLD_MAX_UPDATES = 8;
const END_EPSILON_S = 0.5;
const MAX_SILENT_RESIGNS = 1;

export interface MultiAngleInput {
  /** The route's video id (the angle the player opens on). */
  entryId: string | undefined;
  /** `?t=` on the entry angle's clock. */
  startS: number | null;
  /** `get_match_details` videos once loaded (null until then). */
  videos: AngleVideo[] | null;
  /** Offsets read separately (getVideoSyncOffsets) for rows that do not carry them. */
  offsets: Record<string, number | null>;
  device: DeviceInfo;
  /** Reduce Motion: dips become cuts. */
  reduceMotion?: boolean;
  /** A switch landed (announce it). */
  onSwitchLanded?: (id: string, approximate: boolean) => void;
}

export interface AngleSlotView {
  index: number;
  player: VideoPlayer;
  angleId: string | null;
  visible: boolean;
  onFirstFrameRender: () => void;
}

export interface AngleEntry {
  id: string;
  trust: SyncTrust;
  /** Signed, loaded and not dead: offered by the quick switch. */
  switchable: boolean;
}

export interface MultiAnglePlayback {
  phase: PlaybackPhase;
  stateLabel: PlayerStateLabel;
  posterUrl: string | null;
  matchId: string | null;
  retry: () => void;
  slots: AngleSlotView[];
  visibleId: string | undefined;
  referenceId: string | undefined;
  angles: AngleEntry[];
  plan: AnglePlan | null;
  tier: TierVerdict;
  /** Timeline (reference clock) position, seconds. */
  positionS: number;
  durationS: number;
  playing: boolean;
  toggle: () => void;
  setPlaying: (next: boolean) => void;
  seek: (timelineS: number) => void;
  rate: number;
  setRate: (next: number | ((prev: number) => number)) => void;
  /** Paused only: one frame back or forward. */
  stepFrame: (dir: -1 | 1) => void;
  switchTo: (id: string) => SwitchMode | null;
  /** The outgoing frame held over a seek-mode switch (an expo-video VideoThumbnail). */
  heldFrame: unknown | null;
  /** Black dip overlay is up (clock-only switch). */
  dipped: boolean;
  /** The id a slow switch is heading to (shown after SWITCHING_LABEL_MS). */
  switchingTo: string | null;
  frameShown: boolean;
  telemetry: PlaybackTelemetry;
}

interface Slot {
  angleId: string | null;
  data: MatchVideoPlayback | null;
  generation: number;
  loaded: boolean;
  sample: { t: number; at: number } | null;
  appliedRate: number;
  frameShown: boolean;
  errors: number;
  demoted: boolean;
  dead: boolean;
  durationS: number;
  drift: DriftFilter;
  lastError: number | null;
  /** Local time this slot should land on (a switch's seek), or null. */
  landAt: number | null;
}

function emptySlot(): Slot {
  return {
    angleId: null,
    data: null,
    generation: 0,
    loaded: false,
    sample: null,
    appliedRate: 1,
    frameShown: false,
    errors: 0,
    demoted: false,
    dead: false,
    durationS: 0,
    drift: new DriftFilter(),
    lastError: null,
    landAt: null,
  };
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // A released player (screen unmounting).
  }
}

function phaseFor(result: Awaited<ReturnType<typeof getMatchVideoPlaybackResult>>): PlaybackPhase {
  if (!result.ok) return result.error.code === "VIDEO_FILE_MISSING" ? "missing" : "failed";
  if (!result.data) return "absent";
  if (result.data.playability === "processing") return "processing";
  return "ready";
}

const DECODER_ERROR = /decoder|codec|-11839|mediacodec|insufficient/i;

export function useMultiAnglePlayback(input: MultiAngleInput): MultiAnglePlayback {
  const setup = (p: VideoPlayer) => {
    p.timeUpdateEventInterval = TIME_UPDATE_S;
    p.preservesPitch = true;
  };
  // Fixed slots: hooks must not depend on the angle count.
  const p0 = useVideoPlayer(null, setup);
  const p1 = useVideoPlayer(null, setup);
  const p2 = useVideoPlayer(null, setup);
  const players = React.useMemo(() => [p0, p1, p2], [p0, p1, p2]);

  const tier = React.useMemo(() => deviceTier(input.device), [input.device]);
  const os = input.device.os;

  const slotsRef = React.useRef<Slot[]>([emptySlot(), emptySlot(), emptySlot()]);
  const [slotIds, setSlotIds] = React.useState<Array<string | null>>([input.entryId ?? null, null, null]);
  const [visibleId, setVisibleId] = React.useState(input.entryId);
  const visibleRef = React.useRef(input.entryId);
  const [phase, setPhase] = React.useState<PlaybackPhase>("loading");
  const [loadedTick, setLoadedTick] = React.useState(0);
  const [attempt, setAttempt] = React.useState(0);
  const [posterUrl, setPosterUrl] = React.useState<string | null>(null);
  const [matchId, setMatchId] = React.useState<string | null>(null);
  const [entryDuration, setEntryDuration] = React.useState(0);
  const [playing, setPlayingState] = React.useState(true);
  const playingRef = React.useRef(true);
  const [rate, setRateState] = React.useState(1);
  const rateRef = React.useRef(1);
  const [heldFrame, setHeldFrame] = React.useState<unknown | null>(null);
  const [dipped, setDipped] = React.useState(false);
  const [switchingTo, setSwitchingTo] = React.useState<string | null>(null);
  const [visibleFrame, setVisibleFrame] = React.useState(false);
  const [deadTick, setDeadTick] = React.useState(0);
  const mountedRef = React.useRef(true);
  const switchRef = React.useRef<{ to: string; mode: SwitchMode; timers: Array<ReturnType<typeof setTimeout>>; done: boolean } | null>(null);
  const holdRef = React.useRef<{ at: number; left: number } | null>(null);
  const positionRefS = React.useRef(0);
  const [positionS, setPositionS] = React.useState(0);
  const lastWarmNudgeRef = React.useRef(0);
  const entryStart = input.startS != null && Number.isFinite(input.startS) && input.startS > 0 ? input.startS : 0;

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const sw = switchRef.current;
      if (sw) sw.timers.forEach(clearTimeout);
    };
  }, []);

  // The telemetry session follows the visible player (its stalls are what
  // the athlete sees); it is ONE session for the screen.
  const visibleSlotIndex = Math.max(0, slotIds.indexOf(visibleId ?? null));
  const telemetry = usePlaybackTelemetry(players[visibleSlotIndex], {
    surface: "match",
    videoId: input.entryId ?? null,
    angle: null,
    angleCount: null,
    playerMode: "multi",
    deviceTier: tier.tier,
  });

  // ---- the angle model -------------------------------------------------
  const videos = input.videos;
  const offsetsMap = React.useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const v of videos ?? []) out[v.id] = offsetOf(v, input.offsets);
    return out;
  }, [videos, input.offsets]);
  const offsetsRef = React.useRef(offsetsMap);
  offsetsRef.current = offsetsMap;

  const referenceId = React.useMemo(
    () => (videos && input.entryId ? referenceAngleId(videos, input.entryId) : input.entryId),
    [videos, input.entryId],
  );
  const referenceRef = React.useRef(referenceId);
  referenceRef.current = referenceId;

  const trustOf = React.useCallback(
    (id: string): SyncTrust => {
      const v = videos?.find((x) => x.id === id);
      if (!v || !referenceRef.current) return id === referenceRef.current ? "reference" : "clock";
      return syncTrust(v, referenceRef.current, offsetsRef.current);
    },
    [videos],
  );
  const trustRef = React.useRef(trustOf);
  trustRef.current = trustOf;

  const slotOf = React.useCallback((id: string | null | undefined) => (id ? slotsRef.current.findIndex((s) => s.angleId === id) : -1), []);

  const angles = React.useMemo<AngleEntry[]>(() => {
    void loadedTick;
    void deadTick;
    return slotIds
      .filter((id): id is string => id != null)
      .map((id) => {
        const s = slotsRef.current[slotOf(id)];
        return { id, trust: trustOf(id), switchable: s != null && s.data != null && s.loaded && !s.dead };
      });
  }, [slotIds, trustOf, slotOf, loadedTick, deadTick]);

  const planFor = React.useCallback(
    (visible: string): AnglePlan =>
      planAngles({
        angles: slotsRef.current
          .filter((s) => s.angleId != null && s.data != null && !s.dead)
          .map((s) => ({
            id: s.angleId as string,
            trust: trustRef.current(s.angleId as string),
            // Play the normalized H.264 file hot; an HEVC original on Android
            // (scarce decoder sessions) is never a hidden standby.
            hotEligible: !s.demoted && !(os === "android" && s.data?.sourceKind === "original"),
          })),
        visibleId: visible,
        referenceId: referenceRef.current ?? visible,
        os,
        tier: tier.tier,
      }),
    [os, tier.tier],
  );

  // ---- time mapping ------------------------------------------------------
  const toTimeline = React.useCallback((id: string, local: number) => {
    const ref = referenceRef.current;
    if (!ref || id === ref) return local;
    return translateAngleTime(local, offsetsRef.current[id], offsetsRef.current[ref]).t;
  }, []);
  const fromTimeline = React.useCallback((id: string, t: number) => {
    const ref = referenceRef.current;
    if (!ref || id === ref) return Math.max(0, t);
    return translateAngleTime(t, offsetsRef.current[ref], offsetsRef.current[id]).t;
  }, []);

  const planRef = React.useRef<AnglePlan | null>(null);
  const [plan, setPlan] = React.useState<AnglePlan | null>(null);

  const timelineNow = React.useCallback((): number => {
    const hold = holdRef.current;
    if (hold) return hold.at;
    const p = planRef.current;
    const master = p?.masterId ?? visibleRef.current;
    const i = slotOf(master);
    const s = i >= 0 ? slotsRef.current[i] : null;
    if (!s || !master) return positionRefS.current;
    const local = extrapolate(s.sample, Date.now(), playingRef.current, s.appliedRate);
    return local == null ? positionRefS.current : toTimeline(master, local);
  }, [slotOf, toTimeline]);

  // ---- applying a plan --------------------------------------------------
  const applyPlan = React.useCallback(
    (next: AnglePlan) => {
      const prev = planRef.current;
      planRef.current = next;
      setPlan(next);
      if (next.capped && (!prev || prev.capped !== next.capped)) {
        telemetry.decoderCap(tier.tier === "warm-only" ? `warm-only:${tier.reason ?? "tier"}` : "standby-cap");
      }
      slotsRef.current.forEach((s, i) => {
        if (!s.angleId || !s.loaded || s.dead) return;
        const p = players[i];
        const hot = next.hot.includes(s.angleId);
        safely(() => {
          p.muted = s.angleId !== next.masterId;
        });
        if (hot && playingRef.current) {
          safely(() => {
            // Setting the rate on iOS starts playback: only on the way into play.
            if (p.playbackRate !== rateRef.current) p.playbackRate = rateRef.current;
            s.appliedRate = rateRef.current;
            p.play();
          });
        } else {
          safely(() => p.pause());
        }
      });
    },
    [players, telemetry, tier],
  );

  // ---- signing and loading ----------------------------------------------
  const loadSlot = React.useCallback(
    async (i: number, id: string, opts: { entry: boolean; silent: boolean }) => {
      const slot = slotsRef.current[i];
      const gen = ++slot.generation;
      slot.angleId = id;
      slot.loaded = false;
      if (opts.entry && !opts.silent) setPhase("loading");
      const result = await getMatchVideoPlaybackResult(supabase, id);
      if (!mountedRef.current || gen !== slot.generation) return;
      const next = phaseFor(result);
      if (opts.entry) telemetry.signOutcome(next === "ready" ? "ok" : next === "loading" ? "pending" : next);
      if (next !== "ready" || !result.ok || !result.data) {
        if (opts.entry) setPhase(next);
        else {
          slot.dead = true;
          setDeadTick((n) => n + 1);
        }
        return;
      }
      slot.data = result.data;
      if (opts.entry) {
        setPosterUrl(result.data.posterUrl);
        setMatchId(result.data.matchId ?? null);
        setEntryDuration(result.data.durationSeconds ?? 0);
        telemetry.sourceAttached(result.data.sourceKind ?? "original");
        setPhase("ready");
      }
      setLoadedTick((n) => n + 1);
      try {
        await players[i].replaceAsync({ uri: result.data.url });
      } catch (e) {
        if (gen === slot.generation) onSlotErrorRef.current(i, e instanceof Error ? e.message : String(e));
      }
    },
    [players, telemetry],
  );

  const onSlotErrorRef = React.useRef<(i: number, message: string | null) => void>(() => undefined);

  // The entry angle signs at once on slot 0, so the screen plays before the
  // match (and its other angles) is known.
  React.useEffect(() => {
    if (!input.entryId) {
      telemetry.signOutcome("absent");
      setPhase("absent");
      return;
    }
    const s = slotsRef.current[0];
    s.errors = 0;
    s.dead = false;
    positionRefS.current = entryStart;
    setPositionS(entryStart);
    void loadSlot(0, input.entryId, { entry: true, silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Every other playable angle is signed and loaded (warm) as soon as the
  // match is known: at most three players in all.
  const otherIds = React.useMemo(() => {
    if (!videos || !input.entryId) return [] as string[];
    const playable = videos.filter((v) => v.id !== input.entryId && (v.playability == null || v.playability === "playable"));
    // The reference (Best angle) first, then the deck's row order.
    playable.sort((a, b) => Number(b.is_primary === true) - Number(a.is_primary === true));
    return playable.slice(0, MAX_ANGLE_PLAYERS - 1).map((v) => v.id);
  }, [videos, input.entryId]);
  const otherKey = otherIds.join(",");
  React.useEffect(() => {
    if (!otherKey || phase !== "ready") return;
    otherKey.split(",").forEach((id, k) => {
      const i = k + 1;
      if (slotsRef.current[i].angleId === id) return;
      slotsRef.current[i] = emptySlot();
      void loadSlot(i, id, { entry: false, silent: true });
    });
    setSlotIds([input.entryId ?? null, ...otherKey.split(","), null].slice(0, MAX_ANGLE_PLAYERS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherKey, phase === "ready"]);

  // A slot became ready: seek it to the current moment, then re-plan.
  const onSlotReady = React.useCallback(
    (i: number) => {
      const s = slotsRef.current[i];
      if (!s.angleId || s.loaded || !s.data) return;
      s.loaded = true;
      safely(() => {
        if (players[i].duration > 0) s.durationS = players[i].duration;
      });
      const isEntry = i === 0 && s.angleId === input.entryId;
      const local = isEntry && !planRef.current ? entryStart : fromTimeline(s.angleId, timelineNow());
      if (local > 0) {
        s.drift.seeked(Date.now());
        if (s.angleId === visibleRef.current) {
          holdRef.current = { at: toTimeline(s.angleId, local), left: SEEK_HOLD_MAX_UPDATES };
          telemetry.expectWait();
        }
        safely(() => {
          players[i].currentTime = local;
        });
      }
      setLoadedTick((n) => n + 1);
      if (visibleRef.current) applyPlan(planFor(visibleRef.current));
    },
    [players, input.entryId, entryStart, fromTimeline, toTimeline, timelineNow, telemetry, applyPlan, planFor],
  );

  const retry = React.useCallback(() => {
    slotsRef.current = [emptySlot(), emptySlot(), emptySlot()];
    visibleRef.current = input.entryId;
    setVisibleId(input.entryId);
    setSlotIds([input.entryId ?? null, null, null]);
    planRef.current = null;
    setAttempt((n) => n + 1);
  }, [input.entryId]);

  // ---- errors ------------------------------------------------------------
  onSlotErrorRef.current = (i: number, message: string | null) => {
    const s = slotsRef.current[i];
    if (!s.angleId) return;
    telemetry.error(message);
    s.loaded = false;
    if (message && DECODER_ERROR.test(message) && !s.demoted) {
      // Too many decoders: this angle never runs as a hidden standby again.
      s.demoted = true;
      telemetry.decoderCap("decoder-error");
    }
    s.errors += 1;
    const visible = s.angleId === visibleRef.current;
    if (s.errors > MAX_SILENT_RESIGNS) {
      if (visible) setPhase("failed");
      else {
        s.dead = true;
        setDeadTick((n) => n + 1);
        if (visibleRef.current) applyPlan(planFor(visibleRef.current));
      }
      return;
    }
    telemetry.resigned();
    void loadSlot(i, s.angleId, { entry: i === 0 && s.angleId === input.entryId, silent: true });
  };

  // ---- player events -------------------------------------------------------
  const onMasterTimeRef = React.useRef<(i: number, t: number) => void>(() => undefined);
  React.useEffect(() => {
    const subs: Array<{ remove: () => void }> = [];
    players.forEach((p, i) => {
      safely(() => {
        subs.push(
          p.addListener("statusChange", ({ status, error }) => {
            if (status === "readyToPlay") onSlotReady(i);
            else if (status === "error") onSlotErrorRef.current(i, error?.message ?? null);
          }),
          p.addListener("sourceLoad", ({ duration }) => {
            if (duration > 0) slotsRef.current[i].durationS = duration;
          }),
          p.addListener("timeUpdate", ({ currentTime }) => {
            const s = slotsRef.current[i];
            if (!s.loaded) return;
            s.sample = { t: currentTime, at: Date.now() };
            onMasterTimeRef.current(i, currentTime);
          }),
          p.addListener("playToEnd", () => {
            if (slotsRef.current[i].angleId === planRef.current?.masterId) {
              playingRef.current = false;
              setPlayingState(false);
              if (visibleRef.current) applyPlan(planFor(visibleRef.current));
            }
          }),
        );
      });
    });
    return () => {
      for (const sub of subs) safely(() => sub.remove());
    };
  }, [players, onSlotReady, applyPlan, planFor]);

  // Every time update: a seek-mode switch may have landed; the master's
  // drives the timeline, the drift loop and the warm nudges.
  onMasterTimeRef.current = (i: number, local: number) => {
    const s = slotsRef.current[i];
    const id = s.angleId;
    if (!id) return;
    const sw = switchRef.current;
    if (sw && !sw.done && sw.to === id && s.landAt != null && Math.abs(local - s.landAt) <= LAND_TOLERANCE_S) {
      landSwitchRef.current();
    }
    const p = planRef.current;
    if (!p || id !== p.masterId) return;
    const t = toTimeline(id, local);
    const hold = holdRef.current;
    if (hold) {
      if (Math.abs(t - hold.at) > SEEK_LANDED_S && hold.left > 0) {
        hold.left -= 1;
        return;
      }
      holdRef.current = null;
    }
    positionRefS.current = t;
    setPositionS(t);
    if (!playingRef.current || (sw && !sw.done)) return;
    const now = Date.now();
    // Drift loop: every other hot, audio-synced angle follows the master.
    for (const slaveId of p.hot) {
      if (slaveId === id || !isHard(trustRef.current(slaveId))) continue;
      const k = slotOf(slaveId);
      const slave = k >= 0 ? slotsRef.current[k] : null;
      if (!slave || !slave.loaded) continue;
      const expected = fromTimeline(slaveId, t);
      const actual = extrapolate(slave.sample, now, true, slave.appliedRate);
      if (actual == null) continue;
      const smoothed = slave.drift.push(actual - expected, now);
      if (smoothed == null) continue;
      slave.lastError = smoothed;
      telemetry.syncResidual(smoothed);
      const c = correctionFor(smoothed, rateRef.current, slaveId === p.visibleId);
      if (c.kind === "seek") {
        slave.drift.seeked(now);
        // The visible slave's corrective seek is the app's own wait, not a stall.
        if (slaveId === p.visibleId) telemetry.expectWait();
        safely(() => {
          players[k].currentTime = expected;
        });
      } else if (Math.abs(slave.appliedRate - c.rate) > 0.0005) {
        slave.appliedRate = c.rate;
        safely(() => {
          players[k].playbackRate = c.rate;
        });
      }
    }
    // Warm angles: keep their buffer around the current moment.
    if (now - lastWarmNudgeRef.current >= WARM_NUDGE_MS) {
      lastWarmNudgeRef.current = now;
      for (const warmId of p.warm) {
        const k = slotOf(warmId);
        if (k < 0 || !slotsRef.current[k].loaded) continue;
        safely(() => {
          players[k].currentTime = fromTimeline(warmId, t);
        });
      }
    }
  };

  // ---- transport -----------------------------------------------------------
  const setPlaying = React.useCallback(
    (next: boolean) => {
      playingRef.current = next;
      setPlayingState(next);
      telemetry.playIntent(next);
      if (visibleRef.current) applyPlan(planFor(visibleRef.current));
    },
    [telemetry, applyPlan, planFor],
  );

  React.useEffect(() => {
    telemetry.playIntent(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        playingRef.current = false;
        setPlayingState(false);
      }
    });
    return () => sub?.remove?.();
  }, []);

  const durationS = React.useMemo(() => {
    void loadedTick;
    const ref = referenceId ? slotsRef.current[slotOf(referenceId)] : null;
    const fromVideo = videos?.find((v) => v.id === referenceId)?.duration_seconds ?? 0;
    return ref?.durationS || fromVideo || entryDuration || 0;
  }, [referenceId, videos, entryDuration, loadedTick, slotOf]);
  const durationRef = React.useRef(durationS);
  durationRef.current = durationS;

  const seek = React.useCallback(
    (timelineS: number) => {
      const d = durationRef.current;
      const t = Math.max(0, d > 0 ? Math.min(d, timelineS) : timelineS);
      positionRefS.current = t;
      setPositionS(t);
      holdRef.current = { at: t, left: SEEK_HOLD_MAX_UPDATES };
      telemetry.seekRequested();
      const now = Date.now();
      slotsRef.current.forEach((s, i) => {
        if (!s.angleId || !s.loaded) return;
        s.drift.seeked(now);
        const local = fromTimeline(s.angleId, t);
        // A switch in flight lands on the new spot, not the old one.
        if (s.landAt != null) s.landAt = local;
        safely(() => {
          players[i].currentTime = local;
        });
      });
    },
    [players, telemetry, fromTimeline],
  );

  const toggle = React.useCallback(() => {
    const d = durationRef.current;
    if (!playingRef.current && d > 0 && positionRefS.current >= d - END_EPSILON_S) seek(0);
    setPlaying(!playingRef.current);
  }, [seek, setPlaying]);

  const setRate = React.useCallback(
    (next: number | ((prev: number) => number)) => {
      const value = typeof next === "function" ? next(rateRef.current) : next;
      rateRef.current = value;
      setRateState(value);
      if (!playingRef.current) return;
      const p = planRef.current;
      slotsRef.current.forEach((s, i) => {
        if (!s.angleId || !s.loaded || !p?.hot.includes(s.angleId)) return;
        s.appliedRate = value;
        s.drift.reset();
        safely(() => {
          players[i].playbackRate = value;
        });
      });
    },
    [players],
  );

  const stepFrame = React.useCallback(
    (dir: -1 | 1) => {
      if (playingRef.current) return;
      seek(timelineNow() + dir * FRAME_S);
    },
    [seek, timelineNow],
  );

  // ---- switching -----------------------------------------------------------
  const landSwitchRef = React.useRef<() => void>(() => undefined);

  const switchTo = React.useCallback(
    (to: string): SwitchMode | null => {
      const from = visibleRef.current;
      if (!from || to === from || (switchRef.current && !switchRef.current.done)) return null;
      const k = slotOf(to);
      const target = k >= 0 ? slotsRef.current[k] : null;
      if (!target || !target.data || target.dead || !target.loaded) return null;
      const current = planRef.current;
      const fromTrust = trustRef.current(from);
      const toTrust = trustRef.current(to);
      const hot = current?.hot.includes(to) === true && playingRef.current;
      const inStep = hot && target.frameShown && target.lastError != null && Math.abs(target.lastError) <= SWAP_MAX_ERROR_S;
      const mode = switchModeFor(fromTrust, toTrust, { hot, inStep });
      const T = timelineNow();
      const nextPlan = planFor(to);
      telemetry.switchStarted(mode);
      void haptics.select();
      const sw = { to, mode, timers: [] as Array<ReturnType<typeof setTimeout>>, done: false };
      switchRef.current = sw;
      const approximate = !isHard(toTrust);

      const land = () => {
        if (sw.done || !mountedRef.current) return;
        sw.done = true;
        sw.timers.forEach(clearTimeout);
        target.landAt = null;
        visibleRef.current = to;
        setVisibleId(to);
        applyPlan(nextPlan);
        setHeldFrame(null);
        setSwitchingTo(null);
        setVisibleFrame(true);
        telemetry.switchLanded();
        input.onSwitchLanded?.(to, approximate);
        if (mode === "dip") {
          if (input.reduceMotion) setDipped(false);
          else sw.timers.push(setTimeout(() => mountedRef.current && setDipped(false), DIP_MS));
        }
      };
      landSwitchRef.current = land;

      if (mode === "swap") {
        // Already playing in step underneath: the cut is an opacity change.
        land();
        return mode;
      }
      sw.timers.push(
        setTimeout(() => {
          if (!sw.done && mountedRef.current) setSwitchingTo(to);
        }, SWITCHING_LABEL_MS),
        setTimeout(land, SWITCH_TIMEOUT_MS),
      );
      const startTarget = () => {
        if (sw.done) return;
        // Stop everything the new plan does not play BEFORE the target
        // starts, so the decoder cap holds through the switch (the outgoing
        // angle freezes under the held frame or the dip).
        slotsRef.current.forEach((s, i) => {
          if (i !== k && s.angleId && !nextPlan.hot.includes(s.angleId)) safely(() => players[i].pause());
        });
        const local = fromTimeline(to, T);
        target.landAt = local;
        target.drift.seeked(Date.now());
        telemetry.expectWait();
        safely(() => {
          players[k].currentTime = local;
        });
        if (playingRef.current) {
          safely(() => {
            players[k].muted = to !== nextPlan.masterId;
            if (players[k].playbackRate !== rateRef.current) players[k].playbackRate = rateRef.current;
            target.appliedRate = rateRef.current;
            players[k].play();
          });
        } else {
          // Paused: no time updates come; show it once the exact seek settles.
          sw.timers.push(setTimeout(land, PAUSED_SETTLE_MS));
        }
      };
      if (mode === "seek") {
        // Hold the outgoing frame (a native thumbnail) over the swap.
        const fi = slotOf(from);
        const fromSlot = fi >= 0 ? slotsRef.current[fi] : null;
        const fromLocal = fromSlot ? (extrapolate(fromSlot.sample, Date.now(), playingRef.current, fromSlot.appliedRate) ?? 0) : 0;
        safely(() => {
          void players[fi]
            .generateThumbnailsAsync([fromLocal])
            .then((thumbs) => {
              if (!sw.done && mountedRef.current && thumbs?.[0]) setHeldFrame(thumbs[0]);
            })
            .catch(() => undefined);
        });
        startTarget();
        return mode;
      }
      // Dip: black first, then the approximate cut with the target's own audio.
      setDipped(true);
      if (input.reduceMotion) startTarget();
      else sw.timers.push(setTimeout(startTarget, DIP_MS));
      return mode;
    },
    [players, slotOf, timelineNow, planFor, telemetry, applyPlan, fromTimeline, input],
  );

  // ---- first frames ----------------------------------------------------------
  const frameHandlers = React.useMemo(
    () =>
      players.map((_, i) => () => {
        const s = slotsRef.current[i];
        s.frameShown = true;
        if (s.angleId === visibleRef.current) {
          telemetry.firstFrame();
          setVisibleFrame(true);
        }
      }),
    [players, telemetry],
  );

  // Progress past the start also proves a frame (iOS can skip the event).
  React.useEffect(() => {
    if (!visibleFrame && positionS > entryStart + 0.1) setVisibleFrame(true);
  }, [positionS, entryStart, visibleFrame]);

  const slots: AngleSlotView[] = players.map((player, index) => ({
    index,
    player,
    angleId: slotIds[index] ?? null,
    visible: slotIds[index] != null && slotIds[index] === visibleId,
    onFirstFrameRender: frameHandlers[index],
  }));

  const stateLabel: PlayerStateLabel =
    phase === "ready" ? (slotsRef.current[0].loaded || planRef.current ? "loaded" : "loading") : phase === "failed" ? "error" : phase;

  return {
    phase,
    stateLabel,
    posterUrl,
    matchId,
    retry,
    slots,
    visibleId,
    referenceId,
    angles,
    plan,
    tier,
    positionS,
    durationS,
    playing,
    toggle,
    setPlaying,
    seek,
    rate,
    setRate,
    stepFrame,
    switchTo,
    heldFrame,
    dipped,
    switchingTo,
    frameShown: visibleFrame,
    telemetry,
  };
}
