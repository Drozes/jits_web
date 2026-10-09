/**
 * The Matches feed card (specs/matches-tab 6.2, 6.3, 10.3; AC 2.4 to 2.9,
 * 2.15, 6.5, 6.7): crop rule, one badge by the deck priority, duration and
 * play glyph only when playable, media vs meta targets, the decorative
 * chevron, neutral draws, FIRST tags and the no-film caption.
 *
 * Source: apps/mobile/components/matches/match-feed-card.tsx
 */
import * as React from "react";
import { act, fireEvent, render, within } from "@testing-library/react-native";

jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { MatchFeedCard, type MatchFeedCardProps } from "@/components/matches/match-feed-card";
import { resetMatchUploadStore, setMatchUpload } from "@/lib/video/match-upload-store";
import { usePalette } from "@/lib/theme/palette";
import { libItem, libVideo } from "../../support/film-fixtures";

const viewer = { name: "Kai Reyes", photoUrl: null };
const NOW = Date.now();
const fresh = new Date(NOW - 3_600_000).toISOString();
const NO_TAGS: readonly string[] = [];

function renderCard(over: Partial<MatchFeedCardProps> = {}) {
  const onOpen = jest.fn();
  const props: MatchFeedCardProps = {
    item: libItem({ match_id: "m-1" }),
    viewer,
    viewerId: "me-1",
    seen: true,
    phase: null,
    tags: NO_TAGS,
    noFilmHelper: false,
    onOpen,
    ...over,
  };
  const utils = render(<MatchFeedCard {...props} />);
  return { ...utils, onOpen, props };
}

function textOf(node: ReturnType<ReturnType<typeof render>["getByTestId"]>): string {
  return within(node)
    .UNSAFE_getAllByType(require("react-native").Text)
    .map((t: { props: { children: unknown } }) => [].concat(t.props.children as never).join(""))
    .join("");
}

function palette() {
  let p: ReturnType<typeof usePalette> | null = null;
  function Probe() {
    p = usePalette();
    return null;
  }
  render(<Probe />);
  return p as unknown as ReturnType<typeof usePalette>;
}

beforeEach(() => {
  resetMatchUploadStore();
});

