/**
 * A fake expo-video for the multi-angle player tests: every `useVideoPlayer`
 * gets a scripted player that records seeks (currentTime writes), rate and
 * mute writes, play/pause, thumbnails and swaps, and whose events a test
 * emits. `VideoView` renders a Text with the player's URL and counts mounts.
 */
import * as React from "react";
import { Text } from "react-native";

type Listener = { event: string; fn: (payload?: any) => void };

export interface FakePlayer {
  id: number;
  source: { uri: string } | null;
  status: string;
  playing: boolean;
  duration: number;
  playbackRate: number;
  rates: number[];
  muted: boolean;
  seeks: number[];
  currentTime: number;
  timeUpdateEventInterval: number;
  preservesPitch: boolean;
  play: jest.Mock;
  pause: jest.Mock;
  replaceAsync: jest.Mock;
  generateThumbnailsAsync: jest.Mock;
  addListener: jest.Mock;
  emit: (event: string, payload?: unknown) => void;
}

export const fakePlayers: FakePlayer[] = [];
export const fakeViews: { mounts: number; props: Record<string, any>[] } = { mounts: 0, props: [] };

export function resetFakeVideo(): void {
  fakePlayers.length = 0;
  fakeViews.mounts = 0;
  fakeViews.props = [];
}

function createPlayer(): FakePlayer {
  const listeners: Listener[] = [];
  let time = 0;
  let rate = 1;
  const p = {
    id: fakePlayers.length,
    source: null,
    status: "idle",
    playing: false,
    duration: 0,
    rates: [] as number[],
    muted: false,
    seeks: [] as number[],
    timeUpdateEventInterval: 0,
    preservesPitch: false,
    get playbackRate() {
      return rate;
    },
    set playbackRate(v: number) {
      rate = v;
      p.rates.push(v);
    },
    get currentTime() {
      return time;
    },
    set currentTime(v: number) {
      time = v;
      p.seeks.push(v);
    },
    play: jest.fn(() => {
      p.playing = true;
    }),
    pause: jest.fn(() => {
      p.playing = false;
    }),
    replaceAsync: jest.fn((src: { uri: string }) => {
      p.source = src;
      p.status = "loading";
      return Promise.resolve();
    }),
    generateThumbnailsAsync: jest.fn(async (times: number[]) => times.map((t) => ({ fakeThumbnail: true, t }))),
    addListener: jest.fn((event: string, fn: (payload?: unknown) => void) => {
      const e = { event, fn };
      listeners.push(e);
      return { remove: () => listeners.splice(listeners.indexOf(e), 1) };
    }),
    emit: (event: string, payload?: unknown) => {
      if (event === "timeUpdate") time = (payload as { currentTime: number }).currentTime;
      listeners.filter((l) => l.event === event).forEach((l) => l.fn(payload));
    },
  } as unknown as FakePlayer;
  return p;
}

export function useVideoPlayer(_source: unknown, setup?: (p: FakePlayer) => void): FakePlayer {
  const ref = React.useRef<FakePlayer | null>(null);
  if (!ref.current) {
    ref.current = createPlayer();
    fakePlayers.push(ref.current);
    setup?.(ref.current);
    // The setup's own writes are not the app's rate changes.
    ref.current.rates.length = 0;
  }
  return ref.current;
}

export function VideoView(props: Record<string, any>) {
  React.useEffect(() => {
    fakeViews.mounts += 1;
  }, []);
  fakeViews.props.push(props);
  return React.createElement(Text, { testID: props.testID, style: props.style }, props.player.source?.uri ?? "");
}

/** The item on player `i` is ready (duration seconds). */
export function readyPlayer(i: number, duration = 400): void {
  const p = fakePlayers[i];
  p.status = "readyToPlay";
  p.duration = duration;
  p.emit("statusChange", { status: "readyToPlay" });
}

export function tick(i: number, t: number): void {
  fakePlayers[i].emit("timeUpdate", { currentTime: t, bufferedPosition: t });
}
