import * as React from "react";
import { AccessibilityInfo } from "react-native";
import { NavigationContext } from "@react-navigation/native";
import type { UploadBannerState } from "./upload-banner-state";

/**
 * What a screen reader should hear for a state, or null for nothing.
 * Exported for tests; the hook decides WHEN.
 */
export function uploadAnnouncement(state: Pick<UploadBannerState, "kind" | "message" | "truncation" | "errorClass">): string | null {
  switch (state.kind) {
    case "uploading":
      return "Uploading match video";
    case "paused":
      return state.message ? `Upload paused. ${state.message}` : "Upload paused";
    case "uploaded":
      return state.truncation ? "Match video uploaded, but the clip stops before the end of the match" : "Match video uploaded";
    case "error":
      // An upload failure carries a class; a recorder failure is its message.
      if (state.errorClass == null) return state.message ?? "Recording unavailable";
      return state.message ? `Didn't upload. ${state.message}` : "Didn't upload";
    default:
      return null;
  }
}

/**
 * Focus without requiring a navigator (the banner also renders in tests
 * and outside a screen). Same pattern as `header-status-chip.tsx`.
 */
function useIsScreenFocused(): boolean {
  const navigation = React.useContext(NavigationContext);
  const [focused, setFocused] = React.useState(() => navigation?.isFocused() ?? true);
  React.useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}

/**
 * Screen-reader announcements for the upload status (jits-5tj9.2, deck
 * section 10.1).
 *
 * - Only on a STATE change (kind, or the failure helper, such as "Still
 *   can't upload"), never on percent ticks; the percent is on the element
 *   as a progressbar value instead.
 * - Only from the FOCUSED screen. The verdict pushes match detail over the
 *   still-mounted match screen, so two cards describe the same upload and
 *   both used to announce it.
 * - On iOS and Android alike. The cards carry no live region any more (the
 *   deck removes them), so Android needs the announcement too.
 * - Not on mount: a state that was already showing is not news.
 */
export function useUploadAnnouncements(state: UploadBannerState): void {
  const focused = useIsScreenFocused();
  const last = React.useRef<string | null>(null);
  const { kind, message, truncation, errorClass } = state;
  const key = `${kind}|${message ?? ""}`;

  React.useEffect(() => {
    const previous = last.current;
    last.current = key;
    if (previous == null || previous === key || !focused) return;
    const text = uploadAnnouncement({ kind, message, truncation, errorClass });
    if (text) AccessibilityInfo.announceForAccessibility(text);
    // `truncation` and `errorClass` only shape the sentence; they are not news.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, focused]);
}
