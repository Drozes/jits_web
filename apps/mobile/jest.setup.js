/**
 * Global Jest setup for the mobile app.
 *
 * AsyncStorage is a native module, so importing it under Jest throws
 * "NativeModule: AsyncStorage is null" at module load. That used to affect
 * only the two or three suites that touched theme / splash caching, which
 * declared their own inline mocks. Since match-video uploads persist their
 * job records, AsyncStorage is now a transitive import of the whole
 * match-flow wizard, so the stub belongs here rather than in every suite
 * that happens to render a match.
 *
 * This is the mock the library itself ships for exactly this purpose. A
 * suite that wants to observe or fail storage still declares its own
 * `jest.mock` for the module, which takes precedence over this one.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

/**
 * expo-video's JS entry extends a native SharedObject class at module load,
 * which does not exist under Jest ("Cannot read properties of undefined
 * (reading 'prototype')"). The highlight card on match detail imports it, so
 * every suite that renders that screen needs a stand-in. The fake player
 * records play/pause and status listeners; `emitStatus` lets a suite fire
 * a statusChange. A suite that needs more declares its own `jest.mock`.
 */
jest.mock("expo-video", () => {
  const R = require("react");
  const RN = require("react-native");
  function createPlayer(source) {
    const listeners = [];
    const player = {
      source,
      initialSource: source,
      muted: false,
      loop: false,
      playing: false,
      allowsExternalPlayback: true,
      play: jest.fn(() => {
        player.playing = true;
      }),
      pause: jest.fn(() => {
        player.playing = false;
      }),
      currentTime: 0,
      // Like native: a new source starts at 0, paused.
      replaceAsync: jest.fn((next) => {
        player.source = next;
        player.currentTime = 0;
        player.playing = false;
        return Promise.resolve();
      }),
      addListener: jest.fn((event, fn) => {
        const entry = { event, fn };
        listeners.push(entry);
        return { remove: () => listeners.splice(listeners.indexOf(entry), 1) };
      }),
      emitStatus: (payload) =>
        listeners.filter((l) => l.event === "statusChange").forEach((l) => l.fn(payload)),
    };
    return player;
  }
  function useVideoPlayer(source, setup) {
    const ref = R.useRef(null);
    // Like the real hook: a changed source creates a NEW player.
    if (!ref.current || ref.current.initialSource !== source) {
      ref.current = createPlayer(source);
      if (setup) setup(ref.current);
    }
    return ref.current;
  }
  const VideoView = R.forwardRef(function VideoView(props, ref) {
    R.useImperativeHandle(ref, () => ({
      enterFullscreen: jest.fn(() => Promise.resolve()),
      exitFullscreen: jest.fn(() => Promise.resolve()),
    }));
    return R.createElement(RN.View, { testID: "expo-video-view", ...props });
  });
  return { useVideoPlayer, VideoView, createVideoPlayer: createPlayer };
});
