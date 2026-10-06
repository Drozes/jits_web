import * as React from "react";
import { render } from "@testing-library/react-native";

declare const __dirname: string;
const fs = require("fs") as {
  readFileSync: (p: string, enc: string) => string;
  readdirSync: (p: string, o: { recursive: true }) => string[];
};
const path = require("path") as { join: (...p: string[]) => string };

const mockRedirect = jest.fn();
jest.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props);
    return null;
  },
}));

import FilmRoomRedirect from "@/app/(app)/film-room";
import { FILM_ROOM_HREF, MATCHES_TAB_HREF } from "@/lib/film-room/href";

const ROOT = path.join(__dirname, "..", "..");

describe("Film Room retirement (spec specs/matches-tab/spec.md 4.2, AC 7.1 and 7.2)", () => {
  it("the old route redirects to the Matches tab", () => {
    render(<FilmRoomRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: "/(app)/(tabs)/matches" });
    expect(MATCHES_TAB_HREF).toBe("/(app)/(tabs)/matches");
  });

  it("the deprecated FILM_ROOM_HREF alias also points at the tab", () => {
    expect(FILM_ROOM_HREF).toBe(MATCHES_TAB_HREF);
  });

  it("nothing outside the redirect navigates to the Film Room route", () => {
    // A route string for the retired screen ("/(app)/film-room", "/film-room")
    // anywhere in app code, or a use of the deprecated alias outside href.ts.
    const route = /["'`](\/\(app\))?\/film-room\b/;
    const offenders: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const rel of fs.readdirSync(path.join(ROOT, dir), { recursive: true })) {
        if (!/\.tsx?$/.test(rel)) continue;
        const file = `${dir}/${rel}`;
        if (file === "app/(app)/film-room.tsx" || file === "lib/film-room/href.ts") continue;
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
