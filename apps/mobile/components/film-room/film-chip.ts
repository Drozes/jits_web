import type { TextStyle, ViewStyle } from "react-native";
import { ON_MEDIA } from "@/lib/theme/palette";
import { TRACKING, typeStep } from "@/lib/typography";

/**
 * The outlined chip over film: the key moment chips ("00:38 TAKEDOWN") and
 * the player's angle switcher share it. A rectangle with a 1 px light edge on
 * the near-black `ON_MEDIA.badge` ground (the on-media text ground, so the
 * `ON_MEDIA.white` label holds WCAG AA 4.5:1 even over a white frame,
 * about 16.5:1; the lighter `ON_MEDIA.tag` measured about 3.4:1, jits-3liz); the selected
 * chip inverts to the light `ON_MEDIA.text` fill with `ON_MEDIA.ink` text. Labels are
 * `font-mono-bold` caps (pass the class and `TABULAR` at the call site, so
 * the typography guard sees them).
 */
export function filmChipStyle(on: boolean): ViewStyle {
  return {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 2,
    borderWidth: 1,
    justifyContent: "center",
    borderColor: on ? ON_MEDIA.text : ON_MEDIA.strong,
    backgroundColor: on ? ON_MEDIA.text : ON_MEDIA.badge,
  };
}

/** The chip's label: caption step, caps tracking, ink when selected. */
export function filmChipLabelStyle(on: boolean): TextStyle {
  return { ...typeStep("caption"), letterSpacing: TRACKING.caps, color: on ? ON_MEDIA.ink : ON_MEDIA.white };
}
