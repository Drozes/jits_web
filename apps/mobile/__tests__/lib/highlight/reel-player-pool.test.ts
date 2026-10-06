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
    currentTime: 0,
    muted: false,
    status: "idle",
    play: jest.fn(() => {
      p.playing = true;
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

function setup(count = 5, start = 0) {
  const players = [fakePlayer(), fakePlayer(), fakePlayer()];
  const hooks = { sourceAttached: jest.fn(), playIntent: jest.fn(), firstFrame: jest.fn() };
  const pool = new ReelPoolController(players as never, hooks);
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
});
