/**
 * Where the timekeeper-mode countdown and offline banner sit decides their
 * colours (jits-o47s.29; the brand's "over camera, video or photos" rule):
 *  - on the face-off, a themed page: TK-D7 (`tone` "themed") and TK-D9 (the
 *    default) take the theme's attention token, amber-800 in light and
 *    amber-500 in dark, with no on-media plate;
 *  - on the live screen, over the camera: TK-D7 keeps its dark plate (the
 *    default, unchanged since slice M4) and TK-D9 (`liveTimeoutChip`) sits on
 *    the on-media badge ground, the same in both themes.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

let mockScheme: "light" | "dark" = "light";
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2" }),
  useResolvedColorScheme: () => mockScheme,
}));

import { TimekeeperOfflineBanner } from "@/components/match-flow/live/timekeeper-offline-banner";
import { TimeoutChip, liveTimeoutChip } from "@/components/match-flow/faceoff/timeout-chip";
import { BROADCAST } from "@/components/match-flow/live/broadcast-tokens";
import { ON_MEDIA, paletteFor } from "@/lib/theme/palette";

const AT = new Date(Date.now() + 5 * 60_000).toISOString();
const SCHEMES = ["light", "dark"] as const;

type Screen = ReturnType<typeof render>;
const styleOf = (s: Screen, testID: string) => s.getByTestId(testID).props.style as Record<string, unknown>;
/** Every colour the subtree draws with (styles flattened to JSON). */
const colours = (s: Screen) => JSON.stringify(s.toJSON());

describe("TK-D7 (the offline banner)", () => {
  it("themed (the face-off): the theme's amber, no plate fill, in both themes", () => {
    for (const scheme of SCHEMES) {
      mockScheme = scheme;
      const s = render(<TimekeeperOfflineBanner name="J. Cruz" tone="themed" />);
      const amber = paletteFor(scheme).amber;
      const style = styleOf(s, "live-timekeeper-offline");
      expect([scheme, style.borderColor, style.backgroundColor]).toEqual([scheme, amber, "transparent"]);
      expect(colours(s)).not.toContain(BROADCAST.slab);
      expect(colours(s)).toContain(amber);
      s.unmount();
    }
    // Light and dark differ: the face-off follows the theme.
    expect(paletteFor("light").amber).not.toBe(paletteFor("dark").amber);
  });

  it("the default (the live screen): its dark plate and the on-media amber, whatever the theme", () => {
    for (const scheme of SCHEMES) {
      mockScheme = scheme;
      const s = render(<TimekeeperOfflineBanner name="J. Cruz" />);
      const style = styleOf(s, "live-timekeeper-offline");
      expect([scheme, style.borderColor, style.backgroundColor]).toEqual([scheme, BROADCAST.amber, BROADCAST.slab]);
      s.unmount();
    }
  });
});

describe("TK-D9 (the timeout chip)", () => {
  it("on the face-off (the default): the theme's amber and no fill", () => {
    for (const scheme of SCHEMES) {
      mockScheme = scheme;
      const s = render(<TimeoutChip timeoutAt={AT} />);
      const style = styleOf(s, "timeout-chip");
      expect([scheme, style.borderColor, style.backgroundColor]).toEqual([scheme, paletteFor(scheme).amber, undefined]);
      s.unmount();
    }
  });

  it("on the live screen (liveTimeoutChip): the on-media amber on the badge ground in both themes", () => {
    for (const scheme of SCHEMES) {
      mockScheme = scheme;
      const s = render(<>{liveTimeoutChip(AT)}</>);
      const style = styleOf(s, "timeout-chip");
      expect([scheme, style.borderColor, style.backgroundColor]).toEqual([scheme, ON_MEDIA.amberRule, ON_MEDIA.badge]);
      expect(JSON.stringify(s.getByTestId("timeout-chip-text").props.style)).toContain(ON_MEDIA.amber);
      s.unmount();
    }
  });
});
