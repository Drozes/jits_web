/**
 * The live preview is drawn at the recorded 9:16 aspect, fitted to the
 * screen, so it shows exactly the recorded frame and never a crop.
 */
import { fitRecordedFrame, readyPreviewWidth } from "@/lib/video/recorded-frame";

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
