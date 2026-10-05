import * as React from "react";
import { act, renderHook } from "@testing-library/react-native";

/**
 * The reel player's telemetry wiring (jits-n2im.21, review m1): every swap of
 * a re-signed URL must tell telemetry a new source is coming, so its load is
 * an expected wait and never counted as a stall.
 */

const mockTelemetry = {
  setMeta: jest.fn(),
  sourceAttached: jest.fn(),
  signOutcome: jest.fn(),
  resigned: jest.fn(),
  playIntent: jest.fn(),
  seekRequested: jest.fn(),
  expectWait: jest.fn(),
  firstFrame: jest.fn(),
  error: jest.fn(),
};
jest.mock("@/lib/video/use-playback-telemetry", () => ({
  usePlaybackTelemetry: () => mockTelemetry,
}));
jest.mock("expo-router", () => {
  const R = require("react");
  return { useFocusEffect: (cb: () => void | (() => void)) => R.useEffect(cb, [cb]) };
});

import { useHighlightPlayer } from "@/lib/highlight/use-highlight-player";
import type { HighlightSource } from "@/lib/highlight/use-my-highlight";

function src(over: Partial<HighlightSource> = {}): HighlightSource {
  return { url: "https://s/reel.mp4?t=1", posterUrl: null, posterPath: null, version: 1, durationS: 30, generation: 1, ...over };
}

beforeEach(() => jest.clearAllMocks());

describe("useHighlightPlayer telemetry", () => {
  it("marks the source at mount, and a re-signed swap as a re-sign with a new source", async () => {
    const { rerender } = renderHook(({ s }: { s: HighlightSource }) => useHighlightPlayer(s, jest.fn()), {
      initialProps: { s: src() },
    });
    expect(mockTelemetry.sourceAttached).toHaveBeenCalledTimes(1);
    expect(mockTelemetry.sourceAttached).toHaveBeenLastCalledWith("highlight");

    // Same version, new signed URL: a re-sign swapped in place.
    await act(async () => rerender({ s: src({ url: "https://s/reel.mp4?t=2", generation: 2 }) }));
    expect(mockTelemetry.resigned).toHaveBeenCalledTimes(1);
    expect(mockTelemetry.sourceAttached).toHaveBeenCalledTimes(2);
    expect(mockTelemetry.sourceAttached).toHaveBeenLastCalledWith("highlight");

    // A new version is a swap too, but not a re-sign.
    await act(async () => rerender({ s: src({ url: "https://s/reel-v2.mp4", version: 2, generation: 3 }) }));
    expect(mockTelemetry.resigned).toHaveBeenCalledTimes(1);
    expect(mockTelemetry.sourceAttached).toHaveBeenCalledTimes(3);
  });

  it("a blur pause clears the play intent", () => {
    const { unmount } = renderHook(() => useHighlightPlayer(src(), jest.fn()));
    unmount();
    expect(mockTelemetry.playIntent).toHaveBeenCalledWith(false);
  });
});

void React;
