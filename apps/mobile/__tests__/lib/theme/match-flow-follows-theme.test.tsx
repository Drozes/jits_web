/**
 * The match flow and the Film Room follow the app theme (light and dark):
 * `usePalette()` resolves the active scheme's tokens, the shared match-flow
 * pieces render with them, every text color it adds holds 4.5:1 on the
 * theme's plates, and the status bar follows the app scheme. Only full-screen
 * video stays pinned dark (`ForceDarkTheme`), and the chrome over camera or
 * a photo keeps its fixed on-media colors.
 */
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { render } from "@testing-library/react-native";
import { AA_NORMAL_TEXT, contrast } from "../../support/token-contrast";

let mockScheme: "light" | "dark" = "light";
jest.mock("nativewind", () => ({
  ...jest.requireActual("nativewind"),
  useColorScheme: () => ({ colorScheme: mockScheme, setColorScheme: jest.fn() }),
}));
const mockStatusBar = jest.fn();
jest.mock("expo-status-bar", () => ({
  StatusBar: (p: { style: string }) => {
    mockStatusBar(p.style);
    return null;
  },
}));

import { ON_MEDIA, paletteFor, usePalette } from "@/lib/theme/palette";
import { ForceDarkTheme } from "@/lib/theme/force-dark-theme";
import { ThemedStatusBar } from "@/lib/theme/themed-status-bar";
import { darkTokens, lightTokens } from "@/lib/tokens";
import { FightButton, KindTag, StakesStrip } from "@/components/match-flow/fight/fight-ui";
import { FilmBadge } from "@/components/film-room/status-badge";

function Probe() {
  const p = usePalette();
  return <Text testID="probe">{p.bg}</Text>;
}

type Styled = { props: { style?: unknown } };
const flat = (el: Styled) => (StyleSheet.flatten(el.props.style as never) ?? {}) as { color?: string; backgroundColor?: string };
const color = (el: Styled) => flat(el).color;
const bgOf = (el: Styled) => flat(el).backgroundColor;

afterEach(() => {
  mockScheme = "light";
  mockStatusBar.mockClear();
});

describe("usePalette follows the app scheme", () => {
  it.each([
    ["light", lightTokens],
    ["dark", darkTokens],
  ] as const)("%s: the page, plate and text are that scheme's tokens", (scheme, t) => {
    const p = paletteFor(scheme);
    expect(p.bg).toBe(t.bgPrimary);
    expect(p.plate).toBe(t.bgElevated);
    expect(p.panel).toBe(t.bgElevatedHover);
    expect(p.text).toBe(t.textPrimary);
    expect(p.text3).toBe(t.textTertiary);
    expect(p.red).toBe(t.accentCtaText);
    expect(p.win).toBe(t.statePositive);
    expect(p.onCta).toBe(t.textOnAccent);
  });

  it("resolves the live scheme in a component", () => {
    mockScheme = "light";
    expect(render(<Probe />).getByTestId("probe")).toHaveTextContent(lightTokens.bgPrimary);
    mockScheme = "dark";
    expect(render(<Probe />).getByTestId("probe")).toHaveTextContent(darkTokens.bgPrimary);
  });

  it("only ForceDarkTheme (full-screen video) pins a subtree dark", () => {
    mockScheme = "light";
    const s = render(
      <ForceDarkTheme>
        <Probe />
      </ForceDarkTheme>,
    );
    expect(s.getByTestId("probe")).toHaveTextContent(darkTokens.bgPrimary);
  });
});

describe("text the palette adds holds AA on the theme's plates", () => {
  it.each(["light", "dark"] as const)("%s", (scheme) => {
    const p = paletteFor(scheme);
    for (const surface of [p.bg, p.plate, p.panel]) {
      for (const ink of [p.text, p.text2, p.text3, p.red, p.win, p.loss, p.amber]) {
        expect(contrast(ink, surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    }
    // The CTA label on the Signal Red fill.
    expect(contrast(p.onCta, p.cta)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

describe("shared match-flow pieces render with the active theme", () => {
  it.each([
    ["light", lightTokens],
    ["dark", darkTokens],
  ] as const)("%s: stakes strip plate and deltas, secondary button label, tag", (scheme, t) => {
    mockScheme = scheme;
    const s = render(
      <View>
        <StakesStrip testID="stakes" win={12} draw={-2} loss={-9} />
        <FightButton testID="btn" variant="secondary" label="Record it myself" onPress={jest.fn()} />
        <KindTag kind="ranked" />
      </View>,
    );
    expect(bgOf(s.getByTestId("stakes"))).toBe(t.bgElevated);
    expect(color(s.getByTestId("stakes-win"))).toBe(t.statePositive);
    expect(color(s.getByTestId("stakes-loss"))).toBe(t.stateNegative);
    expect(color(s.getByText("Record it myself"))).toBe(t.textPrimary);
    expect(color(s.getByText("RANKED"))).toBe(t.textSecondary);
  });

  it("chrome over camera or film keeps the fixed on-media colors in the light theme", () => {
    mockScheme = "light";
    const s = render(
      <View>
        <KindTag kind="casual" onScrim />
        <FilmBadge label="2 ANGLES" tone="outline" />
      </View>,
    );
    expect(color(s.getByText("CASUAL"))).toBe(ON_MEDIA.tagText);
    expect(color(s.getByText("2 ANGLES"))).toBe(ON_MEDIA.text);
  });
});

describe("ThemedStatusBar", () => {
  it("is dark content on the light theme and light content on the dark theme", () => {
    mockScheme = "light";
    render(<ThemedStatusBar />);
    expect(mockStatusBar).toHaveBeenLastCalledWith("dark");
    mockScheme = "dark";
    render(<ThemedStatusBar />);
    expect(mockStatusBar).toHaveBeenLastCalledWith("light");
  });

  it("is light over a photo hero whatever the theme", () => {
    mockScheme = "light";
    render(<ThemedStatusBar overMedia />);
    expect(mockStatusBar).toHaveBeenLastCalledWith("light");
  });
});
