/**
 * The keep-watching switch's picture (jits-xfvd.19, contract 07 sections 2.2
 * and 11.1; Motion registry "Angle crossfade", "Angle dip"): two stacked
 * slot views, the z-order rule, crossfade vs dip vs cut, the reset at idle,
 * the poster on the front only and Android TextureViews.
 */
import * as React from "react";
import { Platform } from "react-native";
import { render } from "@testing-library/react-native";

jest.mock("react-native-reanimated", () => {
  const mock = require("react-native-reanimated/mock");
  const R = require("react");
  return {
    ...mock,
    // Stable per component (as on device), so a test can read the value a
    // transition targets (the mock's withTiming returns its target at once).
    useSharedValue: (init: unknown) => R.useRef(mock.useSharedValue(init)).current,
    cancelAnimation: jest.fn(),
    withTiming: jest.fn(mock.withTiming),
    withSequence: jest.fn(mock.withSequence),
    withDelay: jest.fn(mock.withDelay),
  };
});
// The hook module (for the SwitchState type's constants) reaches the Supabase client.
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("expo-video", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    VideoView: (props: Record<string, unknown>) => R.createElement(RN.View, props),
  };
});

import { cancelAnimation, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { ON_MEDIA } from "@/lib/theme/palette";
import type { VideoPlayer } from "expo-video";
import { AngleViewStack, angleTransitionOf, topSlotOf, type AngleViewStackProps } from "@/components/film-room/angle-view-stack";
import { duration, easing, moment } from "@/lib/motion";
import { SWITCH_SETTLE_MS } from "@/lib/match-detail/use-video-playback";

const HIDDEN = { includeHiddenElements: true } as const;
const A = { name: "A" } as unknown as VideoPlayer;
const B = { name: "B" } as unknown as VideoPlayer;
const mockWithTiming = withTiming as jest.Mock;
const mockWithSequence = withSequence as jest.Mock;
const mockWithDelay = withDelay as jest.Mock;

type S = AngleViewStackProps["switchState"];
const IDLE: S = { phase: "idle", seq: 0, mode: null, fromSlot: null, incomingSlot: null, approximate: false };
const PENDING: S = { phase: "pending", seq: 1, mode: "keep_watching", fromSlot: 0, incomingSlot: 1, approximate: false };
const LANDING: S = { ...PENDING, phase: "landing" };

function stack(p: Partial<AngleViewStackProps> = {}) {
  const props: AngleViewStackProps = {
    players: [A, B],
    frontSlot: 0,
    switchState: IDLE,
    onSlotFirstFrame: jest.fn(),
    posterUrl: null,
    frameShown: true,
    reduceMotion: false,
    ...p,
  };
  return <AngleViewStack {...props} />;
}

/** A style prop's flattened value for `key` (the last one wins). */
function styleValue(node: { props: { style?: unknown } }, key: string): unknown {
  const list = [node.props.style].flat(Infinity) as Record<string, unknown>[];
  return list.reduce<unknown>((v, s) => (s && typeof s === "object" && key in s ? s[key] : v), undefined);
}

const originalOS = Platform.OS;
beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  Platform.OS = originalOS;
});

describe("topSlotOf / angleTransitionOf", () => {
  it("the top view is the front slot, except the outgoing slot while a keep-watching switch lands", () => {
    expect(topSlotOf(0, IDLE)).toBe(0);
    expect(topSlotOf(0, PENDING)).toBe(0);
    expect(topSlotOf(1, LANDING)).toBe(0);
    expect(topSlotOf(0, { ...LANDING, fromSlot: 1, incomingSlot: 0 })).toBe(1);
    // An in_place landing has no slots: the front stays on top.
    expect(topSlotOf(0, { ...LANDING, mode: "in_place", fromSlot: null, incomingSlot: null })).toBe(0);
  });

  it("crossfades an exact landing, dips an approximate one, cuts under Reduce Motion, and nothing otherwise", () => {
    expect(angleTransitionOf(IDLE, false)).toBe("none");
    expect(angleTransitionOf(PENDING, false)).toBe("none");
    expect(angleTransitionOf(LANDING, false)).toBe("crossfade");
    expect(angleTransitionOf({ ...LANDING, approximate: true }, false)).toBe("dip");
    expect(angleTransitionOf(LANDING, true)).toBe("cut");
    expect(angleTransitionOf({ ...LANDING, approximate: true }, true)).toBe("cut");
    expect(angleTransitionOf({ ...LANDING, mode: "in_place", fromSlot: null }, false)).toBe("none");
  });
});

