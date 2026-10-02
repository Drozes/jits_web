/**
 * EloTile before/after mode (jits-0b37, jits-v6ri, jits-9cgj; Adding Flare
 * jits-pddd.4).
 *
 * - The after number rolls like an odometer from before to after in ROLL_MS
 *   (UI thread), once, then lands as a plain Text with the final value.
 * - A gain lands with ONE `ratingGain` (Success); a loss or a draw is silent.
 * - Reduce motion shows the final value from the first frame.
 * - The number's accessibility label is always the final value.
 * - A pair of 4-digit ratings shares the row and shrinks to fit instead of
 *   overflowing a phone-width screen.
 * - The after tile's border follows the outcome tone, never Signal Red.
 */
import * as React from "react";
import { Text } from "react-native";
import { render, act } from "@testing-library/react-native";

const mockImpact = jest.fn((_style?: unknown) => Promise.resolve());
const mockNotify = jest.fn((_type?: unknown) => Promise.resolve());
jest.mock("expo-haptics", () => ({
  impactAsync: (style: unknown) => mockImpact(style),
  notificationAsync: (type: unknown) => mockNotify(type),
  selectionAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

let mockScheme: "light" | "dark" = "light";
jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => mockScheme,
}));

import { EloTile } from "@/components/ui/elo-system/elo-tile";
import { ROLL_LAND_FALLBACK_MS, ROLL_MS, __resetPlayedMomentsForTests } from "@/components/ui/elo-system/rolling-number";
import { __setReduceMotionForTests } from "@/lib/motion";

beforeEach(() => {
  jest.useFakeTimers();
  mockImpact.mockClear();
  mockNotify.mockClear();
  __setReduceMotionForTests(false);
  __resetPlayedMomentsForTests();
  mockScheme = "light";
});

afterEach(() => {
  jest.useRealTimers();
  __setReduceMotionForTests(false);
});

/** Let any pending microtasks settle (kept for the async tone tests). */
async function flushReduceMotion() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function afterValue(utils: ReturnType<typeof render>) {
  const el = utils.getByTestId("elo-tile-after-value");
  return { text: el.type === "Text" ? String(el.props.children) : null, label: el.props.accessibilityLabel, props: el.props };
}

function land() {
  act(() => {
    jest.advanceTimersByTime(ROLL_MS + ROLL_LAND_FALLBACK_MS + 16);
  });
}

const flush = async () => {
  await Promise.resolve();
};

