/**
 * Motion Rule guard (WP6, R3 MF-2 / SP-1 / SP-2 / SP-3 / MO-4): the fixes
 * cannot quietly come back. Source-level checks, like the other guard suites.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/** Source without comments, so a comment that names a banned API does not trip the guard. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const LIVE = ["components/match-flow/live/hold-to-end-button.tsx", "components/match-flow/live/state-strip.tsx"];
const SPLASH = [
  "components/ui/elo-system/splash-reveal.tsx",
  "components/ui/elo-system/splash-statement.tsx",
  "components/ui/elo-system/splash-glow-statement.tsx",
];

it("the live match fill and drain run on Reanimated, never RN Animated or a width tween", () => {
  for (const f of LIVE) {
    const src = code(f);
    expect(src).not.toMatch(/import\s*\{[^}]*\bAnimated\b[^}]*\}\s*from\s*"react-native"/);
    expect(src).not.toMatch(/useNativeDriver/);
    expect(src).not.toMatch(/\.interpolate\(/);
    expect(src).toMatch(/from "react-native-reanimated"/);
    expect(src).toMatch(/scaleX/);
  }
});

it("the splash reads Reduce Motion with useReduceMotion and runs no rAF/setState loop", () => {
  for (const f of SPLASH) {
    const src = code(f);
    expect(src).not.toMatch(/isReduceMotionEnabled/);
    expect(src).not.toMatch(/requestAnimationFrame/);
    expect(src).toMatch(/useReduceMotion\(\)/);
  }
});

it("no launch splash Moment loops", () => {
  for (const f of SPLASH) expect(code(f)).not.toMatch(/withRepeat/);
});

it("useReduceMotion lives in lib/motion; the match-flow path is only a re-export", () => {
  expect(read("lib/motion/use-reduce-motion.ts")).toMatch(/export function useReduceMotion/);
  expect(code("lib/match-flow/use-reduce-motion.ts").trim()).toMatch(/^export \{[^}]+\} from "@\/lib\/motion\/use-reduce-motion";$/);
});