describe("AngleViewStack", () => {
  it("binds one view per slot player, contain-fit, no native controls, untouchable", () => {
    const s = render(stack());
    const front = s.getByTestId("video-player", HIDDEN);
    const other = s.getByTestId("video-player-incoming", HIDDEN);
    expect(front.props.player).toBe(A);
    expect(other.props.player).toBe(B);
    for (const v of [front, other]) {
      expect(v.props.contentFit).toBe("contain");
      expect(v.props.nativeControls).toBe(false);
      expect(v.props.allowsPictureInPicture).toBe(false);
    }
    expect(s.getByTestId("angle-view-stack", HIDDEN).props.pointerEvents).toBe("none");
  });

  it("uses TextureViews on Android, on both views (the default on iOS)", () => {
    Platform.OS = "android";
    const a = render(stack());
    expect(a.getByTestId("video-player", HIDDEN).props.surfaceType).toBe("textureView");
    expect(a.getByTestId("video-player-incoming", HIDDEN).props.surfaceType).toBe("textureView");
    a.unmount();
    Platform.OS = "ios";
    const i = render(stack());
    expect(i.getByTestId("video-player", HIDDEN).props.surfaceType).toBeUndefined();
    expect(i.getByTestId("video-player-incoming", HIDDEN).props.surfaceType).toBeUndefined();
  });

  it("wires each slot view's first frame to onSlotFirstFrame with its slot", () => {
    const onSlotFirstFrame = jest.fn();
    const s = render(stack({ onSlotFirstFrame }));
    s.getByTestId("video-player-incoming", HIDDEN).props.onFirstFrameRender();
    expect(onSlotFirstFrame).toHaveBeenLastCalledWith(1);
    s.getByTestId("video-player", HIDDEN).props.onFirstFrameRender();
    expect(onSlotFirstFrame).toHaveBeenLastCalledWith(0);
  });

  it("draws only the front view when both slots hold the same player (no second player)", () => {
    const s = render(stack({ players: [A, A], frontSlot: 0 }));
    expect(s.getAllByTestId(/^angle-view-slot-/, HIDDEN)).toHaveLength(1);
    expect(s.getByTestId("video-player", HIDDEN).props.player).toBe(A);
    expect(s.queryByTestId("video-player-incoming", HIDDEN)).toBeNull();
  });

  it("keeps the slot views mounted (never rebinds a player) as roles swap", () => {
    const s = render(stack({ switchState: PENDING }));
    const slot1 = s.getByTestId("angle-view-slot-1", HIDDEN);
    s.rerender(stack({ switchState: LANDING, frontSlot: 1 }));
    expect(s.getByTestId("angle-view-slot-1", HIDDEN)).toBe(slot1);
    // The front's id follows the front slot; each view keeps its player.
    expect(s.getByTestId("video-player", HIDDEN).props.player).toBe(B);
    expect(s.getByTestId("video-player-incoming", HIDDEN).props.player).toBe(A);
  });

  it("z-order: the front on top at rest and while pending, the outgoing slot on top while landing", () => {
    const s = render(stack({ switchState: PENDING }));
    expect(styleValue(s.getByTestId("angle-view-slot-0", HIDDEN), "zIndex")).toBe(1);
    expect(styleValue(s.getByTestId("angle-view-slot-1", HIDDEN), "zIndex")).toBe(0);
    s.rerender(stack({ switchState: LANDING, frontSlot: 1 }));
    expect(styleValue(s.getByTestId("angle-view-slot-0", HIDDEN), "zIndex")).toBe(1);
    s.rerender(stack({ switchState: { ...LANDING, phase: "idle" }, frontSlot: 1 }));
    expect(styleValue(s.getByTestId("angle-view-slot-1", HIDDEN), "zIndex")).toBe(1);
    expect(styleValue(s.getByTestId("angle-view-slot-0", HIDDEN), "zIndex")).toBe(0);
  });

  it("nothing animates while pending: no fade, no dip", () => {
    const s = render(stack({ switchState: PENDING }));
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(s.queryByTestId("angle-view-dip", HIDDEN)).toBeNull();
  });

  it("an exact landing fades the outgoing view out over duration.fast on the brand ease-out", () => {
    const s = render(stack({ switchState: PENDING }));
    s.rerender(stack({ switchState: LANDING, frontSlot: 1 }));
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
    expect(mockWithTiming).toHaveBeenCalledWith(0, { duration: duration.fast, easing: easing.brandOut });
    expect(duration.fast).toBeLessThanOrEqual(SWITCH_SETTLE_MS);
    expect(s.queryByTestId("angle-view-dip", HIDDEN)).toBeNull();
    // Re-renders during the landing do not restart it.
    s.rerender(stack({ switchState: LANDING, frontSlot: 1 }));
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
  });

  it("an approximate landing dips: black in and out over moment.angleDip, the outgoing view goes at the bottom", () => {
    const s = render(stack({ switchState: { ...PENDING, approximate: true } }));
    s.rerender(stack({ switchState: { ...LANDING, approximate: true }, frontSlot: 1 }));
    expect(s.getByTestId("angle-view-dip", HIDDEN)).toBeTruthy();
    expect(mockWithSequence).toHaveBeenCalledTimes(1);
    expect(mockWithTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: moment.angleDip }));
    expect(mockWithTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: moment.angleDip }));
    expect(mockWithDelay).toHaveBeenCalledWith(moment.angleDip, expect.anything());
    expect(2 * moment.angleDip).toBeLessThanOrEqual(SWITCH_SETTLE_MS);
  });

  it("Reduce Motion: a cut, the outgoing view goes at once with no animation", () => {
    const s = render(stack({ switchState: PENDING, reduceMotion: true }));
    s.rerender(stack({ switchState: LANDING, frontSlot: 1, reduceMotion: true }));
    s.rerender(stack({ switchState: LANDING, frontSlot: 1, reduceMotion: true }));
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(mockWithSequence).not.toHaveBeenCalled();
    expect(s.queryByTestId("angle-view-dip", HIDDEN)).toBeNull();
  });

  it("settling to idle starts no animation and drops the dip layer", () => {
    const s = render(stack({ switchState: { ...PENDING, approximate: true } }));
    s.rerender(stack({ switchState: { ...LANDING, approximate: true }, frontSlot: 1 }));
    jest.clearAllMocks();
    s.rerender(stack({ switchState: { ...LANDING, approximate: true, phase: "idle" }, frontSlot: 1 }));
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(s.queryByTestId("angle-view-dip", HIDDEN)).toBeNull();
  });

  it("an in_place switch animates nothing here (SwitchOverlay holds its still)", () => {
    const inPlace: S = { phase: "landing", seq: 1, mode: "in_place", fromSlot: null, incomingSlot: null, approximate: true };
    const s = render(stack({ switchState: { ...inPlace, phase: "pending" } }));
    s.rerender(stack({ switchState: inPlace }));
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(s.queryByTestId("angle-view-dip", HIDDEN)).toBeNull();
  });

  /** Render `el`, let its effects run, render again and read both slots' opacity. */
  function opacitiesAfter(s: ReturnType<typeof render>, el: React.ReactElement<AngleViewStackProps>): [unknown, unknown] {
    s.rerender(<AngleViewStack {...el.props} />);
    s.rerender(<AngleViewStack {...el.props} />);
    return [styleValue(s.getByTestId("angle-view-slot-0", HIDDEN), "opacity"), styleValue(s.getByTestId("angle-view-slot-1", HIDDEN), "opacity")];
  }

  it("each slot is an opaque black box (nothing shows through the letterbox bars)", () => {
    const s = render(stack({ switchState: PENDING }));
    for (const slot of [0, 1]) {
      expect(styleValue(s.getByTestId(`angle-view-slot-${slot}`, HIDDEN), "backgroundColor")).toBe(ON_MEDIA.black);
    }
  });

  it("a crossfade targets the outgoing fromSlot, not the front slot", () => {
    const s = render(stack({ switchState: PENDING }));
    expect(opacitiesAfter(s, stack({ switchState: LANDING, frontSlot: 1 }))).toEqual([0, 1]);
  });

  it("a cut sets the outgoing view's opacity to 0 at once", () => {
    const s = render(stack({ switchState: PENDING, reduceMotion: true }));
    expect(opacitiesAfter(s, stack({ switchState: LANDING, frontSlot: 1, reduceMotion: true }))).toEqual([0, 1]);
    expect(mockWithTiming).not.toHaveBeenCalled();
  });

  it("idle resets both views to opacity 1", () => {
    const s = render(stack({ switchState: PENDING }));
    expect(opacitiesAfter(s, stack({ switchState: LANDING, frontSlot: 1 }))).toEqual([0, 1]);
    expect(opacitiesAfter(s, stack({ switchState: { ...LANDING, phase: "idle" }, frontSlot: 1 }))).toEqual([1, 1]);
  });

  it("a second switch right after idle (slot 1 to 0) fades slot 1", () => {
    const s = render(stack({ switchState: PENDING }));
    opacitiesAfter(s, stack({ switchState: LANDING, frontSlot: 1 }));
    opacitiesAfter(s, stack({ switchState: { ...LANDING, phase: "idle" }, frontSlot: 1 }));
    const second: S = { phase: "pending", seq: 2, mode: "keep_watching", fromSlot: 1, incomingSlot: 0, approximate: false };
    expect(opacitiesAfter(s, stack({ switchState: second, frontSlot: 1 }))).toEqual([1, 1]);
    expect(opacitiesAfter(s, stack({ switchState: { ...second, phase: "landing" }, frontSlot: 0 }))).toEqual([1, 0]);
    expect(styleValue(s.getByTestId("angle-view-slot-1", HIDDEN), "zIndex")).toBe(1);
    expect(s.getByTestId("video-player", HIDDEN).props.player).toBe(A);
  });

  it("idle straight to landing (no pending render in between) still crossfades the outgoing slot", () => {
    const s = render(stack());
    expect(opacitiesAfter(s, stack({ switchState: LANDING, frontSlot: 1 }))).toEqual([0, 1]);
    expect(mockWithTiming).toHaveBeenCalledWith(0, { duration: duration.fast, easing: easing.brandOut });
  });

  it("unmounting mid-fade stops every animation", () => {
    const s = render(stack({ switchState: PENDING }));
    s.rerender(stack({ switchState: LANDING, frontSlot: 1 }));
    (cancelAnimation as jest.Mock).mockClear();
    s.unmount();
    expect(cancelAnimation).toHaveBeenCalledTimes(3);
  });

  it("no poster while a keep-watching switch is pending or landing", () => {
    const poster = { posterUrl: "https://signed.example/p.jpg", frameShown: false };
    const s = render(stack({ ...poster, switchState: PENDING }));
    expect(s.queryByTestId("video-poster", HIDDEN)).toBeNull();
    s.rerender(stack({ ...poster, switchState: LANDING, frontSlot: 1 }));
    expect(s.queryByTestId("video-poster", HIDDEN)).toBeNull();
    s.rerender(stack({ ...poster, switchState: { ...LANDING, phase: "idle" }, frontSlot: 1 }));
    expect(s.getByTestId("video-poster", HIDDEN)).toBeTruthy();
    // An in_place switch keeps the phase-1 rule (the poster follows frameShown).
    s.rerender(stack({ ...poster, switchState: { ...PENDING, mode: "in_place", fromSlot: null, incomingSlot: null } }));
    expect(s.getByTestId("video-poster", HIDDEN)).toBeTruthy();
  });

  it("covers the front with the poster until it has drawn a frame", () => {
    const s = render(stack({ posterUrl: "https://signed.example/p.jpg", frameShown: false }));
    expect(s.getByTestId("video-poster", HIDDEN).props.source).toEqual({ uri: "https://signed.example/p.jpg" });
    s.rerender(stack({ posterUrl: "https://signed.example/p.jpg", frameShown: true }));
    expect(s.queryByTestId("video-poster", HIDDEN)).toBeNull();
    s.rerender(stack({ posterUrl: null, frameShown: false }));
    expect(s.queryByTestId("video-poster", HIDDEN)).toBeNull();
  });
});
