/**
 * EloTile before/after mode (jits-0b37, jits-v6ri, jits-9cgj).
 *
 * - The after number ticks from before to after over the brand's 480ms, in
 *   integer steps, once, then fires one light haptic.
 * - Reduce motion shows the final value with no intermediate frames.
 * - The ticking number's accessibility label is always the final value.
 * - A pair of 4-digit ratings shares the row and shrinks to fit instead of
 *   overflowing a phone-width screen.
 * - The after tile's border follows the outcome tone, never Signal Red.
 */
import * as React from "react";
import { AccessibilityInfo, Text } from "react-native";
import { render, act } from "@testing-library/react-native";

const mockImpact = jest.fn((_style?: unknown) => Promise.resolve());
jest.mock("expo-haptics", () => ({
  impactAsync: (style: unknown) => mockImpact(style),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

let mockScheme: "light" | "dark" = "light";
jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => mockScheme,
}));

import { EloTile, RATING_TICK_MS } from "@/components/ui/elo-system/elo-tile";

let reduceMotion = false;

beforeEach(() => {
  jest.useFakeTimers();
  mockImpact.mockClear();
  reduceMotion = false;
  mockScheme = "light";
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(() => Promise.resolve(reduceMotion));
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Let the reduce-motion promise resolve. */
async function flushReduceMotion() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function afterValue(utils: ReturnType<typeof render>) {
  const el = utils.getByTestId("elo-tile-after-value");
  return { text: String(el.props.children), label: el.props.accessibilityLabel, props: el.props };
}

describe("rating tick", () => {
  it("counts up from before to after over 480ms in integer steps, then one light haptic", async () => {
    const utils = render(<EloTile label="ELO Rating" before={1000} after={1016} tone="positive" />);
    expect(afterValue(utils).text).toBe("1000");
    await flushReduceMotion();

    const seen: string[] = [];
    for (let t = 0; t < RATING_TICK_MS; t += 16) {
      act(() => {
        jest.advanceTimersByTime(16);
      });
      seen.push(afterValue(utils).text);
    }
    act(() => {
      jest.advanceTimersByTime(64);
    });

    expect(afterValue(utils).text).toBe("1016");
    // Intermediate frames were whole numbers strictly between the two.
    const mids = seen.map(Number).filter((n) => n > 1000 && n < 1016);
    expect(mids.length).toBeGreaterThan(0);
    for (const n of seen.map(Number)) expect(Number.isInteger(n)).toBe(true);
    // Monotonic, never overshooting.
    const nums = seen.map(Number);
    for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeGreaterThanOrEqual(nums[i - 1]);
    expect(Math.max(...nums)).toBeLessThanOrEqual(1016);
    expect(mockImpact).toHaveBeenCalledTimes(1);
    expect(mockImpact).toHaveBeenCalledWith("light");
  });

  it("is still running before 480ms and never replays after it lands", async () => {
    const utils = render(<EloTile label="ELO Rating" before={1016} after={1000} tone="negative" />);
    await flushReduceMotion();
    act(() => {
      jest.advanceTimersByTime(RATING_TICK_MS / 3);
    });
    expect(Number(afterValue(utils).text)).toBeGreaterThan(1000);
    act(() => {
      jest.advanceTimersByTime(RATING_TICK_MS);
    });
    expect(afterValue(utils).text).toBe("1000");
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    utils.rerender(<EloTile label="ELO Rating" before={1016} after={1000} tone="negative" />);
    expect(afterValue(utils).text).toBe("1000");
    expect(mockImpact).toHaveBeenCalledTimes(1);
  });

  it("a new after value mid-tick jumps to it and lands once, never restarting from before", async () => {
    const utils = render(<EloTile label="ELO Rating" before={1000} after={1016} />);
    await flushReduceMotion();
    act(() => {
      jest.advanceTimersByTime(200);
    });
    const mid = Number(afterValue(utils).text);
    expect(mid).toBeGreaterThan(1000);
    expect(mid).toBeLessThan(1016);

    utils.rerender(<EloTile label="ELO Rating" before={1000} after={1020} />);
    expect(afterValue(utils).text).toBe("1020");
    expect(mockImpact).toHaveBeenCalledTimes(1);

    const seen: string[] = [];
    for (let t = 0; t < 2 * RATING_TICK_MS; t += 16) {
      act(() => {
        jest.advanceTimersByTime(16);
      });
      seen.push(afterValue(utils).text);
    }
    expect(new Set(seen)).toEqual(new Set(["1020"]));
    expect(mockImpact).toHaveBeenCalledTimes(1);
  });

  it("with reduce motion on, shows the final value with no intermediate frames", async () => {
    reduceMotion = true;
    const utils = render(<EloTile label="ELO Rating" before={1000} after={1016} />);
    await flushReduceMotion();
    expect(afterValue(utils).text).toBe("1016");
    expect(mockImpact).toHaveBeenCalledTimes(1);
  });

  it("labels the ticking number with the final value from the first frame", async () => {
    const utils = render(<EloTile label="ELO Rating" before={1000} after={1016} />);
    expect(afterValue(utils).label).toBe("1016");
    await flushReduceMotion();
    act(() => {
      jest.advanceTimersByTime(RATING_TICK_MS / 2);
    });
    expect(afterValue(utils).label).toBe("1016");
  });

  it("does not animate a non-numeric pair", async () => {
    const utils = render(<EloTile label="ELO Rating" before="N/A" after="N/A" />);
    await flushReduceMotion();
    expect(afterValue(utils).text).toBe("N/A");
  });
});

describe("4-digit ratings fit a phone-width row (jits-v6ri)", () => {
  it("shares the row equally and shrinks the number to fit, never overflowing", async () => {
    const utils = render(<EloTile label="ELO Rating" before={1000} after={1016} size="large" />);
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
