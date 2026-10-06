/**
 * The swipe viewer's player pool controller (jits-a4fw.5, spec 8.3): slot
 * assignment on index change, only the visible page plays, neighbours paused
 * at 0 with the poster until a first frame, tap to pause, sheets and blur
 * pause, in-place swaps, error routing and the legacy-aspect fit.
 */
import { isReelAspect, ReelPoolController } from "@/lib/highlight/reel-player-pool";
import type { HighlightSource } from "@/lib/highlight/use-my-highlight";

type Fake = {
  url: string | null;
  playing: boolean;
  /** Buffering: play() leaves playing false (iOS and Android report it so while loading). */
  buffering: boolean;
  currentTime: number;
  muted: boolean;
  status: string;
  play: jest.Mock;
  pause: jest.Mock;
  replaceAsync: jest.Mock;
};

function fakePlayer(): Fake {
  const p: Fake = {
    url: null,
    playing: false,
    buffering: false,
    currentTime: 0,
    muted: false,
    status: "idle",
    play: jest.fn(() => {
      if (!p.buffering) p.playing = true;
    }),
    pause: jest.fn(() => {
      p.playing = false;
    }),
    replaceAsync: jest.fn((url: string) => {
      p.url = url;
      p.playing = false;
      p.currentTime = 0;
      return Promise.resolve();
    }),
  };
  return p;
}

