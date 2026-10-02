/**
 * Regression: match-flow buttons rendered as bare text on device (TestFlight
 * build 23, production OTA 26b7aaf). NativeWind's css-interop wraps every RN
 * `Pressable` on device and drops a FUNCTION `style` entirely (fill, border,
 * height, padding), so `<Pressable style={({ pressed }) => ...}>` lost all its
 * chrome. css-interop skips registering that wrapper when NODE_ENV is "test",
 * which is why the existing suites never saw it: this suite registers it
 * explicitly (the same module the app loads), renders under the REAL
 * ThemeProvider in the light theme (no theme mocks), and reads the host
 * style the button actually receives.
 */
import "react-native-css-interop/dist/runtime/components";
import * as fs from "fs";
import * as path from "path";
import * as React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { lightTokens } from "@/lib/tokens";
import { paletteFor } from "@/lib/theme/palette";
import { FightButton } from "@/components/match-flow/fight/fight-ui";
import { HudTagButton } from "@/components/match-flow/live/hud-tag";
import { PauseButton } from "@/components/match-flow/live/pause-button";
import { StatePressable } from "@/components/ui/state-pressable";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Button } from "@/components/ui/button";
import { registerCSS } from "react-native-css-interop/dist/test";

type Styled = { props: { style?: unknown } };
const flat = (el: Styled) =>
  (StyleSheet.flatten(el.props.style as never) ?? {}) as Record<string, unknown>;

describe("function styles survive the NativeWind Pressable interop (light theme, real provider)", () => {
  it("the interop is really active here: a raw Pressable with a function style loses it", () => {
    // Guards the premise of this suite. If css-interop ever starts honoring
    // function styles, this fails and the StatePressable wrapper can go.
    const s = render(
      <ThemeProvider>
        <Pressable testID="raw" style={() => ({ height: 10, backgroundColor: "red" })}>
          <Text>raw</Text>
        </Pressable>
      </ThemeProvider>,
    );
    expect(flat(s.getByTestId("raw")).backgroundColor).toBeUndefined();
  });

  it("primary FightButton (RECORD RESULT, primary watch film) keeps its Signal Red fill and height", () => {
    const s = render(
      <ThemeProvider>
        <FightButton testID="result-record" label="Record result" onPress={jest.fn()} />
      </ThemeProvider>,
    );
    const st = flat(s.getByTestId("result-record"));
    expect(st.backgroundColor).toBe(lightTokens.accentCta);
    expect(st.height).toBe(56);
    expect(st.paddingHorizontal).toBe(16);
  });

  it("secondary FightButton (WATCH FILM) keeps its plate fill and strong hairline", () => {
    // WP3 (kit Button card, "Secondary fill"): the secondary fill is the
    // `plate` token, not the old translucent `secondaryBg`.
    const p = paletteFor("light");
    const s = render(
      <ThemeProvider>
        <FightButton testID="summary-watch-film" variant="secondary" label="Watch film" onPress={jest.fn()} />
      </ThemeProvider>,
    );
    const st = flat(s.getByTestId("summary-watch-film"));
    expect(st.backgroundColor).toBe(p.plate);
    expect(st.borderWidth).toBe(1);
    expect(st.borderColor).toBe(p.strong);
    expect(st.height).toBe(56);
  });

  it("ghost FightButton (the full-width SHARE row) keeps its layout", () => {
    const s = render(
      <ThemeProvider>
        <FightButton testID="summary-share" variant="ghost" label="Share match" height={44} onPress={jest.fn()} />
      </ThemeProvider>,
    );
    const st = flat(s.getByTestId("summary-share"));
    expect(st.height).toBe(44);
    expect(st.flex).toBeUndefined();
    expect(st.flexDirection).toBe("row");
  });

  it("the pressed state still drives the style", () => {
    const p = paletteFor("light");
    const s = render(
      <ThemeProvider>
        <FightButton testID="btn" label="Record result" onPress={jest.fn()} />
      </ThemeProvider>,
    );
    fireEvent(s.getByTestId("btn"), "pressIn");
    expect(flat(s.getByTestId("btn")).backgroundColor).toBe(p.ctaPressed);
    fireEvent(s.getByTestId("btn"), "pressOut");
    expect(flat(s.getByTestId("btn")).backgroundColor).toBe(p.cta);
  });

  it("a disabled StatePressable is never drawn pressed", () => {
    const s = render(
      <StatePressable testID="sp" disabled style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
        <Text>x</Text>
      </StatePressable>,
    );
    fireEvent(s.getByTestId("sp"), "pressIn");
    expect(flat(s.getByTestId("sp")).opacity).toBe(1);
  });

  it("the live screen's HUD tag and Pause buttons keep their chrome", () => {
    const s = render(
      <ThemeProvider>
        <HudTagButton testID="hud" label="TAG" onPress={jest.fn()} accessibilityLabel="tag" />
        <PauseButton paused={false} disabled={false} onPress={jest.fn()} />
      </ThemeProvider>,
    );
    expect(flat(s.getByTestId("hud")).height).toBeDefined();
    const pause = flat(s.getByTestId("live-pause-toggle"));
    expect(pause.height).toBeDefined();
    expect(pause.backgroundColor).toBeDefined();
  });
});

