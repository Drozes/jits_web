/**
 * Matches feed card media selection and crop rule (specs/matches-tab 6.3),
 * plus the card's duration format (6.2).
 */
import { cropFor, pickCardMedia } from "@/lib/film-room/card-media";
import { formatDuration } from "@/lib/film-room/format";
import { libItem, libVideo } from "../../support/film-fixtures";

const ME = "me-1";
const OPP = "opp-1";
const TK = "tk-1";

describe("pickCardMedia: play target", () => {
  it("prefers the elected primary when it is playable, even over the viewer's own", () => {
    const item = libItem({
      videos: [
        libVideo({ video_id: "mine", uploaded_by: ME }),
        libVideo({ video_id: "theirs", uploaded_by: OPP, is_primary: true, poster_url: "https://p/theirs.jpg" }),
      ],
    });
    const media = pickCardMedia(item, ME);
    expect(media.playVideo?.video_id).toBe("theirs");
    expect(media.posterUrl).toBe("https://p/theirs.jpg");
  });

  it("skips a primary that is not playable and falls back to the viewer's own playable video", () => {
    const item = libItem({
      videos: [
        libVideo({ video_id: "theirs", uploaded_by: OPP, is_primary: true, playability: "processing" }),
        libVideo({ video_id: "mine", uploaded_by: ME }),
      ],
    });
    expect(pickCardMedia(item, ME).playVideo?.video_id).toBe("mine");
  });

  it("uses the viewer's own playable video when no primary is marked (B3 absent)", () => {
    const item = libItem({
      videos: [
        libVideo({ video_id: "theirs", uploaded_by: OPP }),
        libVideo({ video_id: "mine", uploaded_by: ME }),
      ],
    });
    expect(pickCardMedia(item, ME).playVideo?.video_id).toBe("mine");
  });

  it("otherwise takes the first playable video in list (server) order", () => {
    const item = libItem({
      videos: [
        libVideo({ video_id: "mine", uploaded_by: ME, playability: "failed" }),
        libVideo({ video_id: "opp", uploaded_by: OPP, playability: "processing" }),
        libVideo({ video_id: "tk", uploaded_by: TK }),
        libVideo({ video_id: "opp2", uploaded_by: OPP }),
      ],
    });
    expect(pickCardMedia(item, ME).playVideo?.video_id).toBe("tk");
  });

  it("works without a viewer id (no own tier)", () => {
    const item = libItem({ videos: [libVideo({ video_id: "a", uploaded_by: OPP }), libVideo({ video_id: "b", uploaded_by: ME })] });
    expect(pickCardMedia(item, null).playVideo?.video_id).toBe("a");
  });

  it("carries the play target's duration, and no duration when nothing is playable", () => {
    const playable = libItem({ videos: [libVideo({ duration_seconds: 252 })] });
    expect(pickCardMedia(playable, ME).durationSeconds).toBe(252);
    const none = libItem({ videos: [libVideo({ playability: "processing", duration_seconds: 252 })] });
    expect(pickCardMedia(none, ME)).toMatchObject({ playVideo: null, durationSeconds: null });
  });
});

describe("pickCardMedia: poster", () => {
  it("gives a poster but no play target when nothing is playable", () => {
    const item = libItem({
      videos: [libVideo({ video_id: "v", playability: "processing", poster_url: "https://p/v.jpg" })],
    });
    const media = pickCardMedia(item, ME);
    expect(media.playVideo).toBeNull();
    expect(media.posterVideo?.video_id).toBe("v");
    expect(media.posterUrl).toBe("https://p/v.jpg");
  });

  it("falls back from a poster-less play target to the first video with a poster (same order)", () => {
    const item = libItem({
      videos: [
        libVideo({ video_id: "mine", uploaded_by: ME, poster_url: null }),
        libVideo({ video_id: "opp", uploaded_by: OPP, playability: "processing", poster_url: "https://p/opp.jpg", thumbnail_width: 1920, thumbnail_height: 1080 }),
      ],
    });
    const media = pickCardMedia(item, ME);
    expect(media.playVideo?.video_id).toBe("mine");
    expect(media.posterVideo?.video_id).toBe("opp");
    expect([media.posterWidth, media.posterHeight]).toEqual([1920, 1080]);
  });

  it("prefers the primary's poster over the viewer's own when the play target has none", () => {
    const item = libItem({
      videos: [
        libVideo({ video_id: "mine", uploaded_by: ME, playability: "processing", poster_url: "https://p/mine.jpg" }),
        libVideo({ video_id: "prim", uploaded_by: OPP, is_primary: true, playability: "processing", poster_url: "https://p/prim.jpg" }),
      ],
    });
    expect(pickCardMedia(item, ME).posterVideo?.video_id).toBe("prim");
  });

  it("returns no poster (fallback art) and no play target for a match with no videos", () => {
    expect(pickCardMedia(libItem({ videos: [] }), ME)).toEqual({
      playVideo: null,
      posterVideo: null,
      posterUrl: null,
      posterWidth: null,
      posterHeight: null,
      durationSeconds: null,
    });
  });

  it("returns no poster when no video has a signed poster", () => {
    const item = libItem({ videos: [libVideo({ poster_url: null }), libVideo({ video_id: "b", uploaded_by: OPP, poster_url: null })] });
    const media = pickCardMedia(item, ME);
    expect(media.posterUrl).toBeNull();
    expect(media.playVideo?.video_id).toBe("v-1");
  });

  it("is deterministic across calls and across refetched copies of the same item", () => {
    const build = () =>
      libItem({
        videos: [
          libVideo({ video_id: "a", uploaded_by: OPP }),
          libVideo({ video_id: "b", uploaded_by: OPP }),
          libVideo({ video_id: "c", uploaded_by: ME, playability: "processing" }),
        ],
      });
    const first = pickCardMedia(build(), ME);
    for (let i = 0; i < 5; i++) {
      const next = pickCardMedia(build(), ME);
      expect(next.playVideo?.video_id).toBe(first.playVideo?.video_id);
      expect(next.posterVideo?.video_id).toBe(first.posterVideo?.video_id);
    }
    expect(first.playVideo?.video_id).toBe("a");
  });
});

describe("cropFor", () => {
  it("covers landscape and square posters", () => {
    expect(cropFor(1920, 1080)).toEqual({ fit: "cover", known: true });
    expect(cropFor(1080, 1080)).toEqual({ fit: "cover", known: true });
  });

  it("pillarboxes portrait posters", () => {
    expect(cropFor(720, 1280)).toEqual({ fit: "pillarbox", known: true });
    expect(cropFor(1079, 1080)).toEqual({ fit: "pillarbox", known: true });
  });

  it.each([
    [null, 1080],
    [1920, null],
    [undefined, undefined],
    [0, 1080],
    [1920, 0],
    [-5, 100],
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
  ])("covers (unknown) until loaded when the size is %p x %p", (w, h) => {
    expect(cropFor(w as number | null, h as number | null)).toEqual({ fit: "cover", known: false });
  });
});

describe("formatDuration", () => {
  it.each([
    [252, "4:12"],
    [0, "0:00"],
    [5, "0:05"],
    [31.2, "0:31"],
    [59.6, "1:00"],
    [600, "10:00"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3725, "1:02:05"],
    [36000, "10:00:00"],
  ])("%p s -> %p", (s, label) => {
    expect(formatDuration(s)).toBe(label);
  });

  it.each([null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])("returns null for %p", (s) => {
    expect(formatDuration(s as number | null)).toBeNull();
  });
});
