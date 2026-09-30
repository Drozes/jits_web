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
import { AA_NORMAL_TEXT, composite, contrast } from "../../support/token-contrast";
import { libItem, libVideo } from "../../support/film-fixtures";

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

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});

import { ON_MEDIA, paletteFor, usePalette } from "@/lib/theme/palette";
import { ForceDarkTheme } from "@/lib/theme/force-dark-theme";
import { ThemedStatusBar } from "@/lib/theme/themed-status-bar";
import { darkTokens, lightTokens } from "@/lib/tokens";
import { FightButton, KindTag, StakesStrip } from "@/components/match-flow/fight/fight-ui";
import { FilmBadge } from "@/components/film-room/status-badge";
import { PosterCard } from "@/components/film-room/poster-card";
import { FaceoffChip } from "@/components/match-flow/faceoff/faceoff-top";

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

describe("on-media text holds AA on its own backing", () => {
  // Worst case: the brightest possible photo (white) under the backing.
  const opaque = (fg: string, bg: string) => (fg.startsWith("rgba") ? composite(fg, bg) : fg);

  it("badges (status, clock, uploading) on the badge fill over a white frame", () => {
    const bg = composite(ON_MEDIA.badge, "#FFFFFF");
    for (const ink of [ON_MEDIA.white, ON_MEDIA.text, ON_MEDIA.red, ON_MEDIA.win, ON_MEDIA.amber]) {
      expect(contrast(opaque(ink, bg), bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it("the poster's bottom lines at the scrim's solid end over a white frame", () => {
    const bg = composite("rgba(0,0,0,0.88)", "#FFFFFF");
    for (const ink of [ON_MEDIA.white, ON_MEDIA.text, ON_MEDIA.text2, ON_MEDIA.red, ON_MEDIA.win]) {
      expect(contrast(opaque(ink, bg), bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it("the light chip over the camera (and the light badge tone)", () => {
    const bg = composite(ON_MEDIA.chip, "#000000");
    for (const ink of [ON_MEDIA.ink, ON_MEDIA.ink3, ON_MEDIA.inkRed]) {
      expect(contrast(ink, bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
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
        <KindTag />
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
        <KindTag onScrim />
        <FilmBadge label="2 ANGLES" tone="outline" />
      </View>,
    );
    expect(color(s.getByText("RANKED"))).toBe(ON_MEDIA.tagText);
    expect(color(s.getByText("2 ANGLES"))).toBe(ON_MEDIA.text);
  });
});

describe("poster card with no still (light theme)", () => {
  it("drops the black scrim and sets its lines in the theme's ink", () => {
    mockScheme = "light";
    const p = paletteFor("light");
    const s = render(
      <PosterCard
        item={libItem({ videos: [libVideo({ poster_url: null })] })}
        status={{ kind: "ready" }}
        viewer={{ name: "Kai Reyes", photoUrl: null }}
        onPress={jest.fn()}
      />,
    );
    expect(s.getByTestId("opening-still-fallback")).toBeTruthy();
    expect(s.queryByTestId("film-card-scrim")).toBeNull();
    expect(color(s.getByText("M. Park"))).toBe(p.text);
    expect(color(s.getByText("W"))).toBe(p.win);
    expect(color(s.getByText(/^▲ \+14/))).toBe(p.win);
    expect(contrast(p.text2, p.plate)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("keeps the scrim and on-media lines over a still", () => {
    mockScheme = "light";
    const s = render(
      <PosterCard item={libItem()} status={{ kind: "ready" }} viewer={{ name: "Kai Reyes", photoUrl: null }} onPress={jest.fn()} />,
    );
    expect(s.getByTestId("film-card-scrim")).toBeTruthy();
    expect(color(s.getByText("M. Park"))).toBe(ON_MEDIA.white);
    expect(color(s.getByText("W"))).toBe(ON_MEDIA.win);
  });
});

describe("FaceoffChip", () => {
  const athletes = {
    me: { display_name: "Kai Reyes", current_elo: 1512 },
    opponent: { display_name: "Mina Park", current_elo: 1498 },
    myWeight: 170,
    opponentWeight: 165,
  };
  it.each(["light", "dark"] as const)("on the page is a themed plate (%s)", (scheme) => {
    mockScheme = scheme;
    const p = paletteFor(scheme);
    const s = render(<FaceoffChip {...athletes} />);
    expect(bgOf(s.getByTestId("faceoff-chip"))).toBe(p.plate);
    expect(color(s.getByText("K. Reyes"))).toBe(p.text);
  });

  it("over the camera (countdown) is the fixed light chip", () => {
    mockScheme = "dark";
    const s = render(<FaceoffChip {...athletes} onMedia />);
    expect(bgOf(s.getByTestId("faceoff-chip"))).toBe(ON_MEDIA.chip);
    expect(color(s.getByText("K. Reyes"))).toBe(ON_MEDIA.ink);
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
