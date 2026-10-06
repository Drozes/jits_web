import * as React from "react";
import { render } from "@testing-library/react-native";

declare const __dirname: string;
const fs = require("fs") as {
  readFileSync: (p: string, enc: string) => string;
  readdirSync: (p: string, o: { recursive: true }) => string[];
};
const path = require("path") as { join: (...p: string[]) => string };

const mockDismissTo = jest.fn();
const mockReplace = jest.fn();
let mockCanDismiss = true;
jest.mock("expo-router", () => {
  const R = require("react");
  return {
    useRouter: () => ({ dismissTo: mockDismissTo, replace: mockReplace, canDismiss: () => mockCanDismiss }),
    // Runs the callback on mount, as the first focus does.
    useFocusEffect: (cb: () => void) => R.useEffect(cb, [cb]),
    Redirect: () => {
      throw new Error("film-room must not render a <Redirect> (it mounts a second (tabs))");
    },
  };
});

import FilmRoomRedirect from "@/app/(app)/film-room";
import { MATCHES_TAB_HREF } from "@/lib/film-room/href";

beforeEach(() => {
  jest.clearAllMocks();
  mockCanDismiss = true;
});

const ROOT = path.join(__dirname, "..", "..");

describe("Film Room retirement (spec specs/matches-tab/spec.md 4.2, AC 7.1 and 7.2)", () => {
  it("pops back to the existing tabs on the Matches tab when the stack can dismiss (no second tab bar)", () => {
    render(<FilmRoomRedirect />);
    expect(MATCHES_TAB_HREF).toBe("/(app)/(tabs)/matches");
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith("/(app)/(tabs)/matches");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("replaces onto the Matches tab only when nothing is below to dismiss to", () => {
    mockCanDismiss = false;
    render(<FilmRoomRedirect />);
    expect(mockReplace).toHaveBeenCalledWith("/(app)/(tabs)/matches");
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it("nothing outside the redirect navigates to the Film Room route", () => {
    // A route string for the retired screen ("/(app)/film-room", "/film-room")
    // anywhere in app code, or the removed FILM_ROOM_HREF. The deep-link
    // rewrite that maps the old path to the tab is the one allowed mention.
    const route = /["'`](\/\(app\))?\/film-room\b/;
    const offenders: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const rel of fs.readdirSync(path.join(ROOT, dir), { recursive: true })) {
        if (!/\.tsx?$/.test(rel)) continue;
        const file = `${dir}/${rel}`;
        if (file === "app/(app)/film-room.tsx" || file === "lib/deep-links/system-path.ts") continue;
        const src = fs.readFileSync(path.join(ROOT, file), "utf8");
        if (route.test(src) || /\bFILM_ROOM_HREF\b/.test(src)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the match page's back fallback goes to the Matches tab", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/match-detail/match-hero.tsx"), "utf8");
    expect(src).toContain("fallback={MATCHES_TAB_HREF}");
  });
});