function src(n: number, over: Partial<HighlightSource> = {}): HighlightSource {
  return { url: `https://signed/r${n}.mp4`, posterUrl: null, posterPath: null, version: 1, durationS: 28, generation: 0, ...over };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function setup(count = 5, start = 0, now: () => number = Date.now) {
  const players = [fakePlayer(), fakePlayer(), fakePlayer()];
  const hooks = { sourceAttached: jest.fn(), playIntent: jest.fn(), firstFrame: jest.fn() };
  const pool = new ReelPoolController(players as never, hooks, now);
  for (let i = 0; i < count; i++) pool.offer(i, `h${i}:1`, src(i));
  pool.setActive(start, count);
  return { pool, players, hooks };
}

describe("ReelPoolController", () => {
  it("loads the visible page and its neighbours into their slots; only the visible one plays", async () => {
    const { pool, players } = setup(5, 1);
    await flush();
    expect(players.map((p) => p.url)).toEqual(["https://signed/r0.mp4", "https://signed/r1.mp4", "https://signed/r2.mp4"]);
    expect(players[1].playing).toBe(true);
    expect(players[0].playing).toBe(false);
    expect(players[2].playing).toBe(false);
    expect(pool.slotOf(1)).toBe(1);
    expect(pool.slotOf(4)).toBeNull();
  });

  it("a swipe re-points ONE slot; the page swiped to plays its preloaded item, the one left pauses at 0", async () => {
    const { pool, players } = setup(5, 1);
    await flush();
    players.forEach((p) => p.replaceAsync.mockClear());
    players[1].currentTime = 12;
    pool.setActive(2, 5);
    await flush();
    expect(players[0].replaceAsync).toHaveBeenCalledWith("https://signed/r3.mp4");
    expect(players[1].replaceAsync).not.toHaveBeenCalled();
    expect(players[2].replaceAsync).not.toHaveBeenCalled();
    expect(players[2].playing).toBe(true);
    expect(players[1].playing).toBe(false);
    expect(players[1].currentTime).toBe(0);
    expect(players[0].playing).toBe(false);
  });

  it("covers a page with its poster until its item has played AND a frame (or readyToPlay) is up", async () => {
    const { pool } = setup(3, 0);
    await flush();
    expect(pool.snapshot(0).covered).toBe(true);
    pool.playingChanged(0, true);
    expect(pool.snapshot(0).covered).toBe(true);
    pool.firstFrame(0);
    expect(pool.snapshot(0).covered).toBe(false);
    // The paused neighbour has never played: still covered even if ready.
    pool.statusChanged(1, "readyToPlay");
    expect(pool.snapshot(1).covered).toBe(true);
    // readyToPlay is the fallback when onFirstFrameRender never fires.
    pool.playingChanged(1, true);
    expect(pool.snapshot(1).covered).toBe(false);
    expect(pool.snapshot(4)).toMatchObject({ slot: null, player: null, covered: true });
  });

  it("tap toggles pause / play on the visible page only; a new landing plays again", async () => {
    const { pool, players, hooks } = setup(3, 0);
    await flush();
    pool.toggle(0);
    expect(players[0].playing).toBe(false);
    expect(pool.snapshot(0).paused).toBe(true);
    expect(hooks.playIntent).toHaveBeenLastCalledWith(0, false);
    pool.toggle(1);
    expect(players[1].playing).toBe(false);
    pool.toggle(0);
    expect(players[0].playing).toBe(true);
    pool.toggle(0);
    pool.setActive(1, 3);
    expect(players[1].playing).toBe(true);
    expect(pool.snapshot(1).paused).toBe(false);
  });

  it("an open sheet and a blur pause the visible page; closing resumes it", async () => {
    const { pool, players } = setup(2, 0);
    await flush();
    pool.setSuspended(true);
    expect(players[0].playing).toBe(false);
    pool.setSuspended(false);
    expect(players[0].playing).toBe(true);
    pool.setFocused(false);
    expect(players[0].playing).toBe(false);
    pool.setFocused(true);
    expect(players[0].playing).toBe(true);
  });

  it("a page offering its source later is loaded into its slot then", async () => {
    const players = [fakePlayer(), fakePlayer(), fakePlayer()];
    const pool = new ReelPoolController(players as never);
    pool.setActive(0, 2);
    expect(players[0].replaceAsync).not.toHaveBeenCalled();
    pool.offer(0, "h0:1", src(0));
    await flush();
    expect(players[0].url).toBe("https://signed/r0.mp4");
    expect(players[0].playing).toBe(true);
  });

  it("the same URL is never reloaded; a re-sign keeps the position, a new version starts over", async () => {
    const { pool, players, hooks } = setup(2, 0);
    await flush();
    players[0].replaceAsync.mockClear();
    pool.offer(0, "h0:1", src(0));
    expect(players[0].replaceAsync).not.toHaveBeenCalled();
    players[0].currentTime = 9;
    pool.offer(0, "h0:1", src(0, { url: "https://signed/r0.mp4?resigned" }));
    expect(hooks.sourceAttached).toHaveBeenLastCalledWith(0, true);
    await flush();
    expect(players[0].currentTime).toBe(9);
    pool.offer(0, "h0:2", src(0, { url: "https://signed/r0-v2.mp4", version: 2 }));
    expect(hooks.sourceAttached).toHaveBeenLastCalledWith(0, false);
    await flush();
    expect(players[0].currentTime).toBe(0);
    expect(players[0].playing).toBe(true);
  });

  it("routes a player error to the page that owns the slot", async () => {
    const { pool } = setup(2, 0);
    await flush();
    const onError = jest.fn();
    pool.onError(1, onError);
    pool.statusChanged(1, "error");
    expect(onError).toHaveBeenCalledTimes(1);
    pool.onError(1, null);
    pool.statusChanged(1, "error");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("mutes every player; reports a preloaded page; stops driving players after release", async () => {
    const { pool, players } = setup(3, 0);
    pool.setMuted(true);
    expect(players.every((p) => p.muted)).toBe(true);
    await flush();
    expect(pool.isLoaded(1)).toBe(true);
    expect(pool.isLoaded(2)).toBe(false);
    pool.release();
    expect(players[0].playing).toBe(false);
    pool.setFocused(true);
    expect(players[0].playing).toBe(false);
  });

  it("a legacy asset off 9:16 renders contain; a 9:16 reel covers", async () => {
    const { pool } = setup(2, 0);
    await flush();
    expect(pool.snapshot(0).fit).toBe("cover");
    pool.videoSize(0, 1920, 1080);
    expect(pool.snapshot(0).fit).toBe("contain");
    pool.videoSize(0, 1080, 1920);
    expect(pool.snapshot(0).fit).toBe("cover");
    expect(isReelAspect(1080, 1920)).toBe(true);
    expect(isReelAspect(1080, 1800)).toBe(true);
    expect(isReelAspect(1080, 2340)).toBe(false);
    expect(isReelAspect(1080, 1350)).toBe(false);
    expect(isReelAspect(0, 0)).toBe(true);
  });

  it("progress follows only the visible page", async () => {
    const { pool } = setup(2, 0);
    await flush();
    const cb = jest.fn();
    pool.subscribeProgress(cb);
    pool.timeUpdate(0, 7, 28);
    expect(pool.progress(0)).toBe(0.25);
    pool.timeUpdate(1, 7, 28);
    expect(pool.progress(1)).toBe(0);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  describe("intent, never player.playing (review B1)", () => {
    function buffering() {
      const r = setup(5, 1);
      r.players.forEach((p) => (p.buffering = true));
      return r;
    }

    it("tap to pause while the reel still buffers really pauses", async () => {
      const { pool, players } = buffering();
      await flush();
      expect(players[1].play).toHaveBeenCalledTimes(1);
      expect(players[1].playing).toBe(false);
      players[1].pause.mockClear();
      pool.toggle(1);
      expect(players[1].pause).toHaveBeenCalled();
      pool.toggle(1);
      expect(players[1].play).toHaveBeenCalledTimes(2);
    });

    it("a sheet, a blur and a background during the buffer each pause", async () => {
      const { pool, players } = buffering();
      await flush();
      for (const close of [
        () => pool.setSuspended(true),
        () => pool.setFocused(false),
        () => pool.setAppActive(false),
      ]) {
        players[1].pause.mockClear();
        close();
        expect(players[1].pause).toHaveBeenCalled();
        pool.setSuspended(false);
        pool.setFocused(true);
        pool.setAppActive(true);
      }
    });

    it("play() is not spammed: a second apply keeps the intent", async () => {
      const { pool, players, hooks } = buffering();
      await flush();
      pool.setMuted(true);
      pool.setSuspended(false);
      expect(players[1].play).toHaveBeenCalledTimes(1);
      expect(hooks.playIntent.mock.calls.filter((c) => c[0] === 1 && c[1] === true)).toHaveLength(1);
    });

    it("a two-page jump pauses the page left behind even mid-buffer", async () => {
      const { pool, players } = buffering();
      await flush();
      players[1].pause.mockClear();
      pool.setActive(3, 5);
      await flush();
      expect(players[1].pause).toHaveBeenCalled();
      // 3 mod 3 = slot 0 now plays (intent), nothing else is asked to.
      expect(players[0].play).toHaveBeenCalled();
      expect(players[2].play).not.toHaveBeenCalled();
    });
  });

  it("foregrounding never resumes a viewer that lost focus (review M1)", async () => {
    const { pool, players } = setup(2, 0);
    await flush();
    pool.setFocused(false); // match detail pushed over the viewer
    pool.setAppActive(false);
    players[0].play.mockClear();
    pool.setAppActive(true);
    expect(players[0].play).not.toHaveBeenCalled();
    pool.setFocused(true);
    expect(players[0].play).toHaveBeenCalledTimes(1);
  });

  it("holds the first play until the mute preference is read", async () => {
    const players = [fakePlayer(), fakePlayer(), fakePlayer()];
    const pool = new ReelPoolController(players as never);
    pool.setReady(false);
    pool.offer(0, "h0:1", src(0));
    pool.setActive(0, 1);
    await flush();
    expect(players[0].play).not.toHaveBeenCalled();
    pool.setReady(true);
    expect(players[0].play).toHaveBeenCalledTimes(1);
  });

  it("re-pointing a slot makes its old item's in-flight swap and errors stale", async () => {
    const { pool } = setup(5, 1);
    const onError = jest.fn();
    pool.onError(3, onError);
    pool.setActive(2, 5); // slot 0 re-pointed from page 0 to page 3, its swap still in flight
    pool.statusChanged(0, "error");
    expect(onError).not.toHaveBeenCalled();
    await flush();
    pool.statusChanged(0, "error");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("an offer older than the reuse window is not loaded; a fresh offer reports itself", async () => {
    let t = 1_000_000;
    const players = [fakePlayer(), fakePlayer(), fakePlayer()];
    const pool = new ReelPoolController(players as never, {}, () => t);
    pool.offer(1, "h1:1", src(1), t - 46 * 60_000);
    expect(pool.hasFreshOffer(1)).toBe(false);
    pool.setActive(0, 3);
    expect(players[1].replaceAsync).not.toHaveBeenCalled();
    pool.offer(1, "h1:1", src(1, { url: "https://signed/r1.mp4?fresh" }), t);
    expect(pool.hasFreshOffer(1)).toBe(true);
    expect(players[1].replaceAsync).toHaveBeenCalledWith("https://signed/r1.mp4?fresh");
    t += 46 * 60_000;
    expect(pool.hasFreshOffer(1)).toBe(false);
  });

  it("a swipe resets the progress bar of the page left", async () => {
    const { pool } = setup(3, 0);
    await flush();
    const cb = jest.fn();
    pool.subscribeProgress(cb);
    pool.timeUpdate(0, 14, 28);
    pool.setActive(1, 3);
    expect(pool.progress(0)).toBe(0);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("the loading page after the last reel plays nothing", async () => {
    const { pool, players } = setup(3, 2);
    await flush();
    pool.setActive(3, 3);
    expect(players.every((p) => !p.playing)).toBe(true);
  });
});
