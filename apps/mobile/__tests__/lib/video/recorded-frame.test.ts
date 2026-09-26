/**
 * The live preview is drawn at the recorded 9:16 aspect, fitted to the
 * screen, so it shows exactly the recorded frame and never a crop.
 */
import { fitRecordedFrame } from "@/lib/video/recorded-frame";

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
