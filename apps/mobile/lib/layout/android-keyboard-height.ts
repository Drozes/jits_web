import * as React from "react";
import { Keyboard, Platform } from "react-native";

/**
 * The software keyboard's height on Android, 0 while it is hidden and always
 * 0 on iOS (jits-mafl.2 M9). With edge-to-edge on (Android 15+ no longer
 * resizes the window for the IME), a list that runs to the bottom of the
 * screen sits under the keyboard; iOS lists use
 * `automaticallyAdjustKeyboardInsets`, which Android ignores, so Android pads
 * by this instead. Only active while `enabled` (a modal that is open).
 */
export function useAndroidKeyboardHeight(enabled = true): number {
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (Platform.OS !== "android" || !enabled) {
      setHeight(0);
      return;
    }
    const show = Keyboard.addListener("keyboardDidShow", (e) => setHeight(Math.max(0, e.endCoordinates?.height ?? 0)));
    const hide = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled]);
  return height;
}