describe("no raw Pressable takes a function style", () => {
  const root = path.resolve(__dirname, "../../..");
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) return d.name === "node_modules" ? [] : walk(full);
      return /\.tsx$/.test(d.name) ? [full] : [];
    });

  it("app/, components/ and lib/ use StatePressable for pressed-state styles", () => {
    const offenders: string[] = [];
    for (const file of ["app", "components", "lib"].flatMap((d) => walk(path.join(root, d)))) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const at = line.search(/<Pressable\b/);
        // Skip comments (the wrapper's own doc shows the broken pattern).
        if (at < 0 || /^\s*(\*|\/\/)/.test(line)) return;
        // The opening tag: through the first line that ends in `>` / `/>`
        // (not an arrow's `=>`), this one when the whole tag fits on it.
        const closes = (l: string) => /[^=]>\s*$/.test(l);
        let end = i;
        if (!closes(line.slice(at))) {
          do end++;
          while (end < lines.length - 1 && end - i < 60 && !closes(lines[end]));
        }
        const tag = lines.slice(i, end + 1).join("\n");
        if (/\bstyle=\{\s*(\(|[A-Za-z_$][\w$]*\s*=>|function\b)/.test(tag)) {
          offenders.push(`${path.relative(root, file)}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("className survives PressableScale (the animated Pressable behind every Button, Adding Flare)", () => {
  // Plain CSS stand-ins for Tailwind utilities, compiled by the same interop
  // the app runs, so the assertions do not depend on the theme's tokens.
  beforeAll(() => {
    registerCSS(
      ".tst-h { height: 40px } .tst-fill { background-color: #E63946 } .active\\:tst-dim:active { opacity: 0.7 }",
    );
  });

  it("PressableScale keeps a className fill and height, and its active: variant", () => {
    const s = render(
      <PressableScale testID="ps" className="tst-h tst-fill active:tst-dim" onPress={jest.fn()}>
        <Text>x</Text>
      </PressableScale>,
    );
    const st = flat(s.getByTestId("ps"));
    expect(st.height).toBe(40);
    expect(String(st.backgroundColor).toLowerCase()).toBe("#e63946");
    expect(st.opacity).toBeUndefined();

    fireEvent(s.getByTestId("ps"), "pressIn", {});
    expect(flat(s.getByTestId("ps")).opacity).toBeCloseTo(0.7, 3);
    expect(flat(s.getByTestId("ps")).height).toBe(40);
    fireEvent(s.getByTestId("ps"), "pressOut", {});
    expect(flat(s.getByTestId("ps")).opacity).toBeUndefined();
  });

  it("a Button keeps its className fill and height alongside the press scale", () => {
    const s = render(
      <Button testID="btn-cls" className="tst-h tst-fill" onPress={jest.fn()}>
        Go
      </Button>,
    );
    const st = flat(s.getByTestId("btn-cls"));
    expect(st.height).toBe(40);
    expect(String(st.backgroundColor).toLowerCase()).toBe("#e63946");
    expect(st.transform).toEqual([{ scale: 1 }]);
  });
});