describe("media and the crop rule (spec 6.3, AC 2.8)", () => {
  it("a landscape poster fills with cover", () => {
    const u = renderCard({ item: libItem({ videos: [libVideo({ thumbnail_width: 1280, thumbnail_height: 720 })] }) });
    expect(u.getByTestId("feed-poster").props.contentFit).toBe("cover");
    expect(u.queryByTestId("feed-poster-pillarbox")).toBeNull();
  });

  it("a portrait poster is pillarboxed: contain over a blurred cover under a scrim", () => {
    const u = renderCard({ item: libItem({ videos: [libVideo({ thumbnail_width: 720, thumbnail_height: 1280 })] }) });
    expect(u.getByTestId("feed-poster-pillarbox")).toBeTruthy();
    expect(u.getByTestId("feed-poster").props.contentFit).toBe("contain");
    const blur = u.getByTestId("feed-poster-blur");
    expect(blur.props.contentFit).toBe("cover");
    expect(blur.props.blurRadius).toBe(24);
  });

  it("an unknown size draws cover, then applies the rule once the image reports its size", () => {
    const u = renderCard({ item: libItem({ videos: [libVideo({ thumbnail_width: null, thumbnail_height: null })] }) });
    const poster = u.getByTestId("feed-poster");
    expect(poster.props.contentFit).toBe("cover");
    act(() => {
      poster.props.onLoad({ source: { width: 1080, height: 1920 } });
    });
    expect(u.getByTestId("feed-poster-pillarbox")).toBeTruthy();
  });

  it("a loaded size belongs to its URL: a new poster URL draws cover again until it loads", () => {
    const v = (url: string) => libItem({ videos: [libVideo({ thumbnail_width: null, thumbnail_height: null, poster_url: url, thumbnail_key: url })] });
    const u = renderCard({ item: v("https://signed/a.jpg") });
    act(() => {
      u.getByTestId("feed-poster").props.onLoad({ source: { width: 1080, height: 1920 } });
    });
    expect(u.getByTestId("feed-poster-pillarbox")).toBeTruthy();
    u.rerender(<MatchFeedCard {...u.props} item={v("https://signed/b.jpg")} />);
    expect(u.queryByTestId("feed-poster-pillarbox")).toBeNull();
    expect(u.getByTestId("feed-poster").props.contentFit).toBe("cover");
    // The contained image also reports its size (after a pillarbox switch).
    act(() => {
      u.getByTestId("feed-poster").props.onLoad({ source: { width: 1080, height: 1920 } });
    });
    expect(u.getByTestId("feed-poster").props.onLoad).toEqual(expect.any(Function));
  });

  it("a match with no video rows shows the two-athlete fallback with C-L7", () => {
    const u = renderCard({ item: libItem({ videos: [] }) });
    expect(u.getByTestId("opening-still-fallback")).toBeTruthy();
    expect(u.getByText("NO FILM FOR THIS ONE")).toBeTruthy();
    expect(u.queryByTestId("feed-poster")).toBeNull();
    expect(u.getByTestId("film-card-media-m-1").props.accessibilityLabel).toBe("No film for this one. Open match vs M. Park");
  });

  it("uses the elected primary angle for the poster, and the media still opens match detail", () => {
    const item = libItem({
      videos: [
        libVideo({ video_id: "mine", poster_url: "https://signed/mine.jpg", thumbnail_key: "mine.jpg" }),
        libVideo({ video_id: "primary", uploaded_by: "opp-1", is_primary: true, poster_url: "https://signed/p.jpg", thumbnail_key: "p.jpg" }),
      ],
    });
    const u = renderCard({ item });
    expect(u.getByTestId("feed-poster").props.source).toEqual({ uri: "https://signed/p.jpg", cacheKey: "film-still-p.jpg" });
    fireEvent.press(u.getByTestId("film-card-media-m-1"));
    expect(u.onOpen).toHaveBeenCalledWith("m-1");
  });
});

