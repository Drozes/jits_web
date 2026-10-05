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
 * NetInfo's real JS module drives a native event emitter and a reachability
 * probe, which under Jest throws asynchronously ("Cannot read properties of
 * undefined (reading 'isInternetReachable')") and fails whatever suite was
 * running. The match upload banner reads the connection type (it shows the
 * clip size on cellular, jits-n2im.6), so every suite that renders a verdict
 * now touches it. Default: online on wifi, no events. A suite that needs
 * more (cellular, offline, reconnects) declares its own `jest.mock`.
 */
jest.mock("@react-native-community/netinfo", () => {
  const state = { type: "wifi", isConnected: true, isInternetReachable: true, details: null };
  const NetInfo = {
    fetch: jest.fn(() => Promise.resolve(state)),
    refresh: jest.fn(() => Promise.resolve(state)),
    addEventListener: jest.fn(() => () => undefined),
    configure: jest.fn(),
    useNetInfo: jest.fn(() => state),
  };
  return { __esModule: true, default: NetInfo, ...NetInfo };
});

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
      // A suite can start the item already loaded (globalThis.__expoVideoInitialStatus).
      status: globalThis.__expoVideoInitialStatus || "idle",
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
    // A suite can observe fullscreen calls through globalThis.__expoVideoHandle.
    R.useImperativeHandle(ref, () => ({
      enterFullscreen: jest.fn(() => {
        const h = globalThis.__expoVideoHandle;
        return h && h.enterFullscreen ? h.enterFullscreen() : Promise.resolve();
      }),
      exitFullscreen: jest.fn(() => Promise.resolve()),
    }));
    return R.createElement(RN.View, { testID: "expo-video-view", ...props });
  });
  return { useVideoPlayer, VideoView, createVideoPlayer: createPlayer };
});

/**
 * @sentry/react-native ships untransformed ESM that Jest cannot parse, so no
 * suite has ever loaded the real SDK: each one that reaches it mocks it (or
 * the `lib/error-tracking/sentry` wrapper). The players now import playback
 * telemetry (jits-n2im.21), which reaches the wrapper from every screen with
 * a video, so this inert stand-in is the default. The wrapper never inits
 * under Jest (no DSN), so nothing calls it; a suite that asserts on Sentry
 * still declares its own `jest.mock`, which wins.
 */
jest.mock("@sentry/react-native", () => {
  // A plain object (no Proxy): babel's import-star interop copies own keys
  // only, and a Proxy fallback would also make the module thenable.
  const noop = () => undefined;
  return {
    wrap: (c) => c,
    init: noop,
    captureException: noop,
    captureMessage: noop,
    addBreadcrumb: noop,
    setUser: noop,
    setTag: noop,
    showFeedbackForm: noop,
    feedbackIntegration: () => ({ name: "Feedback" }),
  };
});

// The fake VideoView's fullscreen hook (see the expo-video mock above) never
// leaks from one test into the next.
beforeEach(() => {
  globalThis.__expoVideoHandle = undefined;
  globalThis.__expoVideoInitialStatus = undefined;
});
afterEach(() => {
  globalThis.__expoVideoHandle = undefined;
  globalThis.__expoVideoInitialStatus = undefined;
});

/**
 * Never let a fake-timer handle reach Node's real clearImmediate.
 *
 * A component that calls setImmediate while `jest.useFakeTimers()` is on gets
 * a fake handle (a plain object). If it is unmounted after
 * `jest.useRealTimers()` (RNTL's auto-cleanup runs after the test body), its
 * cleanup passes that handle to Node's REAL clearImmediate, which decrements
 * Node's pending-immediate counter for an immediate it never queued. The
 * counter then reads 0 while a real immediate is still pending (jest-runner's
 * own end-of-file `setImmediate(() => resolve(...))`), so libuv spins at 100%
 * CPU and never runs it: the suite never finishes and the CI job hangs until
 * it is cancelled (jits-psyv). React Native's StatusBar does exactly this in
 * `_updatePropsStack` (clearImmediate(StatusBar._updateImmediate)).
 *
 * A real Immediate always carries `_onImmediate` (null once it ran or was
 * cleared), so anything else is not Node's and is ignored here. Fake timers
 * restore whatever was installed when they were turned on, i.e. this guard.
 */
{
  const realClearImmediate = global.clearImmediate;
  global.clearImmediate = function clearImmediate(handle) {
    if (handle && typeof handle === "object" && !("_onImmediate" in handle)) return;
    return realClearImmediate.call(this, handle);
  };
}
