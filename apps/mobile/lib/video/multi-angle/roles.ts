import { isHard, type SyncTrust } from "./trust";
import { playingCap, type DeviceTier } from "./device-tier";

/**
 * Which angle players run hot (playing, lock-stepped), which stay warm
 * (loaded, paused, re-seeked on a switch), and whose audio is the master
 * clock, for one visible angle. Pure (research 01, sections 1 and 3, and
 * the owner's 2026-10-05 decisions):
 *
 *  - An audio-synced (or reference) angle on screen: the reference keeps
 *    playing unmuted as the master clock and the audio bed; the visible
 *    angle runs muted in step with it. With the reference itself on screen,
 *    the next audio-synced angle runs as a hidden hot standby.
 *  - A clock-only angle on screen: it plays alone, with its own audio, and
 *    is its own clock. Nothing is lock-stepped to it.
 *  - Never more than `playingCap` players decode at once (2 on Android, 2
 *    on iOS, 1 on a warm-only phone). A warm-only phone plays only the
 *    visible angle, with its own audio (audio follows picture there).
 *  - An angle that is not hot-eligible (an HEVC original on Android, or one
 *    demoted after a decoder error) is never a hidden standby.
 */
export interface PlanAngle {
  id: string;
  trust: SyncTrust;
  hotEligible: boolean;
}

export interface PlanInput {
  angles: PlanAngle[];
  visibleId: string;
  referenceId: string;
  os: string;
  tier: DeviceTier;
}

export interface AnglePlan {
  visibleId: string;
  /** The audio bed and the clock the others follow. */
  masterId: string;
  /** Playing players, master first. */
  hot: string[];
  /** Loaded and paused. */
  warm: string[];
  /** A standby the decoder cap kept warm (telemetry), or null. */
  capped: string | null;
}

export function planAngles({ angles, visibleId, referenceId, os, tier }: PlanInput): AnglePlan {
  const visible = angles.find((a) => a.id === visibleId);
  if (!visible) return { visibleId, masterId: visibleId, hot: [visibleId], warm: angles.map((a) => a.id).filter((id) => id !== visibleId), capped: null };
  const cap = playingCap(os, tier);
  const reference = angles.find((a) => a.id === referenceId) ?? null;
  const others = angles.filter((a) => a.id !== visibleId);
  const standbyFor = (exclude: string[]) =>
    others.find((a) => !exclude.includes(a.id) && isHard(a.trust) && a.hotEligible) ?? null;

  let masterId = visibleId;
  let hot = [visibleId];
  let capped: string | null = null;

  if (!isHard(visible.trust)) {
    // Clock-only on screen: alone, own audio, nothing in step with it.
  } else if (visible.id !== referenceId && reference && reference.hotEligible) {
    // Keep the reference's audio under an audio-synced picture.
    if (cap >= 2) {
      masterId = reference.id;
      hot = [reference.id, visibleId];
    } else {
      capped = reference.id;
    }
  } else {
    const standby = standbyFor([visibleId]);
    if (standby) {
      if (cap >= 2) hot = [visibleId, standby.id];
      else capped = standby.id;
    }
  }
  const warm = angles.map((a) => a.id).filter((id) => !hot.includes(id));
  return { visibleId, masterId, hot, warm, capped };
}

/**
 * How a switch happens (research 01, section 1):
 *   swap  the target is hot and in step: an instant opacity swap.
 *   seek  both ends audio-synced but the target is warm or out of step: an
 *         exact seek and play behind a held thumbnail of the outgoing frame.
 *   dip   either end is clock-only: a short dip to black, the target seeks
 *         to the approximate time and plays with its own audio.
 */
export type SwitchMode = "swap" | "seek" | "dip";

export function switchModeFor(fromTrust: SyncTrust, toTrust: SyncTrust, target: { hot: boolean; inStep: boolean }): SwitchMode {
  if (!isHard(fromTrust) || !isHard(toTrust)) return "dip";
  return target.hot && target.inStep ? "swap" : "seek";
}
