/**
 * The live preview is drawn at the recorded 9:16 aspect, fitted to the
 * screen, so it shows exactly the recorded frame and never a crop.
 */
import {
  fitRecordedFrame,
  READY_NOTES_MIN_HEIGHT,
  readyPreviewBox,
  readyPreviewWidth,
  recordedReadyCardWidth,
} from "@/lib/video/recorded-frame";

describe("fitRecordedFrame", () => {
  it("fills the width and top-aligns on a phone (390 x 844)", () => {
    const f = fitRecordedFrame(390, 844);
    expect(f.width).toBe(390);
    expect(f.height).toBeCloseTo(693.33, 2);
    expect(f.left).toBe(0);
    expect(f.top).toBe(0);
  });

  it("fills the width on an iPhone SE (375 x 667)", () => {
    const f = fitRecordedFrame(375, 667);
    expect(f.width).toBe(375);
    expect(f.height).toBeCloseTo(666.67, 2);
    expect(f.left).toBe(0);
  });

  it("fills the width on a Pro Max (430 x 932)", () => {
    const f = fitRecordedFrame(430, 932);
    expect(f.width).toBe(430);
    expect(f.height).toBeCloseTo(764.44, 2);
    expect(f.top).toBe(0);
  });

  it("fills the height and centers horizontally on an iPad in portrait (768 x 1024)", () => {
    expect(fitRecordedFrame(768, 1024)).toEqual({ width: 576, height: 1024, left: 96, top: 0 });
  });
});

describe("fitRecordedFrame in landscape (16:9)", () => {
  it("fills the height and centers horizontally on a phone (844 x 390)", () => {
    const f = fitRecordedFrame(844, 390);
    expect(f.height).toBe(390);
    expect(f.width).toBeCloseTo(693.33, 2);
    expect(f.left).toBeCloseTo(75.33, 2);
    expect(f.top).toBe(0);
  });

  it("fills the height on an iPhone SE (667 x 375)", () => {
    const f = fitRecordedFrame(667, 375);
    expect(f.height).toBe(375);
    expect(f.width).toBeCloseTo(666.67, 2);
    expect(f.left).toBeCloseTo(0.17, 2);
  });

  it("fills the width and centers vertically on a window taller than 16:9 (iPad 1024 x 768)", () => {
    expect(fitRecordedFrame(1024, 768)).toEqual({ width: 1024, height: 576, left: 0, top: 96 });
  });

  it("treats a square window as portrait", () => {
    expect(fitRecordedFrame(500, 500)).toEqual({ width: 281.25, height: 500, left: 109.375, top: 0 });
  });
});

describe("readyPreviewWidth", () => {
  it("is 0.6 x height x 16 / 9 in landscape", () => {
    expect(readyPreviewWidth(844, 390)).toBeCloseTo(416, 5);
    expect(readyPreviewWidth(667, 375)).toBeCloseTo(400, 5);
  });

  it("is null in portrait (the card stays full width)", () => {
    expect(readyPreviewWidth(390, 844)).toBeNull();
  });
});

// The ready preview under the capture policy (timekeeper mode spec 13.2, A21):
// the recorded 9:16 frame in a portrait window, so the athlete frames exactly
// what is recorded, sized so the ready controls never sit lower than they did
// under the shipped 16:9 card (M9 review round 1).
describe("readyPreviewBox", () => {
  /** The shipped ready card's outer height: the full content width at 16:9 inside a 1 pt border. */
  const shippedCardHeight = (w: number) => ((w - 32 - 2) * 9) / 16 + 2;
  /** The 9:16 card's outer height for its outer width. */
  const cardHeight = (width: number) => ((width - 2) * 16) / 9 + 2;

  // Outer card size per device class, in points (portrait window width x height).
  it.each([
    ["iPhone SE 3 (375 x 667)", 375, 133.52, 235.81],
    ["iPhone 13 mini (375 x 812)", 375, 133.52, 235.81],
    ["iPhone 14 (390 x 844)", 390, 138.27, 244.25],
    ["iPhone 17 Pro (402 x 874)", 402, 142.06, 251.0],
    ["iPhone 17 Pro Max (440 x 956)", 440, 154.09, 272.38],
  ])("recorded, %s: a 9:16 card %s wide with its lines beside it", (_name, width, cardWidth, height) => {
    const box = readyPreviewBox(width, 900, "recorded");
    expect(box.aspectRatio).toBe(9 / 16);
    expect(box.notes).toBe("beside");
    expect(box.width).toBeCloseTo(cardWidth, 2);
    expect(cardHeight(box.width!)).toBeCloseTo(height, 2);
  });

  it("recorded: exactly the shipped card's height plus the least its two lines took, so the block never grew", () => {
    expect(READY_NOTES_MIN_HEIGHT).toBe(8 + 13 + 8 + 13);
    for (const width of [320, 375, 390, 402, 430, 440, 768, 1024]) {
      const box = readyPreviewBox(width, width * 2, "recorded");
      expect(box.width).toBe(recordedReadyCardWidth(width));
      expect(cardHeight(box.width!)).toBeCloseTo(shippedCardHeight(width) + READY_NOTES_MIN_HEIGHT, 6);
    }
  });

  it("recorded: the height of the window plays no part (the controls below are what it protects)", () => {
    expect(readyPreviewBox(375, 667, "recorded")).toEqual(readyPreviewBox(375, 812, "recorded"));
  });

  it("recorded, landscape window (a portrait lock the system ignores): the 16:9 card, what records, lines under", () => {
    expect(readyPreviewBox(844, 390, "recorded")).toEqual({
      width: readyPreviewWidth(844, 390),
      aspectRatio: 16 / 9,
      notes: "under",
    });
  });

  it("wide (the landscape seams): full width 16:9 in portrait, the landscape card in landscape, lines under", () => {
    expect(readyPreviewBox(390, 844, "wide")).toEqual({ width: null, aspectRatio: 16 / 9, notes: "under" });
    expect(readyPreviewBox(844, 390, "wide")).toEqual({
      width: readyPreviewWidth(844, 390),
      aspectRatio: 16 / 9,
      notes: "under",
    });
  });
});
