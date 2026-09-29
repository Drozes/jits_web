/**
 * The highlight viewer route (jits-s6mi.4): registered as a Stack.Screen in
 * the signed-in stack beside `video/[id]` with the header hidden, reads `id`
 * and a validated `source`, and every link into it is built one way.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

declare const __dirname: string;
const fs = require("fs") as { existsSync: (p: string) => boolean; readdirSync: (p: string) => string[]; readFileSync: (p: string, e: string) => string };
const path = require("path") as { join: (...parts: string[]) => string };

const captured: { name: string; options?: Record<string, unknown> }[] = [];
let mockParams: Record<string, string | undefined> = {};

jest.mock("expo-router", () => {
  const Screen = (props: { name: string; options?: Record<string, unknown> }) => {
    captured.push(props);
    return null;
  };
  const Stack = (props: { children: React.ReactNode }) => {
    const R = require("react");
    return R.createElement(R.Fragment, null, props.children);
  };
  Stack.Screen = Screen;
  return { Stack, useLocalSearchParams: () => mockParams, useSegments: () => ["(app)", "(tabs)"] };
});
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({}) }));
jest.mock("@/lib/arena/arena-bootstrap", () => ({ ArenaBootstrap: () => null }));
jest.mock("@/components/notifications/bell-bootstrap", () => ({ BellBootstrap: () => null }));
const mockViewer = jest.fn((_p: unknown) => null);
jest.mock("@/components/highlight-viewer/viewer-screen", () => ({
  ViewerScreen: (p: unknown) => mockViewer(p),
}));

import AppLayout from "@/app/(app)/_layout";
import HighlightViewerRoute from "@/app/(app)/highlight/[id]";
import { highlightHref, parseHighlightSource } from "@/lib/highlight/discovery";

const APP_DIR = path.join(__dirname, "..", "..", "app", "(app)");

describe("highlight viewer route", () => {
  it("is registered in the (app) Stack right after video/[id], header hidden", () => {
    captured.length = 0;
    render(<AppLayout />);
    const names = captured.map((s) => s.name);
    expect(names).toContain("highlight/[id]");
    expect(names.indexOf("highlight/[id]")).toBe(names.indexOf("video/[id]") + 1);
    expect(captured.find((s) => s.name === "highlight/[id]")?.options).toEqual({ headerShown: false });
  });

  it("lives at app/(app)/highlight/[id].tsx (pushed over the tabs, not a tab)", () => {
    expect(fs.existsSync(path.join(APP_DIR, "highlight", "[id].tsx"))).toBe(true);
    expect(fs.readdirSync(path.join(APP_DIR, "(tabs)"))).not.toContain("highlight");
  });

  it.each([
    ["push", "push"],
    ["bell", "bell"],
    ["home", "home"],
    ["profile", "profile"],
    ["match_detail", "match_detail"],
    ["summary", "summary"],
    [undefined, "match_detail"],
    ["evil", "match_detail"],
  ])("passes id and source %s -> %s", (raw, expected) => {
    mockParams = { id: "h1", source: raw };
    mockViewer.mockClear();
    render(<HighlightViewerRoute />);
    expect(mockViewer).toHaveBeenCalledWith({ id: "h1", source: expected });
  });

  it("parseHighlightSource takes the first of a repeated param", () => {
    expect(parseHighlightSource(["profile", "push"])).toBe("profile");
  });

  it("highlightHref builds /highlight/<id>?source=<tag> and encodes the id", () => {
    expect(highlightHref("h1", "profile")).toBe("/highlight/h1?source=profile");
    expect(highlightHref("a/b", "home")).toBe("/highlight/a%2Fb?source=home");
  });
});

describe("component size rules (jits_web CLAUDE.md)", () => {
  const dir = path.join(__dirname, "..", "..", "components", "highlight-viewer");
  const lines = (p: string) => fs.readFileSync(p, "utf8").split("\n").length;

  it.each(fs.readdirSync(dir).filter((f) => f.endsWith(".tsx")))("%s is under 80 lines", (file) => {
    expect(lines(path.join(dir, file))).toBeLessThanOrEqual(80);
  });

  it("the route and the profile row stay small", () => {
    expect(lines(path.join(APP_DIR, "highlight", "[id].tsx"))).toBeLessThan(200);
    const profile = path.join(__dirname, "..", "..", "components", "profile");
    expect(lines(path.join(profile, "highlights-row.tsx"))).toBeLessThanOrEqual(80);
    expect(lines(path.join(profile, "highlight-tile.tsx"))).toBeLessThanOrEqual(80);
  });
});
