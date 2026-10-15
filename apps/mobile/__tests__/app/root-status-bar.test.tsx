/**
 * jits-mafl.2.2: on Android the status bar icons were white on the light
 * theme on every screen, because only a few screens mounted a StatusBar and
 * the rest fell back to the platform default (light icons). The root layout
 * now mounts one `ThemedStatusBar` (icons follow the APP theme) as the first,
 * lowest-priority entry of the StatusBar stack, so a full-screen dark surface
 * that mounts its own `style="light"` still wins while it is up.
 *
 * Source guard (the root layout pulls in fonts, Sentry and every bootstrap,
 * too heavy to render here); `ThemedStatusBar` itself is covered by
 * `__tests__/lib/theme/match-flow-follows-theme.test.tsx`.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");

describe("root status bar follows the app theme (jits-mafl.2.2)", () => {
  const layout = code(read("app/_layout.tsx"));

  it("mounts ThemedStatusBar inside ThemeProvider, before the navigation tree", () => {
    const provider = layout.indexOf("<ThemeProvider>");
    const bar = layout.indexOf("<ThemedStatusBar");
    expect(provider).toBeGreaterThan(-1);
    expect(bar).toBeGreaterThan(provider);
    expect(bar).toBeLessThan(layout.indexOf("<SafeAreaProvider>"));
    expect(bar).toBeLessThan(layout.indexOf("<Stack"));
  });

  it("keeps the icons light over the dark launch reveal only", () => {
    expect(layout).toMatch(/<ThemedStatusBar overMedia=\{!revealDone\} \/>/);
  });
});