describe("odometer roll", () => {
  it("rolls (digit columns, not a ticking Text), then lands on the final value with one ratingGain", async () => {
    const utils = render(<EloTile label="ELO Rating" before={1000} after={1016} tone="positive" playKey="r1000-1016" />);
    // Mid-roll: the number is digit strips, labelled with the final value.
    expect(afterValue(utils).text).toBeNull();
    expect(afterValue(utils).label).toBe("1016");
    expect(mockNotify).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(ROLL_MS / 2);
    });
    expect(afterValue(utils).text).toBeNull();
    land();
    await flush();
    expect(afterValue(utils).text).toBe("1016");
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith("success");
    // The legacy Light impact is gone.
    expect(mockImpact).not.toHaveBeenCalled();
  });

  it("a loss lands silent (no haptic on a loss) and never replays on re-render", async () => {
    const utils = render(<EloTile label="ELO Rating" before={1016} after={1000} tone="negative" playKey="r1016-1000" />);
    land();
    await flush();
    expect(afterValue(utils).text).toBe("1000");
    utils.rerender(<EloTile label="ELO Rating" before={1016} after={1000} tone="negative" playKey="r1016-1000" />);
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(afterValue(utils).text).toBe("1000");
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockImpact).not.toHaveBeenCalled();
  });

  it("a draw tile (amber) that gains is silent", async () => {
    render(<EloTile label="ELO Rating" before={1000} after={1004} tone="amber" playKey="r1000-1004" />);
    land();
    await flush();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("a new after value mid-roll jumps to it and lands once, never restarting", async () => {
    const utils = render(<EloTile label="ELO Rating" before={1000} after={1016} playKey="r1000-1016" />);
    act(() => {
      jest.advanceTimersByTime(200);
    });
    utils.rerender(<EloTile label="ELO Rating" before={1000} after={1020} playKey="r1000-1020" />);
    expect(afterValue(utils).text).toBe("1020");
    land();
    act(() => {
      jest.advanceTimersByTime(2 * ROLL_MS);
    });
    await flush();
    expect(afterValue(utils).text).toBe("1020");
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("with reduce motion on, shows the final value from the first frame (gain haptic kept)", async () => {
    __setReduceMotionForTests(true);
    const utils = render(<EloTile label="ELO Rating" before={1000} after={1016} playKey="r1000-1016" />);
    expect(afterValue(utils).text).toBe("1016");
    await flushReduceMotion();
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("with a playKey, a remount of the same result shows the end state, silent", async () => {
    const first = render(<EloTile label="ELO Rating" before={1000} after={1016} playKey="m1" />);
    land();
    await flush();
    first.unmount();
    expect(mockNotify).toHaveBeenCalledTimes(1);
    const again = render(<EloTile label="ELO Rating" before={1000} after={1016} playKey="m1" />);
    expect(afterValue(again).text).toBe("1016");
    land();
    await flush();
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("without a playKey is static and silent (it cannot tell results apart)", async () => {
    const utils = render(<EloTile label="ELO Rating" before={1000} after={1016} />);
    expect(afterValue(utils).text).toBe("1016");
    land();
    await flush();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("does not animate a non-numeric pair", async () => {
    const utils = render(<EloTile label="ELO Rating" before="N/A" after="N/A" />);
    await flushReduceMotion();
    expect(afterValue(utils).text).toBe("N/A");
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("4-digit ratings fit a phone-width row (jits-v6ri)", () => {
  it("shares the row equally and shrinks the number to fit, never overflowing", async () => {
    const utils = render(<EloTile label="ELO Rating" before={1000} after={1016} size="large" />);
    land();
    await flushReduceMotion();
    const numbers = utils
      .UNSAFE_getAllByType(Text)
      .filter((t) => /^\d{4}$/.test(String(t.props.children)));
    expect(numbers).toHaveLength(2);
    for (const n of numbers) {
      expect(n.props.numberOfLines).toBe(1);
      expect(n.props.adjustsFontSizeToFit).toBe(true);
      expect(n.props.minimumFontScale).toBe(0.6);
    }
    const row = utils.toJSON() as { props: { className: string }; children: Array<{ props: { className?: string } }> };
    expect(row.props.className).toContain("self-stretch");
    const tiles = row.children.filter((c) => c.props.className?.includes("bg-surface-3"));
    expect(tiles).toHaveLength(2);
    for (const tile of tiles) {
      expect(tile.props.className).toContain("flex-1");
      expect(tile.props.className).not.toContain("min-w-");
    }

    // Width budget on a 375pt iPhone (the narrowest supported): about 339pt
    // of content, minus the arrow (~17pt) and two 12pt gaps, halves to about
    // 149pt per tile; minus px-3 padding and the border leaves ~123pt of text.
    // Four 64px JetBrains Mono glyphs (0.6em advance, -0.04em tracking) need
    // ~143pt, so the text must scale to ~0.86, well above the 0.6 floor.
    const glyphs = 4 * 64 * (0.6 - 0.04);
    const textBox = (339 - 17 - 2 * 12) / 2 - 2 * 12 - 2;
    expect(glyphs * 0.6).toBeLessThan(textBox);
  });

  it("leaves the single-value tile (Home, weight step) unchanged", () => {
    const utils = render(<EloTile label="lbs" value={185} size="medium" />);
    const tile = (utils.toJSON() as { children: Array<{ props: { className: string } }> }).children[0];
    expect(tile.props.className).toContain("min-w-[120px]");
    expect(tile.props.className).not.toContain("flex-1");
    const num = utils.getByText("185");
    expect(num.props.adjustsFontSizeToFit).toBeUndefined();
    expect(num.props.numberOfLines).toBeUndefined();
  });
});

describe("after tile tone (jits-9cgj)", () => {
  function afterTileClass(utils: ReturnType<typeof render>) {
    const row = utils.toJSON() as { children: Array<{ props: { className?: string } }> };
    const tiles = row.children.filter((c) => c.props.className?.includes("bg-surface-3"));
    return tiles[1].props.className!;
  }

  it.each([
    ["positive", "border-positive"],
    ["negative", "border-negative"],
    ["amber", "border-amber-800"],
  ] as const)("%s tone borders the after tile with %s, never Signal Red", async (tone, cls) => {
    const utils = render(<EloTile label="ELO Rating" before={1000} after={1016} tone={tone} />);
    await flushReduceMotion();
    expect(afterTileClass(utils)).toContain(cls);
    expect(afterTileClass(utils)).not.toContain("border-cta");
  });

  it("amber follows the dark scheme", async () => {
    mockScheme = "dark";
    const utils = render(<EloTile label="ELO Rating" before={1000} after={992} tone="amber" />);
    await flushReduceMotion();
    expect(afterTileClass(utils)).toContain("border-amber-500");
  });
});

// P-Home (jits-02vo.1): Home's hero tile has no label and carries the record
// as a mono meta line under the number. Other tiles keep their label.
describe("optional label and meta line", () => {
  it("renders no label row and no top gap when the label is omitted", () => {
    const utils = render(<EloTile size="hero" value={1487} accentBar />);
    const texts = utils.UNSAFE_getAllByType(Text);
    expect(texts).toHaveLength(1);
    const num = utils.getByText("1487");
    expect(num.props.style.marginTop).toBe(0);
    expect(num.props.style.fontSize).toBe(96);
    expect(utils.queryByTestId("elo-tile-meta")).toBeNull();
  });

  it("keeps the label and its gap when one is given", () => {
    const utils = render(<EloTile label="lbs" value={185} size="medium" />);
    expect(utils.getByText("lbs")).toBeTruthy();
    expect(utils.getByText("185").props.style.marginTop).toBe(8);
  });

  it("renders the meta line under the number with its spoken label", () => {
    const utils = render(
      <EloTile
        size="hero"
        value={1487}
        meta="14W · 6L · 1D"
        metaLabel="Record: 14 wins, 6 losses, 1 draw"
        accentBar
      />,
    );
    const meta = utils.getByTestId("elo-tile-meta");
    expect(meta.props.children).toBe("14W · 6L · 1D");
    expect(meta.props.accessibilityLabel).toBe("Record: 14 wins, 6 losses, 1 draw");
    expect(meta.props.className).toContain("text-[14px]");
    // P-Home draws the record in #9CA3AF: ink-2, not ink-3.
    expect(meta.props.className).toContain("text-ink-2");
    expect(meta.props.className).not.toContain("text-ink-3");
    expect(meta.props.style.fontVariant).toEqual(["tabular-nums"]);
    // Order inside the tile: number first, then the meta line.
    const texts = utils.UNSAFE_getAllByType(Text).map((t) => t.props.children);
    expect(texts).toEqual([1487, "14W · 6L · 1D"]);
  });

  it("reserves the meta line's height, hidden from accessibility, while meta is unknown", () => {
    const utils = render(<EloTile size="hero" value={1487} reserveMeta accentBar />);
    expect(utils.queryByTestId("elo-tile-meta")).toBeNull();
    // Hidden from accessibility, so the default query does not see it.
    expect(utils.queryByTestId("elo-tile-meta-placeholder")).toBeNull();
    const slot = utils.getByTestId("elo-tile-meta-placeholder", { includeHiddenElements: true });
    // Same box as the real line: 18 line height plus 4 above and 4 below.
    expect(slot.props.style).toEqual({ height: 18, marginTop: 4, marginBottom: 4 });
    expect(slot.props.accessibilityElementsHidden).toBe(true);
    expect(slot.props.importantForAccessibility).toBe("no-hide-descendants");
    // Only the number is text; the slot reads nothing.
    expect(utils.UNSAFE_getAllByType(Text)).toHaveLength(1);
  });

  it("swaps the reserved slot for the meta line once meta is known", () => {
    const utils = render(
      <EloTile size="hero" value={1487} meta="1W · 0L · 0D" reserveMeta accentBar />,
    );
    expect(utils.getByTestId("elo-tile-meta")).toBeTruthy();
    expect(
      utils.queryByTestId("elo-tile-meta-placeholder", { includeHiddenElements: true }),
    ).toBeNull();
  });
});