describe("play glyph, duration and taps (AC 2.6, 2.9)", () => {
  it("a playable card shows the play glyph and an m:ss duration; the media opens match detail, not the player", () => {
    const u = renderCard({ item: libItem({ videos: [libVideo({ duration_seconds: 252 })] }) });
    expect(u.getByTestId("film-card-play")).toBeTruthy();
    expect(textOf(u.getByTestId("film-card-duration"))).toBe("4:12");
    const media = u.getByTestId("film-card-media-m-1");
    expect(media.props.accessibilityLabel).toBe("Open match vs M. Park, breakdown ready");
    fireEvent.press(media);
    expect(u.onOpen).toHaveBeenCalledTimes(1);
    expect(u.onOpen).toHaveBeenCalledWith("m-1");
  });

  it("nothing playable: no glyph, no duration, and the media opens match detail", () => {
    const u = renderCard({ item: libItem({ videos: [libVideo({ playability: "processing", status: "processing", has_analysis: false })] }) });
    expect(u.queryByTestId("film-card-play")).toBeNull();
    expect(u.queryByTestId("film-card-duration")).toBeNull();
    fireEvent.press(u.getByTestId("film-card-media-m-1"));
    expect(u.onOpen).toHaveBeenCalledWith("m-1");
  });

  it("the meta row always opens match detail", () => {
    const u = renderCard();
    const meta = u.getByTestId("film-card-m-1");
    expect(meta.props.accessibilityLabel).toMatch(/^Open match vs M\. Park, breakdown ready\. Won, plus 14, [A-Z][a-z]{2} \d{1,2}$/);
    fireEvent.press(meta);
    expect(u.onOpen).toHaveBeenCalledWith("m-1");
  });

  it("the chevron is decoration inside the meta row: hidden from accessibility, no target", () => {
    const u = renderCard();
    const chevron = u.getByTestId("film-card-chevron", { includeHiddenElements: true });
    expect(chevron.props.accessibilityElementsHidden).toBe(true);
    expect(chevron.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(chevron.props.pointerEvents).toBe("none");
    expect(chevron.props.onPress).toBeUndefined();
    expect(within(u.getByTestId("film-card-m-1")).getByTestId("film-card-chevron", { includeHiddenElements: true })).toBeTruthy();
  });
});

describe("one badge, deck priority (AC 2.5)", () => {
  const cases: [string, () => Partial<MatchFeedCardProps>, string][] = [
    ["didn't upload", () => {
      setMatchUpload("m-1", { status: "error", errorClass: "offline", error: "x" });
      return { item: libItem({ match_id: "m-1", videos: [] }) };
    }, "DIDN'T UPLOAD"],
    ["upload paused", () => {
      setMatchUpload("m-1", { status: "paused", progress: 0.3 });
      return {};
    }, "UPLOAD PAUSED"],
    ["uploading on this phone", () => {
      setMatchUpload("m-1", { status: "uploading", progress: 0.42 });
      return {};
    }, "UPLOADING 42%"],
    ["waiting for an angle", () => ({ phase: { phase: "waiting_for_angle", reason: null, waitRemainingMs: 492_000 } }), "WAITING 8:12"],
    ["building", () => ({ phase: { phase: "building", reason: null, waitRemainingMs: null } }), "BUILDING HIGHLIGHT"],
    ["new", () => ({ seen: false, item: libItem({ match_id: "m-1", completed_at: fresh }) }), "NEW"],
    ["breakdown ready", () => ({}), "BREAKDOWN READY"],
    ["no film phase", () => ({ phase: { phase: "no_film", reason: null, waitRemainingMs: null } }), "NO FILM"],
  ];
  it.each(cases)("%s", (_name, setup, label) => {
    const u = renderCard(setup());
    const badges = u.getAllByTestId("film-card-badge");
    expect(badges).toHaveLength(1);
    expect(textOf(badges[0])).toBe(label);
  });

  it("Processing is never a card badge", () => {
    setMatchUpload("m-1", { status: "uploaded", progress: 1 });
    const u = renderCard({ item: libItem({ match_id: "m-1", videos: [] }) });
    expect(u.queryByTestId("film-card-badge")).toBeNull();
    expect(u.getByText("PROCESSING FILM")).toBeTruthy();
  });

  it("a NO FILM phase card with video rows shows the deck badge and no C-L7", () => {
    const u = renderCard({
      item: libItem({ videos: [libVideo({ poster_url: null, playability: "failed", status: "failed", has_analysis: false })] }),
      phase: { phase: "no_film", reason: null, waitRemainingMs: null },
      noFilmHelper: true,
    });
    expect(textOf(u.getByTestId("film-card-badge"))).toBe("NO FILM");
    expect(u.queryByText("NO FILM FOR THIS ONE")).toBeNull();
    expect(u.queryByTestId("film-card-helper")).toBeNull();
  });

  it("a recent unrecorded match (zero videos, no_film / nobody_recorded) draws C-L7 with no badge, and can teach the helper", () => {
    const u = renderCard({
      item: libItem({ match_id: "m-1", videos: [] }),
      phase: { phase: "no_film", reason: "nobody_recorded", waitRemainingMs: null } as never,
      noFilmHelper: true,
    });
    expect(u.queryByTestId("film-card-badge")).toBeNull();
    expect(u.getByText("NO FILM FOR THIS ONE")).toBeTruthy();
    expect(u.getByTestId("film-card-helper")).toBeTruthy();
    expect(u.getByTestId("film-card-m-1").props.accessibilityLabel).toMatch(/^Open match vs M\. Park\. Won/);
  });

  it("a zero-video card still collecting shows its badge and the arrives-after-upload caption, never C-L7", () => {
    const u = renderCard({
      item: libItem({ match_id: "m-1", videos: [] }),
      phase: { phase: "waiting_for_angle", reason: null, waitRemainingMs: 60_000 },
      noFilmHelper: true,
    });
    expect(u.queryByText("NO FILM FOR THIS ONE")).toBeNull();
    expect(u.queryByTestId("film-card-helper")).toBeNull();
    expect(u.getByText("STILL ARRIVES AFTER UPLOAD")).toBeTruthy();
  });

  it("the meta row reads the badge after the opponent", () => {
    const u = renderCard({ seen: false, item: libItem({ match_id: "m-1", completed_at: fresh }) });
    expect(u.getByTestId("film-card-m-1").props.accessibilityLabel).toMatch(/^Open match vs M\. Park, new\. Won/);
  });

  it("a retryable failed upload offers Try again on the media", () => {
    setMatchUpload("m-1", { status: "error", errorClass: "offline", error: "x" });
    const u = renderCard({ item: libItem({ match_id: "m-1", videos: [] }) });
    expect(u.getByTestId("film-card-retry")).toBeTruthy();
    expect(u.getByTestId("film-card-media-m-1").props.accessibilityActions).toEqual([{ name: "retry", label: expect.any(String) }]);
  });
});

describe("meta row (AC 2.4, 6.5)", () => {
  it("a draw and a zero delta are neutral ink-2, never amber or green", () => {
    const p = palette();
    const u = renderCard({ item: libItem({ outcome: "draw", elo_delta: 0 }) });
    const delta = u.getByTestId("film-card-delta");
    expect(delta).toHaveTextContent("± 0");
    const flat = Object.assign({}, ...[].concat(delta.props.style));
    expect(flat.color).toBe(p.text2);
    expect(flat.color).not.toBe(p.amber);
    const d = within(u.getByTestId("film-card-m-1")).getByText("D");
    expect(Object.assign({}, ...[].concat(d.props.style)).color).toBe(p.text2);
  });

  it("a win is gain green, a loss is the loss ink", () => {
    const p = palette();
    const win = renderCard({ item: libItem({ match_id: "w", elo_delta: 18 }) });
    expect(Object.assign({}, ...[].concat(win.getByTestId("film-card-delta").props.style)).color).toBe(p.win);
    win.unmount();
    const loss = renderCard({ item: libItem({ match_id: "l", outcome: "loss", elo_delta: -11 }) });
    expect(loss.getByTestId("film-card-delta")).toHaveTextContent("▼ −11");
    expect(Object.assign({}, ...[].concat(loss.getByTestId("film-card-delta").props.style)).color).toBe(p.loss);
  });

  it("a disputed match with no delta reads Pending and carries DISPUTED", () => {
    const u = renderCard({ item: libItem({ status: "disputed", elo_delta: null }) });
    expect(u.getByTestId("film-card-delta")).toHaveTextContent("Pending");
    expect(u.getByText("DISPUTED")).toBeTruthy();
    expect(u.getByTestId("film-card-m-1").props.accessibilityLabel).toMatch(/Elo pending, .*, disputed$/);
  });

  it("shows the FIRST MATCH and FIRST WIN tags it is given", () => {
    const u = renderCard({ tags: ["FIRST MATCH", "FIRST WIN"] });
    expect(u.getByText("FIRST MATCH")).toBeTruthy();
    expect(u.getByText("FIRST WIN")).toBeTruthy();
    expect(u.getByTestId("film-card-m-1").props.accessibilityLabel).toMatch(/first match, first win$/);
  });

  it("the date is the shipped shortDate", () => {
    const u = renderCard({ item: libItem({ completed_at: "2026-10-04T12:00:00Z" }) });
    expect(u.getByText("· OCT 04")).toBeTruthy();
  });
});

describe("recording helper (C-L6, AC 6.7)", () => {
  it("only the card asked to teach it shows C-L6 under C-L7", () => {
    const withHelper = renderCard({ item: libItem({ match_id: "a", videos: [] }), noFilmHelper: true });
    expect(withHelper.getByTestId("film-card-helper")).toHaveTextContent("Turn on Record from my phone at face-off.");
    withHelper.unmount();
    const without = renderCard({ item: libItem({ match_id: "b", videos: [] }) });
    expect(without.queryByTestId("film-card-helper")).toBeNull();
  });
});
