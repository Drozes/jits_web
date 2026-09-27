/**
 * FilmSurface pins the Film Room dark in both app themes: besides the dark
 * CSS variables it provides the forced scheme context (as ForceDarkTheme
 * does), so theme hooks below it resolve dark while the app scheme is light.
 */
import * as React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

jest.mock("nativewind", () => ({
  ...jest.requireActual("nativewind"),
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

import { FilmSurface } from "@/components/film-room/film-surface";
import { useResolvedColorScheme, useThemedTokens } from "@/lib/theme/use-theme";
import { darkTokens, lightTokens } from "@/lib/tokens";

function Probe() {
  const scheme = useResolvedColorScheme();
  const tokens = useThemedTokens();
  return (
    <Text testID="probe">
      {scheme}|{tokens === darkTokens ? "darkTokens" : tokens === lightTokens ? "lightTokens" : "other"}
    </Text>
  );
}

function text(s: ReturnType<typeof render>): string {
  const c = s.getByTestId("probe").props.children;
  return Array.isArray(c) ? c.join("") : String(c);
}

describe("FilmSurface forced dark scheme", () => {
  it("the app scheme is light outside the surface", () => {
    expect(text(render(<Probe />))).toBe("light|lightTokens");
  });

  it("resolves dark tokens and scheme inside FilmSurface while the app is light", () => {
    const s = render(
      <FilmSurface>
        <Probe />
      </FilmSurface>,
    );
    expect(text(s)).toBe("dark|darkTokens");
  });
});
